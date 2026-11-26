import type { Card, CardStyle, Role } from './types';
import { charCount, chunkText, splitSentences } from './format';

type Block = { kind: 'p'; text: string } | { kind: 'list'; items: string[] };

const BULLET = /^\s*(?:[-*•·▶→]|\d{1,2}[.)]|[①-⑩])\s+/;

function isBullet(line: string): boolean {
  return BULLET.test(line);
}

function stripBullet(line: string): string {
  return line.replace(BULLET, '').trim();
}

function buildBlocks(text: string): Block[] {
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const blocks: Block[] = [];
  for (const para of paragraphs) {
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1 && lines.every(isBullet)) {
      blocks.push({ kind: 'list', items: lines.map(stripBullet) });
    } else if (lines.length > 1 && lines.filter(isBullet).length >= Math.ceil(lines.length * 0.6)) {
      blocks.push({ kind: 'list', items: lines.map((l) => (isBullet(l) ? stripBullet(l) : l)) });
    } else {
      blocks.push({ kind: 'p', text: lines.join('\n') });
    }
  }
  return blocks;
}

function newId(): string {
  return `c_${Math.random().toString(36).slice(2, 9)}`;
}

function makeCard(role: Role, title: string, body: string, style: CardStyle): Card {
  return {
    id: newId(),
    role,
    title: title.trim(),
    body: body.trim(),
    style: { ...style, photo: null },
  };
}

/** 표지 문단 → (제목, 리드 문장) */
function splitCover(block: Block): { title: string; body: string } {
  if (block.kind === 'list') {
    return { title: block.items[0] ?? '', body: block.items.slice(1).join('\n') };
  }
  const lines = block.text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    return { title: lines[0], body: lines.slice(1).join('\n') };
  }
  const single = lines[0] ?? '';
  const sents = splitSentences(single);
  if (charCount(single) > 70 && sents.length > 1) {
    return { title: sents[0], body: sents.slice(1).join(' ') };
  }
  return { title: single, body: '' };
}

/** 본문 문단 → 카드 (부제 + 본문) */
function bodyCards(block: Block, style: CardStyle): Card[] {
  if (block.kind === 'list') {
    const chunks: string[][] = [];
    let cur: string[] = [];
    for (const item of block.items) {
      const projected = cur.reduce((n, t) => n + charCount(t) + 2, 0) + charCount(item);
      if (cur.length >= 5 || (cur.length >= 2 && projected > 190)) {
        chunks.push(cur);
        cur = [];
      }
      cur.push(item);
    }
    if (cur.length) chunks.push(cur);
    return chunks.map((items) => makeCard('body', '', items.join('\n'), style));
  }

  const srcLines = block.text.split('\n').map((l) => l.trim()).filter(Boolean);
  let title = '';
  let rest = block.text;
  if (srcLines.length > 1 && charCount(srcLines[0]) <= 34) {
    title = srcLines[0];
    rest = srcLines.slice(1).join('\n');
  }
  const pieces = chunkText(rest, 165);
  return pieces.map((piece, i) => makeCard('body', i === 0 ? title : '', piece, style));
}

function mergeShortest(cards: Card[]): Card[] {
  const out = cards.slice();
  while (out.length > 10) {
    let bestIdx = 1;
    let bestLen = Infinity;
    for (let i = 1; i < out.length - 1; i += 1) {
      const len = charCount(out[i].body) + charCount(out[i].title);
      if (len < bestLen) {
        bestLen = len;
        bestIdx = i;
      }
    }
    const prev = out[bestIdx - 1];
    const cur = out[bestIdx];
    const joiner = prev.body || prev.title ? '\n' : '';
    prev.body = `${prev.body}${joiner}${cur.title ? cur.title + '\n' : ''}${cur.body}`.trim();
    out.splice(bestIdx, 1);
  }
  return out;
}

function padToThree(cards: Card[], style: CardStyle): Card[] {
  if (cards.length >= 3) return cards;
  if (cards.length === 2) {
    const [cover, second] = cards;
    if (cover.body) {
      return [cover, makeCard('body', '', cover.body, style), { ...second, body: second.body || second.title, title: second.body ? second.title : '' }];
    }
    const sents = splitSentences(`${second.title} ${second.body}`.trim());
    if (sents.length >= 3) {
      return [
        cover,
        makeCard('body', sents[0], sents.slice(1, -1).join(' '), style),
        makeCard('ending', sents[sents.length - 1], '', style),
      ];
    }
    return cards;
  }
  const only = cards[0];
  const sents = splitSentences(`${only.title} ${only.body}`.trim());
  if (sents.length >= 3) {
    const mid = Math.max(1, Math.floor((sents.length - 1) / 2));
    return [
      makeCard('cover', sents[0], '', style),
      makeCard('body', '', sents.slice(1, 1 + mid).join(' '), style),
      makeCard('ending', '', sents.slice(1 + mid).join(' '), style),
    ];
  }
  return cards;
}

/**
 * 긴 글·블로그 초안·메모를 한 번에 받아 표지 1장 + 본문 N장 + 엔딩 1장의
 * 3~10장 캐러셀로 나눈다.
 */
export function generateCards(rawText: string, style: CardStyle): Card[] {
  const text = rawText.replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  const blocks = buildBlocks(text);
  if (!blocks.length) return [];

  const cover = splitCover(blocks[0]);
  const cards: Card[] = [makeCard('cover', cover.title, cover.body, style)];

  for (const block of blocks.slice(1)) {
    cards.push(...bodyCards(block, style));
  }

  let out = mergeShortest(cards);
  out = padToThree(out, style);
  out = out.map((c, i) => ({
    ...c,
    role: i === 0 ? 'cover' : i === out.length - 1 ? 'ending' : 'body',
  }));
  return out;
}

export const SAMPLE_TEXT = `요즘 카드뉴스 만들 때 제일 많이 쓰는 무료 폰트 5가지 뽑아봤어요.

릴스 자막이나 카드뉴스 만들면서 "이거 무슨 폰트지?" 싶었던 순간 있죠.

1. 갈무리11
닌텐도 DS 감성의 픽셀 서체. 작은 글씨로 넣으면 분위기가 확 살아나요.

2. 페이퍼로지
카드뉴스, 매거진에서 가장 많이 쓰는 기본 중의 기본. 정보량이 많을 때 좋아요.

3. 지마켓산스
광고처럼 또렷하게 보여야 하는 제목에 딱이에요.

4. 나눔명조
웨딩, 브랜드 카드뉴스에 차분하게 어울립니다.

5. 개구체
꾸불꾸불한 손글씨로 친근한 본문을 만들 수 있어요.

저장해두고 다음 카드뉴스에 바로 써보세요.
`;
