import type { CardLayout, Chip, RectShape, TextBlock } from './layout';
import { measureText } from './layout';
import { cssFont } from './fonts';
import { getImage } from './images';

type Ctx = CanvasRenderingContext2D;

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function fillRectShape(ctx: Ctx, s: RectShape) {
  ctx.save();
  roundRectPath(ctx, s.x, s.y, s.w, s.h, s.r);
  if (s.fill) {
    ctx.fillStyle = s.fill;
    ctx.fill();
  }
  if (s.stroke) {
    ctx.strokeStyle = s.stroke;
    ctx.lineWidth = s.lw ?? 2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawBackground(ctx: Ctx, lay: CardLayout) {
  const { w, h } = lay;
  if (lay.bg.type === 'gradient') {
    const theta = (lay.bg.angle * Math.PI) / 180;
    const dx = Math.sin(theta);
    const dy = -Math.cos(theta);
    const half = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;
    const cx = w / 2;
    const cy = h / 2;
    const g = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
    g.addColorStop(0, lay.bg.from);
    g.addColorStop(0.42, lay.bg.from);
    g.addColorStop(0.76, mix(lay.bg.from, lay.bg.to, 0.72));
    g.addColorStop(1, lay.bg.to);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = lay.bg.solid;
  }
  ctx.fillRect(0, 0, w, h);

  if (lay.photo) {
    const img = getImage(lay.photo.src);
    if (img) {
      const k = Math.max(w / img.naturalWidth, h / img.naturalHeight) * (lay.photo.scale / 100);
      const dw = img.naturalWidth * k;
      const dh = img.naturalHeight * k;
      const x = (w - dw) / 2 + (lay.photo.offsetX / 100) * w;
      const y = (h - dh) / 2 + (lay.photo.offsetY / 100) * h;
      ctx.save();
      if (lay.photo.blur > 0 && 'filter' in ctx) {
        ctx.filter = `blur(${lay.photo.blur}px)`;
      }
      ctx.drawImage(img, x, y, dw, dh);
      ctx.restore();
      if (lay.photo.dim > 0) {
        ctx.fillStyle = `rgba(0,0,0,${Math.min(0.92, lay.photo.dim / 100)})`;
        ctx.fillRect(0, 0, w, h);
      }
    } else {
      ctx.fillStyle = '#E7E7E7';
      ctx.fillRect(0, 0, w, h);
    }
  }
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '');
  if (m.length === 3) {
    return [parseInt(m[0] + m[0], 16), parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16)];
  }
  if (m.length === 6) {
    return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
  }
  return null;
}

function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return a;
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function drawBlock(ctx: Ctx, block: TextBlock, accent: string, accentText: string) {
  const font = cssFont(block.family, block.weight, block.size);
  const baselineOffset = block.size * 0.79;
  const padX = block.size * 0.14;
  const padY = block.size * 0.1;

  for (const line of block.lines) {
    if (line.blank) continue;
    const baseline = block.top + line.y + (line.h - block.size) / 2 + baselineOffset;
    for (const run of line.runs) {
      if (run.hl) {
        ctx.save();
        ctx.fillStyle = accent;
        const rTop = baseline - block.size * 0.82;
        roundRectPath(ctx, block.x + run.x - padX, rTop, run.w + padX * 2, block.size * 1.04, block.size * 0.16);
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.font = font;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      if (block.shadow) {
        ctx.shadowColor = block.shadow.color;
        ctx.shadowBlur = block.shadow.blur;
        ctx.shadowOffsetY = block.size * 0.05;
      }
      const color = run.hl ? accentText : block.color;
      if (block.stroke) {
        ctx.strokeStyle = block.stroke.color;
        ctx.lineWidth = block.stroke.width;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
      }
      if (Math.abs(block.ls) < 0.01) {
        if (block.stroke) ctx.strokeText(run.text, block.x + run.x, baseline);
        ctx.fillStyle = color;
        ctx.fillText(run.text, block.x + run.x, baseline);
      } else {
        let x = block.x + run.x;
        for (const ch of run.text) {
          if (block.stroke) ctx.strokeText(ch, x, baseline);
          ctx.fillStyle = color;
          ctx.fillText(ch, x, baseline);
          x += measureText(ch, font, 0) + block.ls;
        }
      }
      ctx.restore();
    }
  }
  void padY;
}

function drawChip(ctx: Ctx, chip: Chip) {
  const font = cssFont(chip.family, chip.weight, chip.size);
  ctx.save();
  if (chip.opacity !== undefined) ctx.globalAlpha = Math.max(0.05, Math.min(1, chip.opacity));
  const w = measureText(chip.text, font, 0);
  const top = chip.y;
  if (chip.bg) {
    const bx = chip.align === 'left' ? chip.x - chip.bg.padX : chip.align === 'center' ? chip.x - w / 2 - chip.bg.padX : chip.x - w - chip.bg.padX;
    const by = top - chip.bg.padY;
    const bw = w + chip.bg.padX * 2;
    const bh = chip.size * 1.14 + chip.bg.padY * 2;
    ctx.save();
    ctx.fillStyle = chip.bg.color;
    roundRectPath(ctx, bx, by, bw, bh, chip.bg.radius);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = chip.color;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = chip.align === 'center' ? 'center' : chip.align === 'right' ? 'right' : 'left';
  ctx.fillText(chip.text, chip.x, top + chip.size * 0.82);
  ctx.restore();
  ctx.restore();
}

export function drawLayout(ctx: Ctx, lay: CardLayout, scale = 1) {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, lay.w, lay.h);
  drawBackground(ctx, lay);

  for (const e of lay.ellipses) {
    ctx.save();
    ctx.fillStyle = e.fill;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, e.rx, e.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (const s of lay.rects) fillRectShape(ctx, s);
  for (const b of lay.blocks) drawBlock(ctx, b, lay.accent, lay.accentText);
  for (const c of lay.chips) drawChip(ctx, c);
  ctx.restore();
}

export function renderToCanvas(lay: CardLayout, scale = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(lay.w * scale);
  canvas.height = Math.round(lay.h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context 를 만들 수 없습니다');
  drawLayout(ctx, lay, scale);
  return canvas;
}
