import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'tests', 'artifacts', 'cards');
fs.mkdirSync(out, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(dist, p === '/' ? 'index.html' : p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(4181, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:4181/', { waitUntil: 'load' });
await page.waitForSelector('[data-testid="preview-canvas"][data-ready="true"]', { timeout: 20000 });

const theme = process.argv[2] || '';
if (theme) {
  await page.click('[data-testid="tab-design"]');
  await page.click(`[data-testid="theme-${theme}"]`);
  await page.waitForTimeout(500);
}

const n = await page.$$eval('[data-testid^="thumb-"]', (els) => els.filter((e) => /^thumb-\d+$/.test(e.getAttribute('data-testid') || '')).length);
for (let i = 0; i < n; i += 1) {
  await page.click(`[data-testid="thumb-${i}"]`);
  await page.waitForTimeout(320);
  const url = await page.evaluate(() => document.querySelector('[data-testid="preview-canvas"]').toDataURL('image/png'));
  fs.writeFileSync(path.join(out, `${theme || 'default'}-${String(i + 1).padStart(2, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
}
console.log('cards:', n, '→', path.relative(root, out));
await browser.close();
server.close();
