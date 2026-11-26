import type { Doc } from './types';
import { getTheme } from './themes';
import { layoutCard, RATIO_H } from './layout';
import { drawLayout } from './render';
import { ensureFontsFor } from './fonts';
import { preloadAll } from './images';

/** 화면에 쓰이는 모든 폰트/사진을 실제로 그리기 전에 로드한다. */
export async function prepareAssets(doc: Doc): Promise<void> {
  const pairs: Array<{ family: string; weight: number }> = [];
  for (const c of doc.cards) {
    pairs.push({ family: c.style.titleFont, weight: c.style.titleWeight });
    pairs.push({ family: c.style.bodyFont, weight: c.style.bodyWeight });
  }
  pairs.push({ family: 'Pretendard', weight: 500 });
  pairs.push({ family: 'Pretendard', weight: 700 });
  await ensureFontsFor(pairs);
  await preloadAll(doc.cards.map((c) => (c.style.bgType === 'photo' && c.style.photo ? c.style.photo.src : '')));
}

export function layoutFor(doc: Doc, index: number) {
  const theme = getTheme(doc.themeId);
  const card = doc.cards[index];
  return layoutCard(card, doc, theme.deco, index, doc.cards.length);
}

/**
 * 지정한 장을 정확히 1080×H(비율별) 해상도 Canvas 로 그린다.
 * DOM 미리보기와 같은 drawLayout 을 쓰므로 화면과 결과물의 픽셀이 일치한다.
 */
export function renderCardCanvas(doc: Doc, index: number, scale = 1): HTMLCanvasElement {
  const lay = layoutFor(doc, index);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(lay.w * scale);
  canvas.height = Math.round(lay.h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context 를 만들 수 없습니다');
  drawLayout(ctx, lay, scale);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('PNG 변환에 실패했습니다'));
      }, 'image/png');
      return;
    }
    try {
      const data = canvas.toDataURL('image/png');
      const bin = atob(data.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      resolve(new Blob([bytes], { type: 'image/png' }));
    } catch (e) {
      reject(e as Error);
    }
  });
}

export async function exportCardBlob(doc: Doc, index: number): Promise<Blob> {
  await prepareAssets(doc);
  return canvasToBlob(renderCardCanvas(doc, index, 1));
}

export function exportFileName(doc: Doc, index: number): string {
  const ratio = doc.ratio.replace(':', 'x');
  return `cardnews_${ratio}_${String(index + 1).padStart(2, '0')}.png`;
}

/* --------------------------------------------------------------- 다운로드 */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 10000);
}

/** iOS Safari 등에서 다운로드가 막힐 때를 위한 새 창 열기 폴백 */
export function openBlobInNewTab(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    downloadBlob(blob, 'cardnews.png');
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* --------------------------------------------------------------- ZIP */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date = ((d.getFullYear() - 1980) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

/** 무압축(store) ZIP — PNG 는 이미 압축되어 있어 그대로 담는다. */
export function buildZip(files: Array<{ name: string; data: Uint8Array }>): Blob {
  const enc = new TextEncoder();
  const now = new Date();
  const { time, date } = dosDateTime(now);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, file.data.length, true);
    lv.setUint32(22, file.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    locals.push(local, file.data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, file.data.length, true);
    cv.setUint32(24, file.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length + file.data.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...locals, ...centrals, end] as unknown as BlobPart[], { type: 'application/zip' });
}

export async function exportAllZip(doc: Doc): Promise<Blob> {
  await prepareAssets(doc);
  const files: Array<{ name: string; data: Uint8Array }> = [];
  for (let i = 0; i < doc.cards.length; i += 1) {
    const canvas = renderCardCanvas(doc, i, 1);
    const blob = await canvasToBlob(canvas);
    const buf = await blob.arrayBuffer();
    files.push({ name: exportFileName(doc, i), data: new Uint8Array(buf) });
  }
  return buildZip(files);
}

export async function exportAllSequential(doc: Doc, onProgress?: (i: number, total: number) => void): Promise<void> {
  await prepareAssets(doc);
  for (let i = 0; i < doc.cards.length; i += 1) {
    const canvas = renderCardCanvas(doc, i, 1);
    const blob = await canvasToBlob(canvas);
    downloadBlob(blob, exportFileName(doc, i));
    onProgress?.(i + 1, doc.cards.length);
    await new Promise((r) => setTimeout(r, 350));
  }
}

export function exportSize(doc: Doc): string {
  return `1080×${RATIO_H[doc.ratio]}`;
}
