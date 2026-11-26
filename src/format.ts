/** 카드 텍스트를 그리기 단위(런)로 나누는 유틸 */

export interface Run {
  text: string;
  hl: boolean;
}

/** `[강조]` 구간을 하이라이트 런으로 분리한다. */
export function parseRuns(line: string, hlOn: boolean): Run[] {
  if (!line) return [];
  if (!hlOn) return [{ text: line, hl: false }];
  const out: Run[] = [];
  const re = /\[([^\]\n]*)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), hl: false });
    if (m[1]) out.push({ text: m[1], hl: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), hl: false });
  if (!out.length) return [{ text: line, hl: false }];
  return out;
}

export function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

/** 글자 수(이모지 포함) */
export function charCount(text: string): number {
  return Array.from(text.replace(/\s/g, '')).length;
}

const SENTENCE_END = /([.!?。！？…]|다\.|요\.|죠\.|니다\.|습니다\.)/;

/** 문장 단위로 자른다 (너무 잘게 쪼개지지 않게 최소 길이를 둔다). */
export function splitSentences(text: string): string[] {
  const flat = text.replace(/\s*\n\s*/g, ' ').trim();
  if (!flat) return [];
  const out: string[] = [];
  let buf = '';
  for (const ch of flat) {
    buf += ch;
    if (SENTENCE_END.test(buf) && buf.trim().length >= 8) {
      out.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) {
    if (out.length && buf.trim().length < 12) out[out.length - 1] += ' ' + buf.trim();
    else out.push(buf.trim());
  }
  return out;
}

/** 긴 문단을 카드 한 장에 들어갈 크기로 나눈다. */
export function chunkText(text: string, limit: number): string[] {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) {
    if (text.length <= limit * 1.6) return [text];
    const chunks: string[] = [];
    let buf = '';
    for (const ch of text) {
      buf += ch;
      if (buf.length >= limit) {
        chunks.push(buf.trim());
        buf = '';
      }
    }
    if (buf.trim()) chunks.push(buf.trim());
    return chunks;
  }
  const chunks: string[] = [];
  let buf = '';
  for (const s of sentences) {
    if (!buf) buf = s;
    else if (buf.length + s.length + 1 <= limit) buf += ' ' + s;
    else {
      chunks.push(buf);
      buf = s;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}
