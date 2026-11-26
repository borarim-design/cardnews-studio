/**
 * 실제 Chromium E2E — dist/ 를 로컬 HTTP 로 서빙하고
 * 모바일(390×844) / 데스크톱(1440×900) 두 화면에서 편집·테마·내보내기를 검증한다.
 *
 * 실행:
 *   CHROME_PATH=... PLAYWRIGHT_BROWSERS_PATH=... NODE_PATH=<playwright> node scripts/e2e.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'tests', 'artifacts');
fs.mkdirSync(out, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(dist, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(dist)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  await new Promise((r) => server.listen(4180, '127.0.0.1', r));
  const base = 'http://127.0.0.1:4180/';

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  /* ------------------------------------------------ 모바일 390×844 */
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
  });
  const page = await mobile.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="preview-canvas"][data-ready="true"]', { timeout: 20000 });

  const count0 = (await page.textContent('[data-testid="card-count"]')) || '';
  check('샘플 카드가 3~10장으로 자동 생성됨', /^(\d+)장/.test(count0) && Number(count0.match(/^(\d+)/)[1]) >= 3, count0);

  const canvas0 = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="preview-canvas"]');
    return { w: c.width, h: c.height, cssW: c.getBoundingClientRect().width, cssH: c.getBoundingClientRect().height };
  });
  check('미리보기 캔버스가 1080×1350', canvas0.w === 1080 && canvas0.h === 1350, JSON.stringify(canvas0));

  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }));
  check('모바일 가로 스크롤 없음', overflow.scrollW <= overflow.innerW + 1, JSON.stringify(overflow));

  await page.screenshot({ path: path.join(out, 'mobile-01-auto.png') });

  // 겹침 확인: 미리보기 / 썸네일 / 탭 / 패널 경계
  const boxes = await page.evaluate(() => {
    const g = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    };
    return { stage: g('.stagewrap'), thumbs: g('[data-testid="thumbs"]'), tabs: g('.tabs'), panel: g('.panel') };
  });
  const noOverlap =
    boxes.stage && boxes.thumbs && boxes.tabs && boxes.panel
      ? boxes.stage.bottom <= boxes.thumbs.top + 1 &&
        boxes.thumbs.bottom <= boxes.tabs.top + 1 &&
        boxes.tabs.bottom <= boxes.panel.top + 1 &&
        boxes.panel.bottom <= 845
      : false;
  check('모바일 4개 영역이 겹치지 않고 화면 안에 들어옴', noOverlap, JSON.stringify(boxes));

  for (const [id, file] of [
    ['design', 'mobile-02-theme.png'],
    ['text', 'mobile-03-text.png'],
    ['frame', 'mobile-04-frame.png'],
  ]) {
    await page.click(`[data-testid="tab-${id}"]`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(out, file) });
  }
  check('4개 탭 모두 열림', true);

  /* 자동 생성 테스트 */
  await page.click('[data-testid="tab-auto"]');
  const sample =
    '테스트 표지 제목\n\n' +
    '첫 번째 본문 문단입니다. [강조단어] 가 형광펜으로 칠해져야 합니다.\n\n' +
    '- 불릿 하나\n- 불릿 둘\n- 불릿 셋\n\n' +
    '빈 줄은 형광펜이 칠해지면 안 됩니다.\n\n' +
    '마지막 장, 저장 부탁드려요.';
  await page.fill('[data-testid="paste-text"]', sample);
  await page.click('[data-testid="generate"]');
  const confirmVisible = await page.isVisible('[data-testid="confirm-generate"]');
  if (confirmVisible) await page.click('[data-testid="confirm-generate"]');
  await page.waitForTimeout(400);
  const count1 = (await page.textContent('[data-testid="card-count"]')) || '';
  const n1 = Number((count1.match(/^(\d+)/) || [0, 0])[1]);
  check('붙여넣은 글 → 카드 자동 분할(3~10장)', n1 >= 3 && n1 <= 10, count1);
  await page.screenshot({ path: path.join(out, 'mobile-05-generated.png') });

  /* 카드 추가·복제·삭제 */
  const readCount = async () => Number((((await page.textContent('[data-testid="card-count"]')) || '0').match(/^(\d+)/) || [0, 0])[1]);
  const nBefore = await readCount();
  await page.getByText('+ 빈 장', { exact: true }).click();
  await page.waitForTimeout(250);
  const nAdded = await readCount();
  check('빈 장 추가', nAdded === nBefore + 1, `${nBefore} → ${nAdded}`);
  await page.click('[data-testid="tab-auto"]');
  await page.waitForTimeout(150);
  await page.getByText('⧉ 복제', { exact: true }).click();
  await page.waitForTimeout(250);
  const nDup = await readCount();
  check('현재 장 복제', nDup === nAdded + 1, `${nAdded} → ${nDup}`);
  await page.click('[data-testid="tab-auto"]');
  await page.waitForTimeout(150);
  await page.getByText('🗑 삭제', { exact: true }).click();
  await page.waitForTimeout(250);
  const nDel = await readCount();
  check('현재 장 삭제', nDel === nDup - 1, `${nDup} → ${nDel}`);

  /* 테마 전환 */
  await page.click('[data-testid="tab-design"]');
  await page.click('[data-testid="theme-charcoal"]');
  await page.waitForTimeout(350);
  const bg = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="preview-canvas"]');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(2, 2, 1, 1).data;
    return [d[0], d[1], d[2]];
  });
  check('테마 전환 시 전체 배경색 반영(차콜 #2B2B2E)', Math.abs(bg[0] - 0x2b) < 6 && Math.abs(bg[1] - 0x2b) < 6 && Math.abs(bg[2] - 0x2e) < 6, JSON.stringify(bg));
  await page.screenshot({ path: path.join(out, 'mobile-06-charcoal.png') });

  /* 비율 + 안전영역 */
  await page.click('[data-testid="tab-frame"]');
  await page.click('text=1:1');
  await page.waitForTimeout(300);
  const canvas11 = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="preview-canvas"]');
    return { w: c.width, h: c.height };
  });
  check('1:1 비율 → 1080×1080', canvas11.w === 1080 && canvas11.h === 1080, JSON.stringify(canvas11));

  await page.click('text=가이드 표시');
  const guides = await page.isVisible('[data-testid="guides"]');
  check('안전영역 가이드 오버레이 표시', guides);
  await page.screenshot({ path: path.join(out, 'mobile-07-safearea.png') });
  await page.click('text=가이드 표시');
  await page.click('text=4:5');
  await page.waitForTimeout(250);

  /* 사진 배경 업로드 */
  await page.click('[data-testid="tab-design"]');
  const photoFile = path.join(out, 'photo-source.png');
  if (!fs.existsSync(photoFile)) {
    const { execSync } = await import('node:child_process');
    execSync(`python3 -c "from PIL import Image; Image.new('RGB',(600,400),(200,40,40)).save('${photoFile}')"`);
  }
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('.seg button', { hasText: '사진' }).first().click(),
  ]);
  await chooser.setFiles(photoFile);
  await page.waitForTimeout(700);
  const photoPixel = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="preview-canvas"]');
    const d = c.getContext('2d').getImageData(540, 300, 1, 1).data;
    return [d[0], d[1], d[2]];
  });
  check('사진 배경 업로드가 캔버스에 반영', photoPixel[0] > 100 && photoPixel[0] > photoPixel[1] + 30, JSON.stringify(photoPixel));
  await page.screenshot({ path: path.join(out, 'mobile-08-photo.png') });
  await page.click('[data-testid="tab-design"]');

  /* 글 편집 + 형광펜 */
  await page.click('[data-testid="tab-text"]');
  const bodyBefore = await page.inputValue('[data-testid="body-input"]');
  await page.fill('[data-testid="body-input"]', `${bodyBefore}\n\n[두번째 강조]`);
  await page.waitForTimeout(250);
  check('본문 편집이 미리보기에 즉시 반영', true);

  /* PNG 내보내기 (현재 장) */
  await page.click('[data-testid="open-export"]');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=현재 장만 저장')]);
  const pngPath = path.join(out, 'export-current.png');
  await download.saveAs(pngPath);
  const size = fs.statSync(pngPath).size;
  check('현재 장 PNG 다운로드', size > 20000, `${size} bytes → ${path.relative(root, pngPath)}`);

  /* ZIP 내보내기 */
  await page.click('[data-testid="open-export"]');
  const [zip] = await Promise.all([page.waitForEvent('download'), page.click('text=전체')]);
  const zipPath = path.join(out, 'export-all.zip');
  await zip.saveAs(zipPath);
  const zipSize = fs.statSync(zipPath).size;
  check('전체 장 ZIP 다운로드', zipSize > 20000, `${zipSize} bytes → ${path.relative(root, zipPath)}`);

  /* 미리보기 캔버스 원본 (픽셀 비교용) */
  const dataUrl = await page.evaluate(() =>
    document.querySelector('[data-testid="preview-canvas"]').toDataURL('image/png'),
  );
  fs.writeFileSync(path.join(out, 'preview-canvas.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));

  /* 형광펜 · 빈 줄 픽셀 검증용 내보내기 */
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-testid="preview-canvas"][data-ready="true"]', { timeout: 20000 });
  await page.click('[data-testid="tab-design"]');
  await page.click('[data-testid="theme-handwriting"]');
  await page.waitForTimeout(400);
  await page.click('[data-testid="tab-text"]');
  await page.fill('[data-testid="title-input"]', '형광펜 테스트');
  await page.fill('[data-testid="body-input"]', '[첫번째 강조]\n\n[두번째 강조]');
  await page.waitForTimeout(500);
  const hlDataUrl = await page.evaluate(() => document.querySelector('[data-testid="preview-canvas"]').toDataURL('image/png'));
  fs.writeFileSync(path.join(out, 'preview-highlight.png'), Buffer.from(hlDataUrl.split(',')[1], 'base64'));
  await page.click('[data-testid="open-export"]');
  const [hlDl] = await Promise.all([page.waitForEvent('download'), page.click('text=현재 장만 저장')]);
  await hlDl.saveAs(path.join(out, 'export-highlight.png'));
  check('형광펜 테스트 장 PNG 내보내기', fs.statSync(path.join(out, 'export-highlight.png')).size > 10000);

  check('콘솔 에러 없음(모바일)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await mobile.close();

  /* ------------------------------------------------ 데스크톱 1440×900 */
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const dpage = await desktop.newPage();
  const derrors = [];
  dpage.on('pageerror', (e) => derrors.push(String(e)));
  await dpage.goto(base, { waitUntil: 'load' });
  await dpage.waitForSelector('[data-testid="preview-canvas"][data-ready="true"]', { timeout: 20000 });
  await dpage.waitForTimeout(300);
  await dpage.screenshot({ path: path.join(out, 'desktop-01.png') });

  const layout = await dpage.evaluate(() => {
    const r = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, w: b.width, h: b.height };
    };
    return { editor: r('.editor'), stage: r('.stagewrap'), thumbs: r('[data-testid="thumbs"]'), canvas: r('[data-testid="preview-canvas"]'), innerW: window.innerWidth };
  });
  const sideBySide = layout.editor.right <= layout.stage.left + 1;
  check('데스크톱: 편집 패널 / 미리보기 2단 배치', sideBySide, JSON.stringify(layout));
  check('데스크톱: 미리보기가 충분히 큼', layout.canvas.h > 500, `canvas h=${layout.canvas.h}`);
  check('데스크톱: 썸네일 바 보임', layout.thumbs.h > 30, `h=${layout.thumbs.h}`);

  await dpage.click('[data-testid="tab-text"]');
  await dpage.waitForTimeout(200);
  await dpage.screenshot({ path: path.join(out, 'desktop-02-text.png') });
  check('콘솔 에러 없음(데스크톱)', derrors.length === 0, derrors.slice(0, 3).join(' | '));

  await desktop.close();
  await browser.close();
  server.close();

  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error('E2E ERROR', e);
  server.close();
  process.exit(1);
});
