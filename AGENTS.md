# AGENTS.md — Cardnews Studio (machine spec for automation agents)

> 이 문서는 **카드뉴스 자동화 AI 에이전트용 기술 명세**입니다. 사람이 읽는 설명은 [`README.md`](README.md)를 보세요.
> This document is the contract for external agents that plan, generate, render, or export card news with this repository.
> Everything below is taken from `src/` (checked 2026-11-27, `main`), not from prose. If code and this file disagree, the code wins.

- App: https://borarim-design.github.io/cardnews-studio/
- Repo: https://github.com/borarim-design/cardnews-studio
- Stack: React 19 + TypeScript + Vite 8. **Static only** — no server, no API, no auth, no network calls at runtime (fonts are bundled as local `woff2`).

---

## 0. TL;DR (fast path for an agent)

1. **You do not need the UI to produce cards.** Import `src/autogen.ts` → `generateCards(text, style)` returns `Card[]` (no DOM needed).
2. **You need a browser to rasterize.** `src/layout.ts` measures text with `document.createElement('canvas')`, and `src/render.ts` draws on a real `CanvasRenderingContext2D`.
3. **The fastest full pipeline:** build/serve the app over HTTP → inject a `Doc` JSON into `localStorage['cardnews-studio:v1']` → reload → read `canvas[data-testid="preview-canvas"]` or click `[data-testid="export-zip"]`.
4. **Canonical units:** output width is always `1080` px; height is `1350` (4:5), `1080` (1:1) or `1920` (9:16). Preview and export use the *same* layout/draw functions, so they are pixel-identical.
5. **Copy `baseStyle` (§3.6) when building a `Doc` by hand.** `themeId` alone does **not** style cards (it only selects the `deco` ornament) — every `Card.style` must be a complete `CardStyle`.

---

## 1. Overview & live URL

| Item | Value |
| --- | --- |
| Live | https://borarim-design.github.io/cardnews-studio/ |
| Source | `main` branch → build → `gh-pages` branch (no GitHub Actions workflow) |
| Nature | Pure client-side SPA; all state in the browser (`localStorage`); no backend, no upload |
| Rendering | HTML5 Canvas 2D, `1080 × H` logical pixels, upscaled by an integer-ish `scale` (default `1`) |
| Input | One long text (blog draft, memo, script) → 3–10 card carousel; or per-card manual editing |
| Output | PNG per card (`1080 × H`), all-card ZIP, or sequential PNG downloads |
| Language | UI text is Korean only; content can be any script the bundled fonts cover (Korean + Latin + punctuation) |
| Base path | `vite.config.ts` sets `base: './'` (override with `VITE_BASE_PATH`), so it also runs under a sub-path |

There is **no JSON import/export UI, no CLI, no HTTP endpoint**. Integration therefore happens in one of two ways (§7): drive the DOM/`localStorage` from a headless browser, or add a small import hook to the source.

---

## 2. Repository layout

```
src/
  main.tsx        entry: imports fonts.css, styles.css, mounts <App/>
  App.tsx         shell + state; owns Doc, autosave, export orchestration, keyboard ⌘/Ctrl+S
  types.ts        all types: Role, Align, Ratio, BgType, GridPos, PhotoAdjust, CardStyle, Card,
                  Watermark, PageNumber, Doc, ThemeStyle, Deco, Theme
  themes.ts       THEMES (6 presets) + base style + getTheme() + styleFromTheme()
  fonts.ts        FONTS (13 families), weights, nearestWeight(), cssFont(), ensureFont(s)
  format.ts       parseRuns() [bracket highlight], charCount(), splitSentences(), chunkText()
  autogen.ts      generateCards(rawText, style) → Card[] (3–10 cards) + SAMPLE_TEXT
  layout.ts       CANVAS_W, RATIO_H, layoutCard(), measureText(), safeGuide(), content boxes
  render.ts       drawLayout(ctx, layout, scale), renderToCanvas()
  export.ts       prepareAssets(), layoutFor(), renderCardCanvas(), PNG blob, ZIP builder, downloads
  doc.ts          STORAGE_KEY, defaultDoc(), emptyCard(), applyTheme(), loadDoc(), saveDoc(), moveCard()
  images.ts       photo cache, readImageFile() (≤1600px re-encode), preloadAll()
  components/     Preview.tsx, Thumbs.tsx, ExportSheet.tsx, ui.tsx, panels/{AutoPanel,ThemePanel,TextPanel,FramePanel}.tsx
  fonts.css       18 @font-face rules for the 13 families
  assets/fonts/   subsetted woff2 + LICENSE.md
scripts/
  check-static.mjs  static build sanity (relative paths, asset existence, woff2 count, bundle size)
  e2e.mjs           Playwright E2E (mobile 390×844 + desktop 1440×900), writes tests/artifacts/
  verify-png.py     Pillow pixel checks on the E2E artifacts
  snap.mjs          screenshot helper
```

---

## 3. Data schema (`src/types.ts`)

The root document type is **`Doc`** (there is no `DeckDoc`). `localStorage` stores exactly `JSON.stringify(Doc)`.

### 3.1 `Doc`

```ts
interface Doc {
  themeId: string;        // selects Theme.deco ornament + default style source; see §4.1
  ratio: Ratio;           // '4:5' | '1:1' | '9:16'
  cards: Card[];          // 1..n cards; order = carousel order
  watermark: Watermark;   // '@account' text, every card
  pageNumber: PageNumber; // '1/N' badge, every card
  showGuides: boolean;    // UI-only safe-area overlay; never drawn into PNG
  useBrackets: boolean;   // master switch for [highlight] parsing
}
```

### 3.2 `Card`

```ts
interface Card {
  id: string;      // must be unique; app generates `c_` + 7 base36 chars
  role: Role;      // 'cover' | 'body' | 'ending' — drives type scale + vertical bias
  title: string;   // '\n' allowed; '[..]' allowed when useBrackets
  body: string;    // '\n' allowed; '[..]' allowed when useBrackets
  style: CardStyle;// per-card, complete; theme changes are copied into here
}
```

`role` matters beyond semantics:

