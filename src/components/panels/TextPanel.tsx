import { useRef } from 'react';
import type { Card, CardStyle, Doc } from '../../types';
import { FONTS, availableWeights, nearestWeight } from '../../fonts';
import { Section, Slider, ColorField, Segmented, Toggle } from '../ui';

const WEIGHT_LABEL: Record<number, string> = { 400: '보통', 500: '미디엄', 700: '볼드', 800: '엑스트라' };

export function TextPanel({
  doc,
  index,
  updateCard,
  updateStyle,
  updateDoc,
  notify,
}: {
  doc: Doc;
  index: number;
  updateCard: (patch: Partial<Card>) => void;
  updateStyle: (patch: Partial<CardStyle>) => void;
  updateDoc: (patch: Partial<Doc>) => void;
  notify: (msg: string) => void;
}) {
  const card = doc.cards[index];
  const st = card.style;
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);

  const wrapSelection = (which: 'title' | 'body') => {
    const el = which === 'title' ? titleRef.current : bodyRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd, value } = el;
    if (selectionStart === selectionEnd) {
      notify('강조할 단어를 먼저 드래그해 주세요');
      return;
    }
    const next = `${value.slice(0, selectionStart)}[${value.slice(selectionStart, selectionEnd)}]${value.slice(selectionEnd)}`;
    if (which === 'title') updateCard({ title: next });
    else updateCard({ body: next });
    const pos = selectionStart + 1;
    window.setTimeout(() => {
      el.focus();
      el.setSelectionRange(pos, pos + (selectionEnd - selectionStart));
    }, 0);
  };

  const fontOptions = FONTS.map((f) => (
    <option key={f.key} value={f.family}>
      {f.label} · {f.note}
    </option>
  ));

  return (
    <>
      <Section
        title={`${index + 1}번 장 글`}
        action={<span className="hint">{'[ ] = 형광펜'}</span>}
      >
        <div className="field">
          <div className="field-label">
            <span>제목</span>
            <button type="button" className="btn small ghost" onClick={() => wrapSelection('title')}>
              선택 강조
            </button>
          </div>
          <textarea
            ref={titleRef}
            data-testid="title-input"
            rows={2}
            placeholder="표지·엔딩의 큰 제목, 본문 카드의 부제"
            value={card.title}
            onChange={(e) => updateCard({ title: e.target.value })}
          />
        </div>
        <div className="field">
          <div className="field-label">
            <span>본문</span>
            <button type="button" className="btn small ghost" onClick={() => wrapSelection('body')}>
              선택 강조
            </button>
          </div>
          <textarea
            ref={bodyRef}
            data-testid="body-input"
            rows={7}
            placeholder={'줄바꿈 그대로 반영됩니다.\n- 불릿은 줄 앞에 - 를 붙이세요.\n\n[강조할 단어] 는 형광펜으로 칠해집니다.'}
            value={card.body}
            onChange={(e) => updateCard({ body: e.target.value })}
          />
        </div>
        <Toggle
          label="대괄호 강조 사용"
          hint="[이렇게] 감싼 구간을 형광펜으로 칠합니다"
          checked={doc.useBrackets}
          onChange={(v) => updateDoc({ useBrackets: v })}
        />
        <div className="hint">빈 줄은 여백으로만 쓰이고 형광펜이 칠해지지 않습니다.</div>
      </Section>

      <Section title="폰트">
        <div className="field">
          <div className="field-label">
            <span>제목 폰트</span>
          </div>
          <select
            data-testid="title-font"
            value={st.titleFont}
            onChange={(e) => {
              const family = e.target.value;
              updateStyle({ titleFont: family, titleWeight: nearestWeight(family, st.titleWeight) });
            }}
          >
            {fontOptions}
          </select>
          <div className="font-preview" style={{ fontFamily: `'${st.titleFont}', sans-serif`, fontSize: 20, marginTop: 6 }}>
            다람쥐 헌 쳇바퀴에 타고파 Aa
          </div>
        </div>
        <div className="field">
          <div className="field-label">
            <span>본문 폰트</span>
          </div>
          <select
            data-testid="body-font"
            value={st.bodyFont}
            onChange={(e) => {
              const family = e.target.value;
              updateStyle({ bodyFont: family, bodyWeight: nearestWeight(family, st.bodyWeight) });
            }}
          >
            {fontOptions}
          </select>
          <div className="font-preview" style={{ fontFamily: `'${st.bodyFont}', sans-serif`, marginTop: 6 }}>
            오늘도 한 장 더, 카드뉴스 1234
          </div>
        </div>
        <div className="grid2">
          <div className="field">
            <div className="field-label">
              <span>제목 굵기</span>
            </div>
            <div className="seg">
              {availableWeights(st.titleFont).map((w) => (
                <button
                  key={w}
                  type="button"
                  className={nearestWeight(st.titleFont, st.titleWeight) === w ? 'active' : ''}
                  onClick={() => updateStyle({ titleWeight: w })}
                >
                  {WEIGHT_LABEL[w] ?? w}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <div className="field-label">
              <span>본문 굵기</span>
            </div>
            <div className="seg">
              {availableWeights(st.bodyFont).map((w) => (
                <button
                  key={w}
                  type="button"
                  className={nearestWeight(st.bodyFont, st.bodyWeight) === w ? 'active' : ''}
                  onClick={() => updateStyle({ bodyWeight: w })}
                >
                  {WEIGHT_LABEL[w] ?? w}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="크기·간격">
        <Slider label="제목 크기 (표지·엔딩)" value={st.titleSize} min={48} max={150} suffix="px" onChange={(v) => updateStyle({ titleSize: v })} />
        <Slider label="본문 크기" value={st.bodySize} min={24} max={72} suffix="px" onChange={(v) => updateStyle({ bodySize: v })} />
        <Slider label="제목 줄간격" value={st.titleLineHeight} min={1} max={2} step={0.02} onChange={(v) => updateStyle({ titleLineHeight: v })} />
        <Slider label="본문 줄간격" value={st.bodyLineHeight} min={1} max={2.4} step={0.02} onChange={(v) => updateStyle({ bodyLineHeight: v })} />
        <Slider label="제목 자간" value={st.titleLetterSpacing} min={-8} max={12} step={0.5} onChange={(v) => updateStyle({ titleLetterSpacing: v })} />
        <Slider label="본문 자간" value={st.bodyLetterSpacing} min={-4} max={8} step={0.5} onChange={(v) => updateStyle({ bodyLetterSpacing: v })} />
        <div className="field">
          <div className="field-label">
            <span>정렬</span>
          </div>
          <Segmented<'left' | 'center' | 'right'>
            value={st.align}
            onChange={(v) => updateStyle({ align: v })}
            options={[
              { value: 'left', label: '왼쪽' },
              { value: 'center', label: '가운데' },
              { value: 'right', label: '오른쪽' },
            ]}
          />
        </div>
      </Section>

      <Section title="색">
        <div className="grid2">
          <ColorField label="글자" value={st.textColor} onChange={(v) => updateStyle({ textColor: v })} />
          <ColorField label="본문 글자" value={st.subColor} onChange={(v) => updateStyle({ subColor: v })} />
          <ColorField label="형광펜" value={st.accent} onChange={(v) => updateStyle({ accent: v })} />
          <ColorField label="형광펜 글자" value={st.accentText} onChange={(v) => updateStyle({ accentText: v })} />
        </div>
      </Section>

      <Section title="효과">
        <Toggle label="외곽선" checked={st.outline} onChange={(v) => updateStyle({ outline: v })} />
        {st.outline && (
          <>
            <Slider label="외곽선 두께" value={st.outlineWidth} min={1} max={16} onChange={(v) => updateStyle({ outlineWidth: v })} />
            <ColorField label="외곽선 색" value={st.outlineColor} onChange={(v) => updateStyle({ outlineColor: v })} />
          </>
        )}
        <Toggle label="그림자" checked={st.shadow} onChange={(v) => updateStyle({ shadow: v })} />
        {st.shadow && (
          <>
            <Slider label="그림자 번짐" value={st.shadowBlur} min={0} max={40} onChange={(v) => updateStyle({ shadowBlur: v })} />
            <ColorField label="그림자 색" value={st.shadowColor.slice(0, 7)} onChange={(v) => updateStyle({ shadowColor: v })} />
          </>
        )}
      </Section>
    </>
  );
}
