import type { Align, Card, Deco, Doc, GridPos, Ratio, ThemeStyle } from './types';
import { cssFont, nearestWeight } from './fonts';
import { parseRuns } from './format';
import type { Run } from './format';

export const CANVAS_W = 1080;

export const RATIO_H: Record<Ratio, number> = { '4:5': 1350, '1:1': 1080, '9:16': 1920 };
export const RATIOS: Ratio[] = ['4:5', '1:1', '9:16'];
export const RATIO_LABEL: Record<Ratio, string> = {
  '4:5': '4:5 · 1080×1350',
  '1:1': '1:1 · 1080×1080',
  '9:16': '9:16 · 1080×1920',
};

/* ---------------------------------------------------------------- 측정 */

let measureCtx: CanvasRenderingContext2D | null = null;
function ctx2d(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    measureCtx = c.getContext('2d') as CanvasRenderingContext2D;
  }
  return measureCtx;
}

const widthCache = new Map<string, number>();

export function measureText(text: string, font: string, ls: number): number {
  if (!text) return 0;
  const key = `${font}|${ls}|${text}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  const c = ctx2d();
  c.font = font;
  let w: number;
  if (Math.abs(ls) < 0.01) {
    w = c.measureText(text).width;
  } else {
    w = 0;
    for (const ch of text) w += c.measureText(ch).width + ls;
    w -= ls;
    if (w < 0) w = 0;
  }
  if (widthCache.size > 6000) widthCache.clear();
  widthCache.set(key, w);
  return w;
}

export function clearMeasureCache(): void {
  widthCache.clear();
}

/* ---------------------------------------------------------------- 타입 */

export interface LaidRun {
  text: string;
  hl: boolean;
  x: number;
  w: number;
}

export interface LaidLine {
  runs: LaidRun[];
  w: number;
  y: number;
  h: number;
  blank: boolean;
}

export interface TextBlock {
  x: number;
  lines: LaidLine[];
  size: number;
  family: string;
  weight: number;
  ls: number;
  color: string;
  align: Align;
  height: number;
  top: number;
  stroke: { color: string; width: number } | null;
  shadow: { color: string; blur: number } | null;
}

export interface RectShape {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  fill?: string;
  stroke?: string;
  lw?: number;
}

export interface EllipseShape {
  x: number;
  y: number;
  rx: number;
  ry: number;
  fill: string;
}

export interface Chip {
  text: string;
  /** 텍스트 정렬 기준점 */
  x: number;
  y: number;
  size: number;
  weight: number;
  family: string;
  color: string;
  align: Align;
  opacity?: number;
  bg?: { color: string; radius: number; padX: number; padY: number };
}

export interface PhotoDraw {
  src: string;
  scale: number;
  offsetX: number;
  offsetY: number;
  dim: number;
  blur: number;
}

export interface CardLayout {
  w: number;
  h: number;
  deco: Deco;
  accent: string;
  accentText: string;
  bg: { type: 'solid' | 'gradient'; solid: string; from: string; to: string; angle: number };
  photo: PhotoDraw | null;
  rects: RectShape[];
  ellipses: EllipseShape[];
  blocks: TextBlock[];
  chips: Chip[];
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ---------------------------------------------------------------- 텍스트 줄바꿈 */

interface Token {
  text: string;
  hl: boolean;
  space: boolean;
}

interface BlockOpts {
  size: number;
  family: string;
  weight: number;
  ls: number;
  lineHeight: number;
  color: string;
  align: Align;
  hlOn: boolean;
  maxW: number;
  stroke: { color: string; width: number } | null;
  shadow: { color: string; blur: number } | null;
}

function tokenize(runs: Run[]): Token[] {
  const out: Token[] = [];
  for (const run of runs) {
    const parts = run.text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      out.push({ text: part, hl: run.hl, space: /^\s+$/.test(part) });
    }
  }
  return out;
}

function mergePlaced(placed: LaidRun[]): LaidRun[] {
  const out: LaidRun[] = [];
  for (const p of placed) {
    const last = out[out.length - 1];
    if (last && last.hl === p.hl && Math.abs(last.x + last.w - p.x) < 0.8) {
      last.text += p.text;
      last.w = p.x + p.w - last.x;
    } else {
      out.push({ ...p });
    }
  }
  return out;
}

function pushLine(lines: LaidLine[], placed: LaidRun[], y: number, lineH: number, maxW: number, align: Align) {
  const rawW = placed.length ? placed[placed.length - 1].x + placed[placed.length - 1].w : 0;
  const offset =
    align === 'center' ? Math.max(0, (maxW - rawW) / 2) : align === 'right' ? Math.max(0, maxW - rawW) : 0;
  const shifted = placed.map((p) => ({ ...p, x: p.x + offset }));
  lines.push({ runs: mergePlaced(shifted), w: rawW, y, h: lineH, blank: false });
}

function layoutLines(raw: string, o: BlockOpts): { lines: LaidLine[]; height: number } {
  const font = cssFont(o.family, o.weight, o.size);
  const lines: LaidLine[] = [];
  let y = 0;
  const lineH = o.size * o.lineHeight;
  const spaceW = measureText(' ', font, o.ls);

  for (const srcLine of raw.split('\n')) {
    if (srcLine.trim() === '') {
      const gap = Math.round(o.size * o.lineHeight * 0.52);
      lines.push({ runs: [], w: 0, y, h: gap, blank: true });
      y += gap;
      continue;
    }
    const tokens = tokenize(parseRuns(srcLine.replace(/\t/g, '    '), o.hlOn));
    let placed: LaidRun[] = [];
    let cursor = 0;
    let pendingSpace = false;

    const flush = () => {
      if (placed.length) {
        pushLine(lines, placed, y, lineH, o.maxW, o.align);
        y += lineH;
        placed = [];
      }
      cursor = 0;
      pendingSpace = false;
    };

    for (const tk of tokens) {
      const tw = measureText(tk.text, font, o.ls);
      if (tk.space) {
        if (placed.length) pendingSpace = true;
        continue;
      }
      const gap = pendingSpace ? spaceW : 0;
      if (placed.length && cursor + gap + tw > o.maxW) flush();
      const startGap = placed.length && pendingSpace ? spaceW : 0;
      // 공백까지 더해서 한 줄을 넘기는 경우 공백은 버린다
      if (!placed.length && startGap) cursor += startGap;
      if (tw > o.maxW && !placed.length) {
        // 한 단어가 줄 폭보다 길면 글자 단위로 쪼갠다
        let piece = '';
        for (const ch of tk.text) {
          const pw = measureText(piece + ch, font, o.ls);
          if (pw > o.maxW && piece) {
            placed.push({ text: piece, hl: tk.hl, x: cursor, w: measureText(piece, font, o.ls) });
            cursor += measureText(piece, font, o.ls);
            flush();
            piece = ch;
          } else {
            piece += ch;
          }
        }
        if (piece) {
          placed.push({ text: piece, hl: tk.hl, x: cursor, w: measureText(piece, font, o.ls) });
          cursor += measureText(piece, font, o.ls);
        }
        pendingSpace = false;
        continue;
      }
      const x = cursor + startGap;
      placed.push({ text: tk.text, hl: tk.hl, x, w: tw });
      cursor = x + tw;
      pendingSpace = false;
    }
    flush();
  }

  const height = lines.length ? lines[lines.length - 1].y + lines[lines.length - 1].h : 0;
  return { lines, height };
}

function makeBlock(
  raw: string,
  size: number,
  o: Omit<BlockOpts, 'size' | 'maxW'> & { size?: number },
  maxW: number,
  top = 0,
): TextBlock {
  const opts: BlockOpts = { ...o, size, maxW };
  const { lines, height } = layoutLines(raw.trim(), opts);
  return {
    x: 0,
    lines,
    size,
    family: o.family,
    weight: o.weight,
    ls: o.ls,
    color: o.color,
    align: o.align,
    height,
    top,
    stroke: o.stroke,
    shadow: o.shadow,
  };
}

/* ---------------------------------------------------------------- 배치 */

function contentBox(deco: Deco, padX: number, H: number): Box {
  const bottomPad = Math.round(H * 0.14);
  switch (deco) {
    case 'browser': {
      const y = 30 + 56 + 46;
      return {
        x: 36 + 54,
        y,
        w: CANVAS_W - (36 + 54) * 2,
        h: H - y - (30 + 62),
      };
    }
    case 'pixel': {
      const y = Math.round(H * 0.11) + 24;
      return { x: padX + 24, y, w: CANVAS_W - (padX + 24) * 2, h: H - y - bottomPad };
    }
    case 'bar': {
      const y = Math.round(H * 0.115);
      return { x: padX + 30, y, w: CANVAS_W - (padX + 30) * 2, h: H - y - bottomPad };
    }
    default: {
      const y = Math.round(H * 0.11);
      return { x: padX, y, w: CANVAS_W - padX * 2, h: H - y - bottomPad };
    }
  }
}

/** 제목이 너무 커서 카드 밖으로 넘치지 않도록 줄 수/높이에 맞춰 크기를 줄인다. */
function fitTitleSize(
  raw: string,
  base: number,
  maxW: number,
  maxLines: number,
  maxHeight: number,
  o: Omit<BlockOpts, 'size' | 'maxW'>,
): number {
  let size = base;
  let guard = 0;
  while (size > 34 && guard < 26) {
    const { lines, height } = layoutLines(raw.trim(), { ...o, size, maxW });
    if (lines.length <= maxLines && height <= maxHeight) return size;
    size = Math.round(size * 0.94);
    guard += 1;
  }
  return size;
}

interface ComposeResult {
  blocks: TextBlock[];
  total: number;
}

function compose(card: Card, st: ThemeStyle, box: Box, hlOn: boolean, scale: number): ComposeResult {
  const isBody = card.role === 'body';
  const baseTitle = Math.round((isBody ? st.bodySize * 1.52 : st.titleSize) * scale);
  const bodySize = Math.round(st.bodySize * scale);
  const stroke = st.outline ? { color: st.outlineColor, width: st.outlineWidth } : null;
  const shadow = st.shadow ? { color: st.shadowColor, blur: st.shadowBlur } : null;

  const common = {
    family: st.titleFont,
    weight: st.titleWeight,
    ls: st.titleLetterSpacing,
    lineHeight: st.titleLineHeight,
    color: st.textColor,
    align: st.align,
    hlOn,
    stroke,
    shadow,
  };

  const blocks: TextBlock[] = [];
  let total = 0;
  if (card.title.trim()) {
    const fit = fitTitleSize(
      card.title,
      baseTitle,
      box.w,
      isBody ? 3 : 3,
      isBody ? box.h * 0.3 : box.h * 0.44,
      common,
    );
    const b = makeBlock(card.title, fit, common, box.w);
    b.x = box.x;
    blocks.push(b);
    total += b.height;
  }
  if (card.body.trim()) {
    const b = makeBlock(
      card.body,
      bodySize,
      {
        ...common,
        family: st.bodyFont,
        weight: st.bodyWeight,
        ls: st.bodyLetterSpacing,
        lineHeight: st.bodyLineHeight,
        color: card.title.trim() ? st.subColor : st.textColor,
      },
      box.w,
    );
    b.x = box.x;
    if (blocks.length) total += Math.round(bodySize * (isBody ? 0.62 : 0.78));
    blocks.push(b);
    total += b.height;
  }
  return { blocks, total };
}

function placeBlocks(card: Card, st: ThemeStyle, box: Box, hlOn: boolean): TextBlock[] {
  let scale = 1;
  let result = compose(card, st, box, hlOn, scale);
  const limit = box.h;
  let guard = 0;
  while (result.total > limit && scale > 0.5 && guard < 18) {
    scale *= 0.93;
    result = compose(card, st, box, hlOn, scale);
    guard += 1;
  }
  // 짧은 장은 여백만 남지 않도록 글자를 조금 키운다
  if (card.role === 'body' && result.total < limit * 0.52) {
    let up = scale;
    let upGuard = 0;
    while (up < 1.34 && upGuard < 12) {
      const next = up * 1.05;
      const trial = compose(card, st, box, hlOn, next);
      if (trial.total > limit * 0.88) break;
      up = next;
      result = trial;
      upGuard += 1;
    }
    scale = up;
  }

  const isBody = card.role === 'body';
  const gap = isBody ? Math.round(st.bodySize * scale * 0.62) : Math.round(st.bodySize * scale * 0.78);
  const bias = card.role === 'cover' ? (card.body.trim() ? 0.44 : 0.5) : isBody ? 0.45 : 0.5;
  let top = box.y + Math.round((box.h - result.total) * bias);
  if (top < box.y) top = box.y;
  for (let i = 0; i < result.blocks.length; i += 1) {
    const b = result.blocks[i];
    if (i > 0) top += gap;
    b.top = top;
    top += b.height;
  }
  return result.blocks;
}

/* ---------------------------------------------------------------- 칩(워터마크·페이지) */

function chipY(pos: GridPos, h: number, margin: number, size: number): number {
  const v = pos.split('-')[0];
  if (v === 'top') return margin;
  if (v === 'mid') return Math.round(h / 2 - size / 2);
  return h - margin - size;
}

function chipX(pos: GridPos, w: number, margin: number): { x: number; align: Align } {
  const hpos = pos.split('-')[1];
  if (hpos === 'left') return { x: margin, align: 'left' };
  if (hpos === 'center') return { x: w / 2, align: 'center' };
  return { x: w - margin, align: 'right' };
}

/* ---------------------------------------------------------------- 장식 */

function decoShapes(deco: Deco, box: Box, style: ThemeStyle, H: number): { rects: RectShape[]; ellipses: EllipseShape[] } {
  const rects: RectShape[] = [];
  const ellipses: EllipseShape[] = [];
  switch (deco) {
    case 'browser': {
      // 창 전체는 얇은 테두리만 (라임 그라데이션이 그대로 보이도록)
      rects.push({ x: 30, y: 30, w: CANVAS_W - 60, h: H - 60, r: 32, stroke: 'rgba(17,17,17,0.55)', lw: 3 });
      // 상단 브라우저 바
      rects.push({ x: 30, y: 30, w: CANVAS_W - 60, h: 56, r: 28, fill: 'rgba(252,252,250,0.96)' });
      rects.push({ x: 30, y: 62, w: CANVAS_W - 60, h: 24, r: 0, fill: 'rgba(252,252,250,0.96)' });
      rects.push({ x: 30, y: 86, w: CANVAS_W - 60, h: 2, r: 0, fill: 'rgba(17,17,17,0.14)' });
      [0, 1, 2].forEach((i) => {
        ellipses.push({ x: 76 + i * 26, y: 59, rx: 6, ry: 6, fill: i === 0 ? '#FF6058' : i === 1 ? '#FFBD2E' : '#28C840' });
      });
      const addW = 320;
      const x = CANVAS_W / 2 - addW / 2;
      rects.push({ x, y: 48, w: addW, h: 22, r: 11, fill: '#E9E9E4' });
      break;
    }
    case 'pixel': {
      rects.push({ x: 20, y: 20, w: CANVAS_W - 40, h: H - 40, r: 0, stroke: '#1A1A1A', lw: 12 });
      const sq = 22;
      for (const [x, y] of [
        [20, 20],
        [CANVAS_W - 20 - sq, 20],
        [20, H - 20 - sq],
        [CANVAS_W - 20 - sq, H - 20 - sq],
      ]) {
        rects.push({ x, y, w: sq, h: sq, r: 0, fill: '#1A1A1A' });
      }
      break;
    }
    case 'rule': {
      rects.push({ x: box.x, y: box.y - 56, w: 72, h: 6, r: 3, fill: style.textColor });
      rects.push({ x: box.x, y: box.y - 26, w: box.w, h: 1, r: 0, fill: 'rgba(35,38,43,0.16)' });
      break;
    }
    case 'bar': {
      rects.push({ x: box.x - 30, y: box.y, w: 8, h: box.h, r: 4, fill: style.accent });
      rects.push({ x: box.x, y: box.y - 48, w: box.w, h: 1, r: 0, fill: 'rgba(255,255,255,0.18)' });
      break;
    }
    case 'blob': {
      ellipses.push({ x: CANVAS_W - 60, y: 90, rx: 300, ry: 300, fill: 'rgba(255,204,230,0.55)' });
      ellipses.push({ x: 40, y: H - 40, rx: 260, ry: 260, fill: 'rgba(219,254,89,0.16)' });
      rects.push({ x: 40, y: 40, w: CANVAS_W - 80, h: H - 80, r: 8, stroke: 'rgba(74,59,59,0.18)', lw: 2 });
      break;
    }
    default:
      break;
  }
  return { rects, ellipses };
}

/* ---------------------------------------------------------------- 메인 */

export function layoutCard(card: Card, doc: Doc, deco: Deco, pageIndex: number, pageTotal: number): CardLayout {
  const st = card.style;
  const H = RATIO_H[doc.ratio];
  const box = contentBox(deco, st.paddingX, H);

  const blocks = placeBlocks(card, st, box, doc.useBrackets);
  const { rects, ellipses } = decoShapes(deco, box, st, H);

  const chips: Chip[] = [];
  const chipMargin = deco === 'browser' ? 52 : 44;
  if (doc.watermark.on) {
    const size = doc.watermark.size;
    const { x, align } = chipX(doc.watermark.position, CANVAS_W, chipMargin);
    const y = chipY(doc.watermark.position, H, chipMargin, size * 1.2);
    chips.push({
      text: doc.watermark.text,
      x,
      y,
      size,
      weight: 500,
      family: 'Pretendard',
      align,
      color: doc.watermark.color ?? st.textColor,
      opacity: doc.watermark.opacity,
    });
  }
  if (doc.pageNumber.on) {
    const size = doc.pageNumber.size;
    const { x, align } = chipX(doc.pageNumber.position, CANVAS_W, chipMargin);
    const y = chipY(doc.pageNumber.position, H, chipMargin, size * 1.2);
    const text = `${pageIndex + 1}/${pageTotal}`;
    chips.push({
      text,
      x,
      y,
      size,
      weight: 700,
      family: 'Pretendard',
      align,
      color: doc.pageNumber.style === 'pill' ? st.accentText : st.textColor,
      bg:
        doc.pageNumber.style === 'pill'
          ? { color: st.accent, radius: 999, padX: size * 0.62, padY: size * 0.24 }
          : undefined,
    });
  }

  const photoSource = st.bgType === 'photo' ? st.photo : null;

  return {
    w: CANVAS_W,
    h: H,
    deco,
    accent: st.accent,
    accentText: st.accentText,
    bg: { type: st.bgType === 'gradient' ? 'gradient' : 'solid', solid: st.bgSolid, from: st.gradFrom, to: st.gradTo, angle: st.gradAngle },
    photo: photoSource
      ? {
          src: photoSource.src,
          scale: photoSource.scale,
          offsetX: photoSource.offsetX,
          offsetY: photoSource.offsetY,
          dim: photoSource.dim,
          blur: photoSource.blur,
        }
      : null,
    rects,
    ellipses,
    blocks,
    chips,
  };
}

/** UI 전용 안전 영역 가이드 (내보내기 이미지에는 포함되지 않는다) */
export function safeGuide(ratio: Ratio): { areas: Array<{ label: string; left: number; top: number; right: number; bottom: number }> } {
  const H = RATIO_H[ratio];
  if (ratio === '9:16') {
    return {
      areas: [
        { label: '상단 · 프로필/뒤로가기', left: 0, top: 0, right: 0, bottom: 12 },
        { label: '하단 · 캡션/버튼 가림', left: 0, top: 74, right: 0, bottom: 0 },
        { label: '우측 · 좋아요/저장 버튼', left: 78, top: 22, right: 0, bottom: 34 },
      ],
    };
  }
  const bottom = ratio === '1:1' ? 72 : 78;
  return {
    areas: [
      { label: '상단 · 1/N 배지', left: 62, top: 0, right: 0, bottom: 92 },
      { label: '하단 · 캡션·태그 가림', left: 0, top: bottom, right: 0, bottom: 0 },
      { label: '좌우 · 여백', left: 0, top: 0, right: 92, bottom: 0 },
    ],
  };
}