| role | title size source | title height cap | body = | vertical bias |
| --- | --- | --- | --- | --- |
| `cover` | `style.titleSize` | `0.44 × box.h`, max 3 lines | lead sentence (`subColor` when a title exists) | `0.44` with body, `0.5` without |
| `body` | `round(style.bodySize × 1.52)` (subtitle) | `0.30 × box.h`, max 3 lines | main paragraph | `0.45` |
| `ending` | `style.titleSize` | `0.44 × box.h`, max 3 lines | closing line | `0.5` |

### 3.3 `CardStyle` (all keys required at runtime)

```ts
interface CardStyle {
  titleFont: string;          // font **family**, not key: e.g. 'Gmarket Sans'  (§4.2)
  bodyFont: string;           // same
  titleWeight: number;        // 400 | 500 | 700 | 800 (snapped by nearestWeight)
  bodyWeight: number;
  titleSize: number;          // px @1080, UI range 48–150 (cover/ending)
  bodySize: number;           // px @1080, UI range 24–72 (body text, and body-card subtitles)
  titleLineHeight: number;    // 1.0–2.0
  bodyLineHeight: number;     // 1.0–2.4
  titleLetterSpacing: number; // -8..12 px
  bodyLetterSpacing: number;  // -4..8 px
  textColor: string;          // hex, titles
  subColor: string;           // hex, body text when the card also has a title
  accent: string;             // highlight background (the [bracket] fill), also pageNumber pill bg
  accentText: string;         // text color *inside* a highlight
  align: 'left' | 'center' | 'right';
  outline: boolean;           // stroke text
  outlineColor: string;
  outlineWidth: number;       // 1..16 px
  shadow: boolean;
  shadowColor: string;        // may be 8-digit hex like '#00000055'
  shadowBlur: number;         // 0..40
  bgType: 'solid' | 'gradient' | 'photo';
  bgSolid: string;            // hex
  gradFrom: string;
  gradTo: string;
  gradAngle: number;          // 0..360 deg, CSS linear-gradient convention (0 = bottom→top, 180 = top→bottom)
  paddingX: number;           // horizontal padding; used by the content box (§6.1)
  photo: PhotoAdjust | null;  // only used when bgType === 'photo'
}
```

### 3.4 `PhotoAdjust`

```ts
interface PhotoAdjust {
  src: string;    // any loadable URL; the app's builder readImageFile() keeps the original file when it is
                  // already ≤1600px and <900KB, otherwise re-encodes to ≤1600px JPEG q0.9 as a data URL
  scale: number;  // 100 = cover-fit; UI 100..320 (percent of cover size)
  offsetX: number;// -50..50 (% of canvas width, positive = right)
  offsetY: number;// -50..50 (% of canvas height, positive = down)
  dim: number;    // 0..90 → black overlay opacity dim/100
  blur: number;   // 0..14 px canvas filter
}
```

### 3.5 `Watermark`, `PageNumber`, small unions

```ts
interface Watermark {
  on: boolean;
  text: string;               // e.g. '@your_id'
  position: GridPos;
  size: number;               // 16..56 px
  opacity: number;            // 0.1..1
  color: string | null;       // null → style.textColor
}

interface PageNumber {
  on: boolean;
  position: GridPos;
  style: 'plain' | 'pill';    // pill = rounded badge filled with style.accent
  size: number;               // 16..56 px
}

type Role = 'cover' | 'body' | 'ending';
type Align = 'left' | 'center' | 'right';
type Ratio = '4:5' | '1:1' | '9:16';
type BgType = 'solid' | 'gradient' | 'photo';
type GridPos = 'top-left' | 'top-center' | 'top-right'
             | 'mid-left' | 'mid-center' | 'mid-right'
             | 'bottom-left' | 'bottom-center' | 'bottom-right';
type Deco = 'browser' | 'frame' | 'bar' | 'rule' | 'pixel' | 'blob' | 'none';
```

Notes: `'frame'` exists in the `Deco` union but **no theme uses it** and `decoShapes()` has no branch for it — it falls through to the `default` box (same as `'none'`), drawing no ornament. Page number text is `${index + 1}/${cards.length}`.

### 3.6 `baseStyle` — copy this, then override

`src/themes.ts` builds every theme as `{ ...base, ...overrides }`. This is `base` verbatim (with `photo: null` added, which is what `styleFromTheme()` returns):

```json
{
  "titleFont": "Pretendard",
  "bodyFont": "Pretendard",
  "titleWeight": 700,
  "bodyWeight": 400,
  "titleSize": 92,
  "bodySize": 42,
  "titleLineHeight": 1.22,
  "bodyLineHeight": 1.62,
  "titleLetterSpacing": -1,
  "bodyLetterSpacing": 0,
  "textColor": "#141414",
  "subColor": "#4A4A4A",
  "accent": "#141414",
  "accentText": "#DBFE59",
  "align": "center",
  "outline": false,
  "outlineColor": "#000000",
  "outlineWidth": 6,
  "shadow": false,
  "shadowColor": "#00000055",
  "shadowBlur": 18,
  "bgType": "solid",
  "bgSolid": "#FFFFFF",
  "gradFrom": "#DBFE59",
  "gradTo": "#FAFAFA",
  "gradAngle": 90,
  "paddingX": 96,
  "photo": null
}
```

To get a theme's full style in code (recommended over hand-editing): `styleFromTheme(themeId)` from `src/themes.ts`. In another language/runtime, take `THEMES[].style` from the table in §4.1 and merge onto `baseStyle`.

### 3.7 Example: complete `Doc` (2 cards, `taptap`)

Field values are real output of `defaultDoc()`/`styleFromTheme('taptap')`; ids and text are placeholders.

