export type Role = 'cover' | 'body' | 'ending';
export type Align = 'left' | 'center' | 'right';
export type Ratio = '4:5' | '1:1' | '9:16';
export type BgType = 'solid' | 'gradient' | 'photo';
export type GridPos =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'mid-left'
  | 'mid-center'
  | 'mid-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface PhotoAdjust {
  /** data URL (없으면 배경 사진 없음) */
  src: string;
  /** 100 = 폭을 꽉 채우는 기본 크기 */
  scale: number;
  /** -50 ~ 50 (%) */
  offsetX: number;
  offsetY: number;
  /** 0 ~ 90 (어둡게) */
  dim: number;
  /** 0 ~ 12 (px, 1080 기준) */
  blur: number;
}

export interface CardStyle {
  titleFont: string;
  bodyFont: string;
  titleWeight: number;
  bodyWeight: number;
  titleSize: number;
  bodySize: number;
  titleLineHeight: number;
  bodyLineHeight: number;
  titleLetterSpacing: number;
  bodyLetterSpacing: number;
  textColor: string;
  subColor: string;
  accent: string;
  accentText: string;
  align: Align;
  outline: boolean;
  outlineColor: string;
  outlineWidth: number;
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  bgType: BgType;
  bgSolid: string;
  gradFrom: string;
  gradTo: string;
  gradAngle: number;
  paddingX: number;
  photo: PhotoAdjust | null;
}

export interface Card {
  id: string;
  role: Role;
  title: string;
  body: string;
  style: CardStyle;
}

export interface Watermark {
  on: boolean;
  text: string;
  position: GridPos;
  size: number;
  opacity: number;
  /** null 이면 테마 색을 따른다 */
  color: string | null;
}

export interface PageNumber {
  on: boolean;
  position: GridPos;
  style: 'plain' | 'pill';
  size: number;
}

export interface Doc {
  themeId: string;
  ratio: Ratio;
  cards: Card[];
  watermark: Watermark;
  pageNumber: PageNumber;
  showGuides: boolean;
  /** 본문의 [대괄호] 구간을 강조로 해석할지 */
  useBrackets: boolean;
}

export interface ThemeStyle extends Omit<CardStyle, 'photo'> {
  paddingX: number;
}

export type Deco = 'browser' | 'frame' | 'bar' | 'rule' | 'pixel' | 'blob' | 'none';

export interface Theme {
  id: string;
  name: string;
  tagline: string;
  deco: Deco;
  style: ThemeStyle;
  /** [배경, 글자, 포인트] */
  swatch: [string, string, string];
}
