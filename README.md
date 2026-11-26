# 카드뉴스 스튜디오 (Cardnews Studio)

글만 붙여넣으면 인스타 카드뉴스 캐러셀이 한 벌로 완성되는 **정적 웹앱**입니다.
React + TypeScript + Vite 로 만들었고, 서버 없이 브라우저에서만 동작합니다.
(경쟁 서비스 '네몽'의 유료 기능들을 기본으로 제공하는 것을 목표로 한 1차 버전입니다.)

- 라이브: https://borarim-design.github.io/cardnews-studio/
- 저장소: https://github.com/borarim-design/cardnews-studio

## 무엇이 되나

| 기능 | 내용 |
| --- | --- |
| 한 벌 자동 생성 | 긴 글·블로그 초안·메모를 붙여넣고 **✨ 카드뉴스 한 벌 만들기** → 첫 문단은 표지, 문단·불릿은 본문 카드, 마지막은 엔딩 카드로 3~10장 자동 분할 |
| 카드 편집 | 빈 장 추가, 복제, 삭제, ↑↓ 이동, 썸네일 드래그로 순서 변경, 장별 역할(표지/본문/엔딩) 변경 |
| 테마 6종 원클릭 | 라임 탭탭 매거진 · 다크 차콜 · 미니멀 에디토리얼 · 레트로 픽셀 · 파스텔 웨딩 · 손글씨 다이어리. 한 번 누르면 전 장의 배경·폰트·색이 동기화되고, 장별 커스텀도 가능 |
| 무료 폰트 13종 | 프리텐다드, 지마켓산스, 페이퍼로지, 카페24 써라운드, 도현체, 갈무리11, 나눔명조, 주아체, 검은고딕, 나눔손글씨 펜, 마루부리, 개구체, 베이글팻원 (모두 상업적 사용 가능) |
| 배경 | 단색 / 그라데이션(각도) / **사진 업로드**(확대·위치·어둡기·흐림) |
| 텍스트 | `[단어]` 형광펜 강조(선택 구간 버튼), 외곽선, 그림자, 자간, 줄간격, 정렬, 제목/본문 폰트·굵기·크기 분리 |
| 빈 줄 처리 | **줄 단위 렌더링** — 줄바꿈한 빈 줄에는 형광펜이 칠해지지 않습니다 (네몽 리뷰 불만 해결) |
| 캐러셀 자동 요소 | `@계정` 워터마크, `1/N` 페이지 번호(숫자만/알약 배지) 토글 + 9개 위치 선택 |
| 비율·안전영역 | 4:5(1080×1350) · 1:1(1080×1080) · 9:16(1080×1920) + 인스타 안전영역 가이드 오버레이(내보내기에는 미포함) |
| 내보내기 | 현재 장 PNG(정확히 1080×H), 전체 ZIP, 전체 개별 PNG(순차) — 모두 `document.fonts` 로딩 후 Canvas 렌더링 |
| 자동 저장 | localStorage 에 작업 내용을 자동 저장 |

## 화면

- **모바일(390×844)**: 상단 카드 미리보기 → 가로 썸네일 바 → 4개 탭(`✨ 자동생성` / `🎨 테마·배경` / `✍️ 글·강조` / `📐 비율·안전영역`) → 스크롤 패널
- **데스크톱(900px~)**: 좌측 편집 패널 + 우측 대형 미리보기 + 하단 썸네일 바

## 미리보기와 결과물이 같은 픽셀인 이유

`src/layout.ts` 가 카드 1장을 1080 기준 좌표의 그리기 목록(배경·장식·줄·런·워터마크)으로 계산하고,
`src/render.ts` 의 `drawLayout()` 하나가 그 목록을 Canvas 에 그립니다.
화면 미리보기와 PNG 내보내기가 같은 함수·같은 좌표계를 쓰므로 **미리보기 = 결과물**이 보장됩니다
(E2E 에서 픽셀 단위로 비교해 확인합니다).

## 개발

```bash
npm install
npm run dev        # http://localhost:5180
npm run typecheck  # tsc -b
npm run build      # dist/ 생성
npm run preview    # 빌드 결과 미리보기 (http://localhost:4180)
```

## 테스트

```bash
# 1) 정적 검사 — 하위 경로 배포 안전성(절대 경로/누락 자산/폰트 개수)
npm run check:static

# 2) 실제 Chromium E2E (모바일 390×844 + 데스크톱 1440×900)
#    playwright 는 저장소 의존성에 넣지 않았습니다.
npm i -D playwright && npx playwright install chromium
CHROME_PATH=<chromium 경로> npm run e2e

# 3) PNG 픽셀 검증 (해상도, 미리보기=내보내기, ZIP 내용, 빈 줄 형광펜)
python3 scripts/verify-png.py
```

E2E 가 확인하는 것: 위 기능 표의 자동 생성/카드 조작/테마 전환/비율/가이드/사진 배경/텍스트 편집/PNG·ZIP 다운로드,
모바일 4개 영역 비겹침·가로 스크롤 없음, 데스크톱 2단 레이아웃, 콘솔 에러 0.
스크린샷과 결과는 `tests/artifacts/` 에 남습니다.

## 배포 (GitHub Pages)

`vite.config.ts` 의 `base: './'` 덕분에 `https://<user>.github.io/cardnews-studio/` 하위 경로에서 그대로 동작합니다.

```bash
npm run build
# dist/ 내용물 + .nojekyll 을 gh-pages 브랜치 루트로 푸시
```

`.github/workflows/` 없이 `gh-pages` 브랜치를 직접 밀어 배포합니다(워크플로 권한 제한 회피).

## 폰트 라이선스

모든 폰트는 상업적 사용이 가능한 무료 글꼴이며, 한글 음절 전체(U+AC00–D7A3)+라틴+문장부호로 서브셋해
woff2 로 담았습니다. 원본·라이선스는 [`src/assets/fonts/LICENSE.md`](src/assets/fonts/LICENSE.md) 참고.

## 구조

```
src/
  App.tsx                화면 셸 · 상태 · 내보내기 오케스트레이션
  types.ts               카드/문서/테마 타입
  themes.ts              테마 6종(배경·폰트·색·장식)
  fonts.ts               폰트 목록, 로딩 보장(ensureFont), Canvas 폰트 문자열
  autogen.ts             글 → 카드 분할(문단/불릿/문장, 3~10장)
  format.ts              [강조] 파싱, 문장/청크 나누기
  layout.ts              카드 → 그리기 목록(줄바꿈·정렬·자동 크기·워터마크·장식)
  render.ts              그리기 목록 → Canvas
  export.ts              PNG/ZIP 생성, 다운로드, iOS 폴백
  images.ts              사진 업로드/축소/캐시
  doc.ts                 기본 문서, 테마 일괄 적용, localStorage
  components/            Preview · Thumbs · ExportSheet · panels/*
```