```json
{
  "themeId": "taptap",
  "ratio": "4:5",
  "cards": [
    {
      "id": "c_a1b2c3d",
      "role": "cover",
      "title": "무료 폰트 5가지 뽑아봤어요",
      "body": "릴스 자막 만들 때 \"이거 무슨 폰트지?\" 싶었던 순간 있죠.",
      "style": {
        "titleFont": "Gmarket Sans", "bodyFont": "Pretendard",
        "titleWeight": 700, "bodyWeight": 400,
        "titleSize": 94, "bodySize": 40,
        "titleLineHeight": 1.2, "bodyLineHeight": 1.62,
        "titleLetterSpacing": -2, "bodyLetterSpacing": 0,
        "textColor": "#141414", "subColor": "#3B4A1E",
        "accent": "#141414", "accentText": "#DBFE59",
        "align": "center",
        "outline": false, "outlineColor": "#000000", "outlineWidth": 6,
        "shadow": false, "shadowColor": "#00000055", "shadowBlur": 18,
        "bgType": "gradient", "bgSolid": "#FFFFFF",
        "gradFrom": "#DBFE59", "gradTo": "#FAFAFA", "gradAngle": 180,
        "paddingX": 92, "photo": null
      }
    },
    {
      "id": "c_e4f5g6h",
      "role": "body",
      "title": "1. 갈무리11",
      "body": "닌텐도 DS 감성의 픽셀 서체.\n작은 글씨로 넣으면 분위기가 확 살아나요.\n[저장]해두고 다음에 써보세요.",
      "style": {
        "titleFont": "Gmarket Sans", "bodyFont": "Pretendard",
        "titleWeight": 700, "bodyWeight": 400,
        "titleSize": 94, "bodySize": 40,
        "titleLineHeight": 1.2, "bodyLineHeight": 1.62,
        "titleLetterSpacing": -2, "bodyLetterSpacing": 0,
        "textColor": "#141414", "subColor": "#3B4A1E",
        "accent": "#141414", "accentText": "#DBFE59",
        "align": "center",
        "outline": false, "outlineColor": "#000000", "outlineWidth": 6,
        "shadow": false, "shadowColor": "#00000055", "shadowBlur": 18,
        "bgType": "gradient", "bgSolid": "#FFFFFF",
        "gradFrom": "#DBFE59", "gradTo": "#FAFAFA", "gradAngle": 180,
        "paddingX": 92, "photo": null
      }
    }
  ],
  "watermark": { "on": true, "text": "@your_id", "position": "bottom-left", "size": 26, "opacity": 0.75, "color": null },
  "pageNumber": { "on": true, "position": "bottom-right", "style": "plain", "size": 26 },
  "showGuides": false,
  "useBrackets": true
}
```

`defaultDoc()` uses exactly these watermark/pageNumber defaults, `ratio: '4:5'`, `themeId: 'taptap'`, and cards generated from `SAMPLE_TEXT` (8 cards in current code).

---

## 4. Available IDs, presets and constants

### 4.1 `themeId` — 6 themes (`THEMES` in `src/themes.ts`)

| `themeId` | name | tagline | `deco` | background | title font / weight | text / sub / accent |
| --- | --- | --- | --- | --- | --- | --- |
| `taptap` | 라임 탭탭 매거진 | 브라우저 창 + 라임 그라데이션 | `browser` | gradient `#DBFE59`→`#FAFAFA`, 180° | Gmarket Sans 700 (94px) | `#141414` / `#3B4A1E` / `#141414` on `#DBFE59` |
| `charcoal` | 다크 차콜 감성 | 차콜 배경 + 스카이블루 포인트 | `bar` | solid `#2B2B2E` | Cafe24 Ssurround 400 (96px) | `#F4F5F1` / `#98CFE0` / `#98CFE0` on `#23252A` |
| `editorial` | 미니멀 에디토리얼 | 밝은 회색 + 다크그레이 정돈 | `rule` | solid `#F6F7FA` | Paperlogy 800 (84px) | `#23262B` / `#4C4E4D` / `#DDE3EC` |
| `retro` | 레트로 픽셀 | 노랑 바탕 + 픽셀 서체 | `pixel` | solid `#FAED27` | Galmuri11 400 (76px, body also Galmuri11 34px) | `#1A1A1A` / `#1A1A1A` / `#1A1A1A` on `#FAED27` |
| `wedding` | 파스텔 웨딩 | 핑크 크림 그라데이션 | `blob` | gradient `#FFF0F3`→`#FFFCF6`, 160° | MaruBuri 400 (84px) | `#4A3B3B` / `#8A7373` / `#FFCCE6` |
| `handwriting` | 손글씨 다이어리 | 꾸불꾸불 손글씨 + 형광펜 | `none` | solid `#FBFBFA` | Gaegu 700 (104px, body Gaegu 400 46px) | `#1E1E1E` / `#5B5B5B` / `#FFE066` |

Full styles (fill in `baseStyle` from §3.6 with these overrides):

| themeId | titleFont | titleWeight | titleSize | bodyFont | bodySize | titleLH | bodyLH | titleLS | align | textColor | subColor | accent | accentText | bgType | bg * | grad* | paddingX |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| taptap | Gmarket Sans | 700 | 94 | Pretendard | 40 | 1.2 | 1.62 | -2 | center | #141414 | #3B4A1E | #141414 | #DBFE59 | gradient | #FFFFFF | DBFE59→FAFAFA @180 | 92 |
| charcoal | Cafe24 Ssurround | 400 | 96 | Pretendard | 40 | 1.24 | 1.62 | -1 | center | #F4F5F1 | #98CFE0 | #98CFE0 | #23252A | solid | #2B2B2E | (base) | 100 |
| editorial | Paperlogy | 800 | 84 | Pretendard | 38 | 1.26 | 1.7 | -2 | left | #23262B | #4C4E4D | #DDE3EC | #23262B | solid | #F6F7FA | (base) | 104 |
| retro | Galmuri11 | 400 | 76 | Galmuri11 | 34 | 1.34 | 1.8 | 0 | left | #1A1A1A | #1A1A1A | #1A1A1A | #FAED27 | solid | #FAED27 | (base) | 100 |
| wedding | MaruBuri | 400 | 84 | Pretendard | 38 | 1.32 | 1.72 | -1 | center | #4A3B3B | #8A7373 | #FFCCE6 | #4A3B3B | gradient | #FFFFFF | FFF0F3→FFFCF6 @160 | 104 |
| handwriting | Gaegu | 700 | 104 | Gaegu | 46 | 1.14 | 1.5 | 0 | left | #1E1E1E | #5B5B5B | #FFE066 | #1E1E1E | solid | #FBFBFA | (base) | 96 |

