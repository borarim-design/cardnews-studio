import type { Doc } from '../types';
import { RATIO_H } from '../layout';

export function ExportSheet({
  open,
  doc,
  busy,
  onClose,
  onExport,
}: {
  open: boolean;
  doc: Doc;
  busy: string | null;
  onClose: () => void;
  onExport: (kind: 'current' | 'zip' | 'seq' | 'open') => void;
}) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="내보내기">
        <h3>PNG 로 저장</h3>
        <div className="sheet-sub">
          1080×{RATIO_H[doc.ratio]} · {doc.cards.length}장 · 미리보기와 같은 픽셀로 그립니다
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn primary block" onClick={() => onExport('current')} disabled={!!busy}>
            {busy === 'current' ? <span className="spinner" /> : '🖼'} 현재 장만 저장
          </button>
          <button type="button" className="btn block" onClick={() => onExport('zip')} disabled={!!busy}>
            {busy === 'zip' ? <span className="spinner" /> : '🗂'} 전체 {doc.cards.length}장 ZIP
          </button>
          <button type="button" className="btn ghost block" onClick={() => onExport('seq')} disabled={!!busy}>
            {busy === 'seq' ? <span className="spinner" /> : '⬇️'} 전체 개별 PNG (순차)
          </button>
          <button type="button" className="btn ghost block" onClick={() => onExport('open')} disabled={!!busy}>
            🔎 새 창에서 열기 (아이폰 ‘사진에 저장’용)
          </button>
          <button type="button" className="btn ghost block" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="hint" style={{ marginTop: 10 }}>
          iPhone: 저장이 안 되면 개별 PNG 를 길게 눌러 ‘사진에 저장’을 쓰세요.
        </div>
      </div>
    </div>
  );
}
