import type { Doc } from '../../types';
import { RATIOS, RATIO_LABEL, RATIO_H, safeGuide } from '../../layout';
import { Section, Slider, Toggle, PositionGrid, Segmented } from '../ui';

export function FramePanel({
  doc,
  updateDoc,
  onExport,
  busy,
}: {
  doc: Doc;
  updateDoc: (patch: Partial<Doc>) => void;
  onExport: (kind: 'current' | 'zip' | 'seq' | 'open') => void;
  busy: string | null;
}) {
  const guide = safeGuide(doc.ratio);
  return (
    <>
      <Section title="비율">
        <div className="field">
          <Segmented<'4:5' | '1:1' | '9:16'>
            value={doc.ratio}
            onChange={(v) => updateDoc({ ratio: v })}
            options={RATIOS.map((r) => ({ value: r, label: r }))}
          />
        </div>
        <div className="hint">
          {RATIO_LABEL[doc.ratio]} · 인스타 피드 기본은 <b>4:5</b>, 릴스·스토리는 9:16.
        </div>
      </Section>

      <Section title="안전 영역 가이드">
        <Toggle
          label="가이드 표시"
          hint="미리보기에만 보이고 PNG 에는 들어가지 않습니다"
          checked={doc.showGuides}
          onChange={(v) => updateDoc({ showGuides: v })}
        />
        <div className="legend">
          {guide.areas.map((a) => (
            <span key={a.label}>
              <i style={{ background: '#ff2b64' }} />
              {a.label}
            </span>
          ))}
        </div>
      </Section>

      <Section title="워터마크 (@계정)">
        <Toggle label="모든 장에 표시" checked={doc.watermark.on} onChange={(v) => updateDoc({ watermark: { ...doc.watermark, on: v } })} />
        {doc.watermark.on && (
          <>
            <div className="field">
              <div className="field-label">
                <span>계정명</span>
              </div>
              <input
                type="text"
                data-testid="watermark-input"
                value={doc.watermark.text}
                onChange={(e) => updateDoc({ watermark: { ...doc.watermark, text: e.target.value } })}
              />
            </div>
            <div className="field">
              <div className="field-label">
                <span>위치</span>
              </div>
              <PositionGrid value={doc.watermark.position} onChange={(v) => updateDoc({ watermark: { ...doc.watermark, position: v } })} />
            </div>
            <Slider label="크기" value={doc.watermark.size} min={16} max={56} suffix="px" onChange={(v) => updateDoc({ watermark: { ...doc.watermark, size: v } })} />
            <Slider
              label="불투명도"
              value={Math.round(doc.watermark.opacity * 100)}
              min={10}
              max={100}
              suffix="%"
              onChange={(v) => updateDoc({ watermark: { ...doc.watermark, opacity: v / 100 } })}
            />
          </>
        )}
      </Section>

      <Section title="페이지 번호 (1/N)">
        <Toggle label="모든 장에 표시" checked={doc.pageNumber.on} onChange={(v) => updateDoc({ pageNumber: { ...doc.pageNumber, on: v } })} />
        {doc.pageNumber.on && (
          <>
            <div className="field">
              <div className="field-label">
                <span>스타일</span>
              </div>
              <Segmented<'plain' | 'pill'>
                value={doc.pageNumber.style}
                onChange={(v) => updateDoc({ pageNumber: { ...doc.pageNumber, style: v } })}
                options={[
                  { value: 'plain', label: '숫자만' },
                  { value: 'pill', label: '알약 배지' },
                ]}
              />
            </div>
            <div className="field">
              <div className="field-label">
                <span>위치</span>
              </div>
              <PositionGrid value={doc.pageNumber.position} onChange={(v) => updateDoc({ pageNumber: { ...doc.pageNumber, position: v } })} />
            </div>
            <Slider label="크기" value={doc.pageNumber.size} min={16} max={56} suffix="px" onChange={(v) => updateDoc({ pageNumber: { ...doc.pageNumber, size: v } })} />
          </>
        )}
      </Section>

      <Section title="내보내기">
        <div className="hint" style={{ marginBottom: 10 }}>
          {RATIO_LABEL[doc.ratio]} · 화면 미리보기와 같은 렌더러로 그려 픽셀이 일치합니다.
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn primary block" data-testid="export-current" onClick={() => onExport('current')} disabled={!!busy}>
            {busy === 'current' ? <span className="spinner" /> : '🖼'} 현재 장 PNG 저장
          </button>
          <button type="button" className="btn block" data-testid="export-zip" onClick={() => onExport('zip')} disabled={!!busy}>
            {busy === 'zip' ? <span className="spinner" /> : '🗂'} 전체 {doc.cards.length}장 ZIP 저장
          </button>
          <button type="button" className="btn ghost block" data-testid="export-seq" onClick={() => onExport('seq')} disabled={!!busy}>
            {busy === 'seq' ? <span className="spinner" /> : '⬇️'} 전체 개별 PNG (순차)
          </button>
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          iPhone 에서 ZIP 이 열리지 않으면 ‘전체 개별 PNG’를 쓰거나, PNG 를 길게 눌러 ‘사진에 저장’ 하세요.
        </div>
      </Section>

      <div className="hint" style={{ marginTop: 4 }}>
        내보내기 해상도 1080×{RATIO_H[doc.ratio]}px · 자동저장됨
      </div>
    </>
  );
}