\* themes that do not override gradient values keep `gradFrom #DBFE59`, `gradTo #FAFAFA`, `gradAngle 90`, which is irrelevant while `bgType` is `solid`.

`swatch` (`[bg, text/accent, secondary]` per theme) is presentation metadata for the theme picker only — it does not affect rendering:
`taptap ['#DBFE59','#141414','#FAFAFA']`, `charcoal ['#2B2B2E','#98CFE0','#F4F5F1']`, `editorial ['#F6F7FA','#4C4E4D','#DDE3EC']`, `retro ['#FAED27','#1A1A1A','#FFFFFF']`, `wedding ['#FFF0F3','#FFCCE6','#4A3B3B']`, `handwriting ['#FBFBFA','#FFE066','#1E1E1E']`.

`getTheme(id)` falls back to `THEMES[0]` (`taptap`) for an unknown id — never fails.

### 4.2 `fontId` — 13 families (`FONTS` in `src/fonts.ts`)

Style fields use the **`family`** string. `key` is only an internal identifier; do not write it into `CardStyle`.

| `key` | `label` (UI) | `family` (use this) | weights | note |
| --- | --- | --- | --- | --- |
| `pretendard` | 프리텐다드 | `Pretendard` | 400, 700, 800 | 가장 무난한 본문·제목 기본 |
| `gmarket` | 지마켓산스 | `Gmarket Sans` | 500, 700 | 광고·매거진 제목 |
| `paperlogy` | 페이퍼로지 | `Paperlogy` | 800 | 카드뉴스 제목, 정보량 많은 본문 |
| `cafe24` | 카페24 써라운드 | `Cafe24 Ssurround` | 400 | 동글동글 귀여운 제목 |
| `dohyeon` | 도현체 | `Do Hyeon` | 400 | 굵고 단단한 제목 |
| `galmuri` | 갈무리11 | `Galmuri11` | 400 | 닌텐도 DS 감성 픽셀 |
| `myeongjo` | 나눔명조 | `Nanum Myeongjo` | 400, 700 | 차분한 에디토리얼·웨딩 |
| `jua` | 주아체 | `Jua` | 400 | 말랑한 강조 제목 |
| `blackhan` | 검은고딕 | `Black Han Sans` | 400 | 한 줄 후킹 카피 |
| `nanumpen` | 나눔손글씨 펜 | `Nanum Pen Script` | 400 | 손편지 감성 |
| `maruburi` | 마루부리 | `MaruBuri` | 400 | 정갈한 명조 계열 |
| `gaegu` | 개구체 | `Gaegu` | 400, 700 | 꾸불꾸불 손글씨 |
| `bagel` | 베이글팻원 | `Bagel Fat One` | 400 | 영문 포인트 |

- 13 families → 18 `@font-face` rules in `src/fonts.css` (families with two weights have two faces). All are free for commercial use, subsetted to U+AC00–D7A3 + Latin + punctuation, served from the bundle (no Google Fonts request).
- `nearestWeight(family, weight)` silently snaps an unsupported weight to the closest available one; `cssFont(family, weight, size)` produces the Canvas `font` string `${weight} ${size}px "${family}"`.
- An unknown `family` is not an error: it renders with the browser's fallback font, and `ensureFont` swallows the load failure. Validate families yourself against this table.

### 4.3 Ratios (`RATIO_H` in `src/layout.ts`)

| `ratio` | canvas | typical use |
| --- | --- | --- |
| `4:5` | `1080 × 1350` | Instagram feed default |
| `1:1` | `1080 × 1080` | square feed |
| `9:16` | `1080 × 1920` | Reels / Stories |

`CANVAS_W = 1080` is fixed. `RATIO_LABEL` strings (used in UI): `4:5 · 1080×1350`, `1:1 · 1080×1080`, `9:16 · 1080×1920`.

Some helpers export static constants: `CANVAS_W`, `RATIO_H`, `RATIOS` (`['4:5','1:1','9:16']`), `RATIO_LABEL`.

---

## 5. Text markup and auto-generation rules

### 5.1 `[강조]` highlight (`parseRuns` in `src/format.ts`)

```ts
parseRuns(line: string, hlOn: boolean): Run[]   // Run = { text: string; hl: boolean }
```

- Regex: `/\[([^\]\n]*)\]/g` — matches `[` + any chars except `]`/newline + `]`. No nesting, no escaping, no markdown.
- `hlOn` is `doc.useBrackets`; when false the whole line is one `hl: false` run and brackets are printed literally.
- `[]` (empty) produces no run (the empty capture is skipped, so the brackets vanish and nothing is highlighted).
- Unmatched `[` or `]` stays as literal text.
- A span cannot cross a newline; write `[첫 줄` / `둘째 줄]` as two separate spans if needed.
- Applies to **both** `title` and `body`.
- Rendered as a rounded rectangle behind the run: height `size × 1.04`, radius `size × 0.16`, horizontal padding `size × 0.14`, top at `baseline − size × 0.82`; the text inside switches to `style.accentText`, everything else uses `textColor`/`subColor`.

### 5.2 Newlines, blank lines, tabs (`layoutLines` in `src/layout.ts`)

- `\n` = hard line break. Each source line is wrapped independently; wrapping is word-based on whitespace, with character-level splitting for a single word wider than the line.
- A blank line (a line whose `trim()` is empty) becomes a **gap** of `round(fontSize × lineHeight × 0.52)` px. The gap has no runs, so **no highlight is painted there** (a deliberate fix for highlighters that smear over empty lines).
- Multiple consecutive blank lines → multiple gaps (same size each).
- `\t` is expanded to 4 spaces before layout.
- Leading/trailing whitespace of each line is not trimmed inside layout; `makeBlock` trims the whole block once. Trailing spaces are collapsed by the tokenizer.
- Colors: when a card has both title and body, the body uses `subColor`; with no title, the body uses `textColor`.

### 5.3 `charCount`

`Array.from(text.replace(/\s/g, '')).length` — whitespace-insensitive character count (emoji count as one codepoint). All the chunking limits below use this unit.

### 5.4 `generateCards(rawText, style)` — text → 3–10 cards

Signature: `generateCards(rawText: string, style: CardStyle): Card[]` (`src/autogen.ts`). It is DOM-free and can run in Node. All produced cards share the **same** style object (with `photo: null`); `style` is typically `styleFromTheme(doc.themeId)`.

