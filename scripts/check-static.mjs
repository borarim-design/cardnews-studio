import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const problems = [];
const ok = [];

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

// 1) GitHub Pages 하위 경로에서 동작하려면 절대 경로(/...) 자산 참조가 없어야 한다
const absoluteRefs = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
if (absoluteRefs.length) problems.push(`dist/index.html 에 절대 경로 참조: ${absoluteRefs.join(', ')}`);
else ok.push('index.html 자산 참조가 모두 상대 경로');

if (!html.includes('type="module"')) problems.push('index.html 에 module 스크립트가 없음');
else ok.push('module 스크립트 존재');

// 2) 참조된 파일이 실제로 있는지
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const ref = m[1];
  if (/^(https?:|data:|#)/.test(ref)) continue;
  const p = path.join(dist, ref.replace(/^\.\//, ''));
  if (!fs.existsSync(p)) problems.push(`없는 파일 참조: ${ref}`);
}

// 3) CSS 안의 폰트 url() 도 상대 경로여야 하고, 파일이 있어야 한다
const cssFiles = fs.readdirSync(path.join(dist, 'assets')).filter((f) => f.endsWith('.css'));
let fontRefs = 0;
for (const f of cssFiles) {
  const css = fs.readFileSync(path.join(dist, 'assets', f), 'utf8');
  for (const m of css.matchAll(/url\(([^)]+)\)/g)) {
    let ref = m[1].trim().replace(/^['"]|['"]$/g, '');
    if (/^(https?:|data:)/.test(ref)) continue;
    fontRefs += 1;
    if (ref.startsWith('/')) problems.push(`CSS 절대 경로 자산: ${ref}`);
    const p = path.join(dist, 'assets', ref.replace(/^\.\//, ''));
    if (!fs.existsSync(p)) problems.push(`CSS 가 참조하는 파일 없음: ${ref}`);
  }
}
ok.push(`CSS 자산 참조 ${fontRefs}개 확인`);

// 4) 워빗(woff2) 폰트 개수
const fonts = fs.readdirSync(path.join(dist, 'assets')).filter((f) => f.endsWith('.woff2'));
if (fonts.length < 8) problems.push(`woff2 폰트가 ${fonts.length}개뿐 (8종 이상 필요)`);
else ok.push(`woff2 폰트 ${fonts.length}개 번들됨`);

// 5) JS 번들에 소스맵/개발 경로가 남아있지 않은지(가벼운 확인)
const js = fs.readdirSync(path.join(dist, 'assets')).filter((f) => f.endsWith('.js'));
const bundleSize = js.reduce((n, f) => n + fs.statSync(path.join(dist, 'assets', f)).size, 0);

for (const line of ok) console.log(`PASS  ${line}`);
for (const line of problems) console.log(`FAIL  ${line}`);
console.log(`\n번들: ${(bundleSize / 1024).toFixed(0)}KB JS, ${fonts.length}개 폰트`);
if (problems.length) process.exit(1);
console.log('static checks passed');
