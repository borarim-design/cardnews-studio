export interface FontDef {
  key: string;
  label: string;
  family: string;
  weights: number[];
  note: string;
}

/**
 * 실제로 이 앱에 들어 있는 무료 폰트들. video-editor 에서 확보한 원본 TTF 를
 * 한글 음절 전체(U+AC00–D7A3) + 라틴/기호로 서브셋해 woff2 로 담았다.
 */
export const FONTS: FontDef[] = [
  { key: 'pretendard', label: '프리텐다드', family: 'Pretendard', weights: [400, 700, 800], note: '가장 무난한 본문·제목 기본' },
  { key: 'gmarket', label: '지마켓산스', family: 'Gmarket Sans', weights: [500, 700], note: '광고·매거진 제목' },
  { key: 'paperlogy', label: '페이퍼로지', family: 'Paperlogy', weights: [800], note: '카드뉴스 제목, 정보량 많은 본문' },
  { key: 'cafe24', label: '카페24 써라운드', family: 'Cafe24 Ssurround', weights: [400], note: '동글동글 귀여운 제목' },
  { key: 'dohyeon', label: '도현체', family: 'Do Hyeon', weights: [400], note: '굵고 단단한 제목' },
  { key: 'galmuri', label: '갈무리11', family: 'Galmuri11', weights: [400], note: '닌텐도 DS 감성 픽셀' },
  { key: 'myeongjo', label: '나눔명조', family: 'Nanum Myeongjo', weights: [400, 700], note: '차분한 에디토리얼·웨딩' },
  { key: 'jua', label: '주아체', family: 'Jua', weights: [400], note: '말랑한 강조 제목' },
  { key: 'blackhan', label: '검은고딕', family: 'Black Han Sans', weights: [400], note: '한 줄 후킹 카피' },
  { key: 'nanumpen', label: '나눔손글씨 펜', family: 'Nanum Pen Script', weights: [400], note: '손편지 감성' },
  { key: 'maruburi', label: '마루부리', family: 'MaruBuri', weights: [400], note: '정갈한 명조 계열' },
  { key: 'gaegu', label: '개구체', family: 'Gaegu', weights: [400, 700], note: '꾸불꾸불 손글씨' },
  { key: 'bagel', label: '베이글팻원', family: 'Bagel Fat One', weights: [400], note: '영문 포인트' },
];

export const DEFAULT_FAMILY = 'Pretendard';

export function fontDef(family: string): FontDef {
  return FONTS.find((f) => f.family === family) ?? FONTS[0];
}

export function availableWeights(family: string): number[] {
  return fontDef(family).weights;
}

/** 해당 family/weight 조합이 실제로 없으면 가장 가까운 굵기로 맞춘다. */
export function nearestWeight(family: string, weight: number): number {
  const ws = availableWeights(family);
  if (ws.includes(weight)) return weight;
  return ws.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a), ws[0]);
}

export function cssFont(family: string, weight: number, size: number): string {
  return `${nearestWeight(family, weight)} ${size}px "${family}"`;
}

const loaded = new Map<string, Promise<void>>();

/** Canvas 에 글자를 그리기 전에 실제 폴백이 아닌 해당 폰트가 로드됐는지 보장한다. */
export function ensureFont(family: string, weight: number): Promise<void> {
  const w = nearestWeight(family, weight);
  const key = `${family}@${w}`;
  const hit = loaded.get(key);
  if (hit) return hit;
  const task = (async () => {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    try {
      await document.fonts.load(`${w} 48px "${family}"`, '가나다라마바사 ABC 0123');
      await document.fonts.ready;
    } catch {
      /* 폰트가 없으면 브라우저 폴백으로 그린다 */
    }
  })();
  loaded.set(key, task);
  return task;
}

export async function ensureFontsFor(pairs: Array<{ family: string; weight: number }>): Promise<void> {
  await Promise.all(pairs.map((p) => ensureFont(p.family, p.weight)));
}