Pipeline:

1. **Normalize** — `\r\n|\r` → `\n`, `3+` newlines → `2` newlines, trim. Empty text → `[]`.
2. **Paragraph blocks** — split on `\n{2,}` (`buildBlocks`). Inside a paragraph, split on `\n`:
   - all lines (≥2) are bullets → `list` block;
   - ≥ `ceil(lines × 0.6)` lines are bullets → `list` block (non-bullets kept as items);
   - otherwise → `p` block with `\n` preserved.
   - Bullet regex: `^\s*(?:[-*•·▶→]|\d{1,2}[.)]|[①-⑩])\s+`
3. **Cover** from the first block (`splitCover`):
   - `list` → first item = title, remaining items joined with `\n` = body;
   - multi-line paragraph → first line = title, rest = body;
   - one line, `charCount > 70`, more than one sentence → first sentence = title, remaining sentences = body;
   - otherwise the whole line = title, empty body.
4. **Body cards** for each later block (`bodyCards`):
   - `list` → items grouped into chunks of at most **5** items, or split when adding an item would push the projected length (`sum(chars) + 2 per item`) over **190**; each chunk = one `body` card with empty title and `\n`-joined items (bullets are rendered as plain text; the bullet glyph is stripped).
   - `p` → if it has more than one line and the first line is ≤ **34** chars, that line becomes the card's `title` (subtitle) and the remainder is chunked; otherwise the whole paragraph is chunked. Chunking uses `chunkText(rest, 165)`: sentence-aware greedy packing to ≤ **165** chars per card; a text with no sentence breakers is cut every 165 raw chars, and a single-sentence text ≤ `165 × 1.6 = 264` chars stays whole.
5. **Merge down to 10** (`mergeShortest`): while there are more than 10 cards, merge the interior card with the smallest `charCount(title)+charCount(body)` into the card **before** it (title then body, joined by `\n`).
6. **Pad up to 3** (`padToThree`): 2 cards → split the cover's lead sentence into a body card, or split the second card's sentences into a body + ending; 1 card → split its sentences into cover/body/ending. If there are not enough sentences, the card count may stay at 1 or 2 (so treat "3–10" as the normal range, not a guarantee).
7. **Assign roles by position**: index 0 → `cover`, last → `ending`, the rest → `body`. This overwrites any earlier role.

Sentence splitting (`splitSentences`): ends on `. ! ? 。 ！ ？ …` or `다. 요. 죠. 니다. 습니다.`, minimum 8 chars per sentence; a trailing fragment shorter than 12 chars is appended to the previous sentence. Total length is not capped — the layout auto-shrinks text instead (§6.2).

`SAMPLE_TEXT` is the built-in demo article used by `defaultDoc()` and the “예시 글” button.

---

## 6. Rendering and export pipeline

```
Doc ──layoutCard(card, doc, theme.deco, index, total)──▶ CardLayout (pure data: backgrounds, shapes, laid-out lines, chips)
CardLayout ──drawLayout(ctx, layout, scale)──▶ pixels (preview canvas and export canvas use the same call)
```

### 6.1 `layoutCard` (`src/layout.ts`)

```ts
layoutCard(card: Card, doc: Doc, deco: Deco, pageIndex: number, pageTotal: number): CardLayout
```

`CardLayout` fields: `{ w, h, deco, accent, accentText, bg, photo, rects[], ellipses[], blocks[], chips[] }`.

1. `H = RATIO_H[doc.ratio]`; **content box** depends on `deco` and `style.paddingX`, with `bottomPad = round(H × 0.14)`:

   | deco | x | y | w | h |
   | --- | --- | --- | --- | --- |
   | `browser` | `36 + 54 = 90` | `30 + 56 + 46 = 132` | `900` | `H − 224` |
   | `pixel` | `paddingX + 24` | `round(H × 0.11) + 24` | `1080 − 2(paddingX+24)` | `H − y − bottomPad` |
   | `bar` | `paddingX + 30` | `round(H × 0.115)` | `1080 − 2(paddingX+30)` | `H − y − bottomPad` |
   | others (`rule`, `blob`, `none`, `frame`) | `paddingX` | `round(H × 0.11)` | `1080 − 2·paddingX` | `H − y − bottomPad` |

   For `4:5` (`H = 1350`) `bottomPad = 189`; e.g. `taptap` browser box = `x 90, y 132, w 900, h 1126`.
2. Text blocks are built title-first, body second. Title base size = `titleSize` for `cover`/`ending`, `round(bodySize × 1.52)` for `body`, then multiplied by a fit `scale`.
3. `fitTitleSize` shrinks the title by ×0.94 until it fits in ≤ 3 lines and ≤ `0.30·box.h` (body) / `0.44·box.h` (cover/ending), floor 34px, max 26 iterations.
4. `placeBlocks` shrinks **everything** by ×0.93 while total content height > `box.h` (guard 18 iterations, floor scale 0.5). If a `body` card uses < 52% of the box, it grows the text by ×1.05 steps up to ×1.34, stopping when content would exceed 88%.
5. Blocks are vertically positioned by `bias` of the leftover space (`cover` with body 0.44, `cover`/`ending` without 0.5, `body` 0.45); inter-block gap = `round(bodySize × scale × 0.78)` for cover/ending, `× 0.62` for body.
6. Ornaments (`decoShapes`): `browser` = window border + title bar + 3 dots + URL pill; `pixel` = 12px black frame + 4 corner squares; `rule` = short bar + hairline above the text box; `bar` = 8px accent bar left of the box + hairline; `blob` = two translucent ellipses + thin inner frame; `none`/`frame` = nothing.
7. Chips: watermark (`weight 500`, Pretendard) then page number (`weight 700`, Pretendard, pill uses `accent`/`accentText`). Margin from edge: `52` when `deco === 'browser'`, else `44`. `chipX`: left → `margin`, center → `w/2` (centered alignment), right → `w − margin`. `chipY` uses `h − margin − size` for `bottom-*`, `h/2 − size/2` for `mid-*`, `margin` for `top-*` (with `size = watermark.size × 1.2`).

