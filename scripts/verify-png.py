#!/usr/bin/env python3
"""E2E 로 만들어진 PNG/ZIP 을 픽셀 단위로 검증한다."""
import sys, zipfile, io
from PIL import Image, ImageChops

OUT = 'tests/artifacts'
fails = []

def check(name, ok, detail=''):
    print(('PASS  ' if ok else 'FAIL  ') + name + (f' — {detail}' if detail else ''))
    if not ok:
        fails.append(name)

# 1) 현재 장 PNG 해상도
img = Image.open(f'{OUT}/export-current.png').convert('RGB')
check('현재 장 PNG 해상도 1080×1350', img.size == (1080, 1350), str(img.size))

# 2) 미리보기 캔버스와 내보내기 PNG 픽셀 일치
prev = Image.open(f'{OUT}/preview-canvas.png').convert('RGB')
if prev.size == img.size:
    diff = ImageChops.difference(prev, img)
    bbox = diff.getbbox()
    check('미리보기 == 내보내기 PNG (픽셀 완전 일치)', bbox is None, f'diff bbox={bbox}')
else:
    check('미리보기 == 내보내기 PNG (픽셀 완전 일치)', False, f'{prev.size} vs {img.size}')

# 3) ZIP 안의 PNG 개수·해상도
with zipfile.ZipFile(f'{OUT}/export-all.zip') as z:
    names = [n for n in z.namelist() if n.endswith('.png')]
    check('ZIP 에 모든 장 PNG 포함', len(names) >= 3, f'{len(names)}장 {names[:3]}')
    sizes = []
    for n in names:
        im = Image.open(io.BytesIO(z.read(n)))
        sizes.append(im.size)
    check('ZIP 내 PNG 모두 1080×1350', all(s == (1080, 1350) for s in sizes), str(set(sizes)))

# 4) 형광펜: 빈 줄에는 칠해지지 않는다
hl = Image.open(f'{OUT}/export-highlight.png').convert('RGB')
pix = hl.load()
ACCENT = (0xFF, 0xE0, 0x66)
W, H = hl.size
rows = []
for y in range(0, H, 2):
    n = 0
    for x in range(0, W, 4):
        r, g, b = pix[x, y]
        if abs(r - ACCENT[0]) < 12 and abs(g - ACCENT[1]) < 12 and abs(b - ACCENT[2]) < 12:
            n += 1
    if n > 8:
        rows.append(y)
if rows:
    bands = []
    start = rows[0]
    prev = rows[0]
    for y in rows[1:]:
        if y - prev > 6:
            bands.append((start, prev))
            start = y
        prev = y
    bands.append((start, prev))
    check('형광펜이 두 줄에 각각 칠해짐', len(bands) >= 2, f'bands={bands}')
    if len(bands) >= 2:
        gap = (bands[0][1], bands[1][0])
        check('두 형광펜 사이(빈 줄)에 칠해진 곳 없음', gap[1] - gap[0] > 10, f'gap={gap}')
else:
    check('형광펜이 두 줄에 각각 칠해짐', False, '강조색 픽셀 없음')

# 5) 빈 페이지가 아님(잉크 존재)
colors = hl.getcolors(maxcolors=1000000) or []
check('페이지가 비어 있지 않음', len(colors) > 50, f'{len(colors)} colors')

print()
if fails:
    print(f'{len(fails)} failed: {fails}')
    sys.exit(1)
print('all pixel checks passed')
