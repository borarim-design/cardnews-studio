import type { Card, Doc } from './types';
import { getTheme, styleFromTheme } from './themes';
import { generateCards, SAMPLE_TEXT } from './autogen';

const STORAGE_KEY = 'cardnews-studio:v1';

export function uid(): string {
  return `c_${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultDoc(): Doc {
  const theme = getTheme('taptap');
  const cards = generateCards(SAMPLE_TEXT, styleFromTheme(theme.id));
  return {
    themeId: theme.id,
    ratio: '4:5',
    cards: cards.length ? cards : [emptyCard(theme.id, 'cover')],
    watermark: { on: true, text: '@your_id', position: 'bottom-left', size: 26, opacity: 0.75, color: null },
    pageNumber: { on: true, position: 'bottom-right', style: 'plain', size: 26 },
    showGuides: false,
    useBrackets: true,
  };
}

export function emptyCard(themeId: string, role: Card['role']): Card {
  return { id: uid(), role, title: '', body: '', style: styleFromTheme(themeId) };
}

/** 테마를 모든 장에 한 번에 적용한다. (사진 배경은 유지) */
export function applyTheme(doc: Doc, themeId: string): Doc {
  return {
    ...doc,
    themeId,
    cards: doc.cards.map((c) => ({
      ...c,
      style: { ...styleFromTheme(themeId), photo: c.style.photo, bgType: c.style.photo ? 'photo' : styleFromTheme(themeId).bgType },
    })),
  };
}

export function loadDoc(): Doc | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Doc;
    if (!parsed || !Array.isArray(parsed.cards) || !parsed.cards.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDoc(doc: Doc): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // 사진 data URL 이 커서 저장 공간을 넘기면 조용히 건너뛴다
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function moveCard(doc: Doc, index: number, delta: number): Doc {
  const target = index + delta;
  if (target < 0 || target >= doc.cards.length) return doc;
  const cards = doc.cards.slice();
  const [c] = cards.splice(index, 1);
  cards.splice(target, 0, c);
  return { ...doc, cards };
}