`measureText` caches widths in a module-level `Map`; `clearMeasureCache()` empties it. Widths are measured with a hidden 8×8 canvas — **this requires a DOM**.

`safeGuide(ratio)` returns the Instagram safe-area rectangles used only by the UI overlay.

### 6.2 `drawLayout` (`src/render.ts`)

```ts
drawLayout(ctx: CanvasRenderingContext2D, lay: CardLayout, scale = 1): void
renderToCanvas(lay: CardLayout, scale = 1): HTMLCanvasElement
```

Draw order (after `ctx.setTransform(scale,0,0,scale,0,0)` and `clearRect`):

1. **Background** — solid fill, or a linear gradient across the canvas diagonal extent with stops `0: from`, `0.42: from`, `0.76: mix(from,to,0.72)`, `1: to`. Angle uses the CSS convention: `dx = sin(θ)`, `dy = −cos(θ)`, so `0°` = bottom→top and `180°` = top→bottom.
2. **Photo** (if `bgType === 'photo'` and `photo` present) — cover-fit `k = max(w/iw, h/ih) × scale/100`, centered plus `offsetX/Y` percentages, optional `ctx.filter = blur(px)`, then a black overlay at `dim/100` (clamped to 0.92). If the image is not in the cache yet, a `#E7E7E7` placeholder is painted — **preload before export** (`prepareAssets`).
3. **Ellipses**, then **rounded rects** (`roundRect` with a manual fallback).
4. **Text blocks** — per line, per run: highlight rect first, then `strokeText` (if outline) and `fillText`, honoring `letterSpacing` char-by-char and `shadowColor/shadowBlur/shadowOffsetY = size × 0.05`.
5. **Chips** — optional alpha (clamped 0.05–1), optional rounded background (pill), then text.

### 6.3 Fonts must be loaded before drawing

```ts
ensureFont(family: string, weight: number): Promise<void>
ensureFontsFor(pairs: Array<{ family: string; weight: number }>): Promise<void>
ensureFontsFor → document.fonts.load(`${nearestWeight} 48px "${family}"`, '가나다라마바사 ABC 0123') + document.fonts.ready
```

Canvas falls back silently if a face is not loaded, producing wrong metrics. `prepareAssets(doc)` (`src/export.ts`) loads every card's title/body font pair, plus `Pretendard 500` and `700` (watermark/page chip), then preloads every photo `src`. **Always `await prepareAssets(doc)` before reading or exporting a canvas.** The UI preview does this and sets `data-ready="true"` on the canvas when done.

### 6.4 Export (`src/export.ts`)

| Function | Result |
| --- | --- |
| `layoutFor(doc, index)` | `CardLayout` for one card using `getTheme(doc.themeId).deco` |
| `renderCardCanvas(doc, index, scale = 1)` | `HTMLCanvasElement` of `1080×H × scale` |
| `canvasToBlob(canvas)` | `Promise<Blob>` `image/png` (falls back to `toDataURL` decoding) |
| `exportCardBlob(doc, index)` | `prepareAssets` + render + PNG blob (exactly `1080×H`) |
| `exportFileName(doc, index)` | `cardnews_{ratio with ':'→'x'}_{index+1 padded to 2}.png` → `cardnews_4x5_01.png` |
| `exportAllZip(doc)` | every card rendered at scale 1, packed into one ZIP |
| `exportAllSequential(doc, onProgress?)` | downloads each PNG with 350 ms spacing |
| `buildZip(files)` | **stored (no compression)** ZIP, UTF-8 names, CRC32 — PNGs are already compressed |
| `exportSize(doc)` | `1080×H` string |
| `downloadBlob(blob, name)` / `openBlobInNewTab(blob)` | anchor download / iOS “open in new tab” fallback |

The ZIP file name is composed in `App.tsx`: `cardnews_{ratio}_{n}장.zip`. Entries inside the ZIP always use `exportFileName()`.

### 6.5 Persistence (`src/doc.ts`)

- Key: **`cardnews-studio:v1`** in `localStorage`, value `JSON.stringify(Doc)`.
- `loadDoc()` returns `null` unless parsed JSON has a non-empty `cards` array; it performs **no schema migration or field validation** beyond that.
- `saveDoc()` swallows quota errors (large photo data URLs can exceed ~5 MB), so an injected doc with big images may not persist — render it in the same page load.
- `App.tsx` autosaves with a 400 ms debounce on every `doc` change; the keyboard shortcut `⌘/Ctrl + S` exports the current card.
- Other doc helpers: `defaultDoc()`, `emptyCard(themeId, role)`, `applyTheme(doc, themeId)` (replaces every card's style with the theme style but keeps each card's `photo` and sets `bgType: 'photo'` when a photo exists), `moveCard(doc, index, delta)`, `uid()`.

---

## 7. How an automation agent can integrate

Two production-grade routes. Both assume the app is served over **http(s)** — opening `dist/index.html` via `file://` is blocked by CORS for ES modules and fonts.

### 7.1 Route A — headless browser + `localStorage` injection (no code change)

Because the whole document is a JSON blob in `localStorage`, an agent can drive the app without adding any interface.

**DOM contract (`data-testid`)** — panels only exist while their tab is active, so click the tab first:

| Selector | Element | Notes |
| --- | --- | --- |
| `[data-testid="tab-auto"]`, `tab-design`, `tab-text`, `tab-frame` | tab buttons | `panel-{tab}` is the active panel container |
| `[data-testid="paste-text"]` | textarea | raw text input for auto-generation |
| `[data-testid="generate"]` | button | runs `generateCards`; disabled when the textarea is empty |
| `[data-testid="confirm-generate"]` | button | appears only when existing cards have content (replace confirmation) |
| `[data-testid="theme-grid"]`, `[data-testid="theme-{themeId}"]` | buttons | one per `themeId`; applies `applyTheme` to all cards |
| `[data-testid="title-input"]`, `body-input` | textareas | current card's title/body (newlines and `[ ]` are literal input) |
| `[data-testid="title-font"]`, `body-font` | `<select>` | option value = font **family** |
| `[data-testid="photo-input"]` | hidden `<input type="file">` | usable with Playwright `setInputFiles` |
| `[data-testid="watermark-input"]` | `<input type="text">` | watermark text |
| `[data-testid="preview-canvas"]` | `<canvas width=1080 height=H>` | full-size render of the **current** card; `data-ready="true"` after assets load |
| `[data-testid="card-frame"]`, `guides` | wrappers | safe-area overlay when `showGuides` |
| `[data-testid="thumbs"]`, `[data-testid="thumb-{i}"]` | buttons | thumbnail index `i` is 0-based; clicking selects the card |
| `[data-testid="thumb-add"]` | button | append an empty body card |
| `[data-testid="open-export"]` | header button | opens the export sheet (its buttons have **no** testids) |
| `[data-testid="export-current"]`, `export-zip`, `export-seq` | buttons in the `frame` panel | trigger downloads |
| `[data-testid="card-count"]`, `stage-meta`, `toast` | text | status readouts |

