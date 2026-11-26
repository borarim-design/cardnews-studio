import { useRef } from 'react';
import type { Card, CardStyle, Doc } from '../../types';
import { getTheme, THEMES } from '../../themes';
import { readImageFile } from '../../images';
import { Section, Slider, ColorField, Segmented } from '../ui';

type BgMode = 'theme' | 'solid' | 'gradient' | 'photo';

export function ThemePanel({
  doc,
  index,
  updateStyle,
  onApplyTheme,
  notify,
}: {
  doc: Doc;
  index: number;
  updateStyle: (patch: Partial<CardStyle>) => void;
  onApplyTheme: (themeId: string) => void;
  notify: (msg: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const card: Card = doc.cards[index];
  const st = card.style;
  const theme = getTheme(doc.themeId);
  const t = theme.style;

  const isThemeBg =
    st.bgType !== 'photo' &&
    st.bgType === t.bgType &&
    (st.bgType === 'solid' ? st.bgSolid === t.bgSolid : st.gradFrom === t.gradFrom && st.gradTo === t.gradTo);

  const mode: BgMode = st.bgType === 'photo' ? 'photo' : isThemeBg ? 'theme' : (st.bgType as BgMode);

  const chooseMode = (m: BgMode) => {
    if (m === 'theme') updateStyle({ bgType: t.bgType, bgSolid: t.bgSolid, gradFrom: t.gradFrom, gradTo: t.gradTo, gradAngle: t.gradAngle });
    if (m === 'solid') updateStyle({ bgType: 'solid', bgSolid: st.bgSolid === t.bgSolid ? '#FFFFFF' : st.bgSolid });
    if (m === 'gradient') updateStyle({ bgType: 'gradient' });
    if (m === 'photo') {
      if (st.photo) updateStyle({ bgType: 'photo' });
      else fileRef.current?.click();
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const src = await readImageFile(file);
      updateStyle({
        bgType: 'photo',
        photo: { src, scale: 100, offsetX: 0, offsetY: 0, dim: st.photo?.dim ?? 25, blur: 0 },
      });
      notify('사진 배경을 넣었어요');
    } catch (e) {
      notify((e as Error).message);
    }
  };

  return (
    <>
      <Section title="테마 (전체 장 한 번에)">
        <div className="theme-grid" data-testid="theme-grid">
          {THEMES.map((th) => {
            const bg =
              th.style.bgType === 'gradient'
                ? `linear-gradient(${th.style.gradAngle}deg, ${th.style.gradFrom}, ${th.style.gradTo})`
                : th.style.bgSolid;
            return (
              <button
                key={th.id}
                type="button"
                className={`theme-card ${doc.themeId === th.id ? 'active' : ''}`}
                data-testid={`theme-${th.id}`}
                onClick={() => onApplyTheme(th.id)}
              >
                <span
                  className="theme-swatch"
                  style={{ background: bg, color: th.style.textColor, fontFamily: `'${th.style.titleFont}', sans-serif` }}
                >
                  가나다 Aa
                </span>
                <span className="theme-name">{th.name}</span>
                <span className="theme-tag">{th.tagline}</span>
              </button>
            );
          })}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          테마를 고르면 {doc.cards.length}장 전체의 배경·폰트·색이 한 번에 바뀝니다. 사진 배경은 그대로 둡니다.
        </div>
      </Section>

      <Section title={`${index + 1}번 장 배경`}>
        <div className="field">
          <Segmented<BgMode>
            value={mode}
            onChange={chooseMode}
            options={[
              { value: 'theme', label: '테마' },
              { value: 'solid', label: '단색' },
              { value: 'gradient', label: '그라데이션' },
              { value: 'photo', label: '사진' },
            ]}
          />
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          data-testid="photo-input"
          style={{ display: 'none' }}
          onChange={(e) => onFile(e.target.files?.[0])}
        />

        {mode === 'solid' && <ColorField label="배경색" value={st.bgSolid} onChange={(v) => updateStyle({ bgSolid: v, bgType: 'solid' })} />}

        {mode === 'gradient' && (
          <>
            <div className="grid2">
              <ColorField label="시작색" value={st.gradFrom} onChange={(v) => updateStyle({ gradFrom: v, bgType: 'gradient' })} />
              <ColorField label="끝색" value={st.gradTo} onChange={(v) => updateStyle({ gradTo: v, bgType: 'gradient' })} />
            </div>
            <Slider label="각도" value={st.gradAngle} min={0} max={360} suffix="°" onChange={(v) => updateStyle({ gradAngle: v, bgType: 'gradient' })} />
          </>
        )}

        {mode === 'photo' && (
          <>
            <div className="row" style={{ marginBottom: 10 }}>
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                {st.photo ? '사진 바꾸기' : '사진 올리기'}
              </button>
              {st.photo && <button type="button" className="btn ghost" onClick={() => updateStyle({ bgType: 'solid', photo: null })}>사진 빼기</button>}
            </div>
            {st.photo && (
              <>
                <Slider label="확대" value={st.photo.scale} min={100} max={320} suffix="%" onChange={(v) => updateStyle({ photo: { ...st.photo!, scale: v } })} />
                <Slider label="가로 위치" value={st.photo.offsetX} min={-50} max={50} suffix="%" onChange={(v) => updateStyle({ photo: { ...st.photo!, offsetX: v } })} />
                <Slider label="세로 위치" value={st.photo.offsetY} min={-50} max={50} suffix="%" onChange={(v) => updateStyle({ photo: { ...st.photo!, offsetY: v } })} />
                <Slider label="어둡게" value={st.photo.dim} min={0} max={90} suffix="%" onChange={(v) => updateStyle({ photo: { ...st.photo!, dim: v } })} />
                <Slider label="흐림" value={st.photo.blur} min={0} max={14} onChange={(v) => updateStyle({ photo: { ...st.photo!, blur: v } })} />
              </>
            )}
            <div className="hint">사진 배경 위에서는 글자가 묻히지 않게 ‘어둡게’를 20~40% 정도 두는 게 좋아요.</div>
          </>
        )}

        {mode === 'theme' && (
          <div className="hint">‘{theme.name}’ 테마 배경을 쓰고 있어요. 아래에서 장마다 따로 바꿀 수 있습니다.</div>
        )}
      </Section>
    </>
  );
}