**Recipe 1 — inject a `Doc` and export every card as PNG**

```js
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const BASE = 'https://borarim-design.github.io/cardnews-studio/'; // or http://127.0.0.1:4180/
const doc = { /* complete Doc JSON, see §3.7 */ };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
page.on('console', (m) => m.type() === 'error' && console.error('page error:', m.text()));

await page.goto(BASE);                                              // 1) establish the origin
await page.evaluate((d) => localStorage.setItem('cardnews-studio:v1', JSON.stringify(d)), doc); // 2) inject
await page.reload();                                                // 3) boot with the injected doc
await page.waitForSelector('[data-testid="preview-canvas"][data-ready="true"]', { timeout: 30000 });

// Full-resolution, pixel-exact captures (same renderer as export)
const { width, height } = await page.evaluate(() => {
  const c = document.querySelector('[data-testid="preview-canvas"]');
  return { width: c.width, height: c.height };                     // 1080 × 1350 for 4:5
});

for (let i = 0; i < doc.cards.length; i += 1) {
  await page.click(`[data-testid="thumb-${i}"]`);
  await page.waitForTimeout(250);                                   // fonts/images already cached; redraw is quick
  const dataUrl = await page.evaluate(() =>
    document.querySelector('[data-testid="preview-canvas"]').toDataURL('image/png'));
  await fs.writeFile(`card_${String(i + 1).padStart(2, '0')}.png`,
    Buffer.from(dataUrl.split(',')[1], 'base64'));
}
```

**Recipe 2 — one deterministic ZIP of all cards (preferred for batch jobs)**

```js
await page.click('[data-testid="tab-frame"]');
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.click('[data-testid="export-zip"]'),
]);
await download.saveAs('cardnews.zip');   // entries: cardnews_4x5_01.png, cardnews_4x5_02.png, ...
```

`export-current` (`[data-testid="export-current"]`) exports **the selected card** — select with `thumb-{i}` first and you get `cardnews_{ratio}_{NN}.png` at exactly `1080×H`. `export-seq` downloads every card one by one (350 ms apart) and is easier to miss in automation; `export-zip` is the reliable bulk path.

**Recipe 3 — text → cards, no JSON at all**

```js
await page.click('[data-testid="tab-auto"]');
await page.fill('[data-testid="paste-text"]', articleText);
await page.click('[data-testid="generate"]');
if (await page.$('[data-testid="confirm-generate"]')) await page.click('[data-testid="confirm-generate"]');
await page.click('[data-testid="tab-design"]');
await page.click('[data-testid="theme-charcoal"]');   // optional: theme everything
```

Caveats for Route A:

- The app autosaves 400 ms after each change — if you inject and *do not* reload, the old in-memory doc can overwrite your value. `page.evaluate(setItem)` → `reload()` avoids this.
- An injected doc that fails the `cards` array check is silently replaced by `defaultDoc()` (sample content); assert `[data-testid="card-count"]` after load.
- The preview canvas shows only the current card; thumbnails are 0.09-scale canvases.
- Fonts are local files: on the GitHub Pages host they load from the same origin, so no extra network egress is needed.
- Generated PNG is exactly `1080 × H` only at scale 1 (the app always uses 1). Do not pass `scale` to exports if you need the exact size.

### 7.2 Route B — reuse the modules / add a JSON import hook (code change)

What is importable where (this decides whether you need a browser):

| Module | DOM needed? | Use it for |
| --- | --- | --- |
| `src/format.ts` | no | sentence/chunk splitting, char counts — pure text |
| `src/autogen.ts` | no | `generateCards(text, style)` → `Card[]` (server-side planning OK) |
| `src/themes.ts` | no | `THEMES`, `getTheme(id)`, `styleFromTheme(id)` |
| `src/fonts.ts` | partially | data tables are pure; `ensureFont` needs `document.fonts` |
| `src/doc.ts` | partially | `defaultDoc`, `emptyCard`, `applyTheme`, `moveCard` pure; `load/saveDoc` need `localStorage` |
| `src/layout.ts` | **yes** | `measureText` uses a hidden canvas |
| `src/render.ts` | **yes** | Canvas 2D + `Image` |
| `src/export.ts` | **yes** | rendering, PNG, ZIP |

So an external agent can plan a deck in plain Node/Python terms using the §5 rules and `THEMES`, but rasterization must happen in a browser (or a `node-canvas`-style polyfill that provides `document.createElement('canvas')`, `document.fonts`, `Image`, and `canvas.toBlob`).

To add a first-class import interface, touch exactly these places:

1. **`src/doc.ts`** — next to `loadDoc`/`saveDoc`, add a normalizer, e.g.
   `export function parseDoc(raw: unknown): Doc | null` that validates `ratio ∈ RATIOS`, `cards.length ≥ 1`, each card has `id/role/title/body/style`, fills missing `watermark`/`pageNumber`/`showGuides`/`useBrackets` from `defaultDoc()`, dedupes ids, and returns `null` on failure. Keep `STORAGE_KEY` as the single source of the version tag.
2. **`src/App.tsx`** — the initial state line
   `const [doc, setDoc] = useState<Doc>(() => loadDoc() ?? defaultDoc());`
   is the single mounting point. Wrap it: `parseDoc(fromUrl()) ?? loadDoc() ?? defaultDoc()`, and add a `useEffect` that clears the query/hash after import if you do not want it re-applied on reload.
3. **URL surface (optional)** — `?doc=<base64url(JSON)>`, or the friendlier `?text=<urlencoded>&theme=<themeId>&ratio=4:5`, which calls `generateCards(text, styleFromTheme(themeId))` and builds a `Doc` around the result. `src/main.tsx` only mounts `<App/>`; no routing exists, so read `window.location.search` in `App.tsx` (or in `doc.ts` as a helper) rather than adding a router.
4. **If you add a real API route**, keep the app static: render on the client and return PNG bytes from a headless browser, or re-implement `drawLayout` in the caller. Editing `layout.ts`/`render.ts` is only needed if you change the visual contract — which would invalidate the “preview = export” guarantee in `scripts/verify-png.py`.
5. **Type safety** — `Doc`/`CardStyle` are compile-time only; there is no JSON schema file yet. If you need one, generate it from `src/types.ts` rather than hand-writing it, and keep the exhaustive `CardStyle` key list in sync (the renderer reads every key unconditionally; a missing key yields `undefined` sizes and NaN geometry).

### 7.3 Recommended shape for an external pipeline

```
content (LLM) ──▶ Doc JSON  (build cards: §3, split text: §5.4, style: §4)
              ──▶ localStorage injection (Route A)  ──▶ preview canvas / export-zip
              ──▶ PNG files (1080×1350)  ──▶ Instagram uploader
```

Keep the `Doc` as the single intermediate artifact: it is complete, portable, and re-renderable — no need to re-run text splitting once it exists, and no need to touch the UI for styling.

---

## 8. Build & verification commands

```bash
npm install          # React 19, Vite 8, TypeScript 5.9 (playwright is NOT a dependency)
npm run dev          # http://localhost:5180
npm run typecheck    # tsc -b --pretty false
npm run build        # tsc -b && vite build → dist/ (relative asset paths)
npm run preview      # serve dist/ at http://localhost:4180
npm run check:static # node scripts/check-static.mjs — reads dist/, so build first
npm run e2e          # node scripts/e2e.mjs — serves dist/ on 127.0.0.1:4180 and drives Chromium
python3 scripts/verify-png.py  # Pillow checks on tests/artifacts/ produced by e2e
```

- `check:static` asserts: no absolute asset refs in `dist/index.html`, referenced files exist, `type="module"` present, CSS `url()` refs are relative and exist, ≥ 8 `woff2` files (currently 13 families → 18 faces, subset per family), and reports bundle size.
- `e2e` needs `playwright` resolvable and a Chromium binary: `npm i -D playwright && npx playwright install chromium`, then run with `CHROME_PATH=<chromium>` (optionally `PLAYWRIGHT_BROWSERS_PATH`). It writes screenshots/PNGs/ZIP to `tests/artifacts/` and checks mobile 390×844 + desktop 1440×900 layouts, zero console errors.
- `verify-png.py` re-checks the artifacts: 1080×1350 resolution, preview canvas == exported PNG pixel-for-pixel, ZIP contains all cards, and blank lines are not highlighted.

Deployment is a manual `dist/` + `.nojekyll` push to the `gh-pages` branch. **Documentation-only changes on `main` do not need a redeploy.**

---

## 9. Invariants and gotchas

- **Preview = export.** One `CardLayout` producer and one drawer; do not fork them. Any new visual feature must go through `layoutCard` + `drawLayout`, otherwise the pixel-equality test breaks.
- **`themeId` is not styling.** `layoutCard` uses `card.style` for everything and takes only `deco` from `getTheme(doc.themeId)`. Half-filled `CardStyle` objects render as garbage (NaN geometry). Always start from `styleFromTheme()` / `baseStyle`.
- **Font fields are families** (`'Gmarket Sans'`), never keys (`'gmarket'`). Wrong strings silently fall back to a default browser font.
- **Assets before pixels.** Missing `prepareAssets` ⇒ fonts measured before load ⇒ overlapping/clipped Korean text; missing photo preload ⇒ grey placeholder in the PNG.
- **Blank lines are gaps, not highlightable lines.** For a “highlighted line break” effect, split the text into more cards instead.
- **`showGuides` never reaches the canvas** — it is a DOM overlay (`safeGuide()` rectangles) only.
- **`useBrackets: false` disables highlights globally** — set it per `Doc`, not per card.
- **Photo data URLs inflate the JSON** (re-encoded to ≤1600 px JPEG q0.9 only when the source is larger than 1600 px or 900 KB; otherwise the original data URL is stored). `saveDoc` silently drops the write when `localStorage` is full; and a doc that big should be rendered immediately rather than round-tripped through storage.
- **Card ids must be unique** — React keys and `currentId` selection rely on it. The app's id format is `c_` + 7 base36 chars.
- **`naturalWidth`-based photo math** means a broken image src silently degrades to `#E7E7E7`.
- **No i18n** — UI copy is Korean; the document itself is language-agnostic.
- **`deco: 'frame'`** is declared but unimplemented (behaves like `'none'`).

---

## 10. UI map (Korean labels → code)

| Tab (`data-testid`) | Label | Panel | Scope |
| --- | --- | --- | --- |
| `tab-auto` | ✨ 자동생성 | `AutoPanel` | paste text → generate 3–10 cards; per-card role, add/duplicate/delete/reorder |
| `tab-design` | 🎨 테마·배경 | `ThemePanel` | apply one of 6 themes to all cards; per-card background (theme / solid / gradient / photo with scale, offsets, dim, blur) |
| `tab-text` | ✍️ 글·강조 | `TextPanel` | title/body text, `[ ]` wrapping button, `useBrackets` toggle, fonts + weights, sizes, line heights, letter spacing, alignment, 4 colors, outline, shadow |
| `tab-frame` | 📐 비율·안전영역 | `FramePanel` | ratio, safe-area guide toggle, watermark (on/text/position/size/opacity), page number (on/style/position/size), export buttons |

Header: `카드뉴스 스튜디오`, card count pill (`N장 · ratio`), `PNG 저장` button (opens `ExportSheet`, no testids inside).
Stage: current card canvas + `n/N장 · 역할 · 1080×H` meta, thumbnail bar (drag to reorder), toast messages.
