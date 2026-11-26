import { useState } from 'react';
import type { Card, Doc } from '../../types';
import { generateCards, SAMPLE_TEXT } from '../../autogen';
import { styleFromTheme } from '../../themes';
import { Section } from '../ui';

const ROLE_LABEL: Record<Card['role'], string> = { cover: '표지', body: '본문', ending: '엔딩' };

export function AutoPanel({
  doc,
  index,
  onGenerate,
  onCardOp,
  onRole,
}: {
  doc: Doc;
  index: number;
  onGenerate: (text: string) => void;
  onCardOp: (op: 'add' | 'duplicate' | 'delete' | 'up' | 'down') => void;
  onRole: (role: Card['role']) => void;
}) {
  const [text, setText] = useState('');
  const [askReplace, setAskReplace] = useState(false);
  const card = doc.cards[index];
  const hasContent = doc.cards.some((c) => c.title.trim() || c.body.trim());

  const run = () => {
    if (!text.trim()) return;
    if (hasContent) {
      setAskReplace(true);
      return;
    }
    onGenerate(text);
  };

  return (
    <>
      <Section
        title="글 붙여넣기 → 한 벌 자동 생성"
        action={
          <button type="button" className="btn small ghost" onClick={() => setText(SAMPLE_TEXT)}>
            예시 글
          </button>
        }
      >
        <textarea
          className="big"
          data-testid="paste-text"
          placeholder={
            '블로그 초안, 메모, 릴스 대본을 통째로 붙여넣으세요.\n\n첫 문단 → 표지\n문단·불릿 → 본문 카드\n마지막 문단 → 엔딩 카드'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="hint" style={{ margin: '6px 0 10px' }}>
          빈 줄로 문단이 나뉘고, 첫 문단은 표지 제목이 됩니다. <b>[단어]</b> 로 감싸면 형광펜 강조.
        </div>
        {askReplace && (
          <div className="notice">
            지금 만든 {doc.cards.length}장이 새 카드로 바뀝니다. 기존 내용은 사라져요.
            <div className="notice-actions">
              <button
                type="button"
                className="btn small primary"
                data-testid="confirm-generate"
                onClick={() => {
                  setAskReplace(false);
                  onGenerate(text);
                }}
              >
                만들기
              </button>
              <button type="button" className="btn small" onClick={() => setAskReplace(false)}>
                취소
              </button>
            </div>
          </div>
        )}
        <button type="button" className="btn primary block" data-testid="generate" onClick={run} disabled={!text.trim()}>
          ✨ 카드뉴스 한 벌 만들기
        </button>
        <div className="hint" style={{ marginTop: 8 }}>
          자동으로 3~10장으로 나누고, 표지·본문·엔딩 역할까지 정합니다.
        </div>
      </Section>

      <Section title={`카드 편집 · ${index + 1} / ${doc.cards.length}장`}>
        <div className="field">
          <div className="field-label">
            <span>현재 장 역할</span>
            <b>{ROLE_LABEL[card.role]}</b>
          </div>
          <div className="seg">
            {(['cover', 'body', 'ending'] as Card['role'][]).map((r) => (
              <button key={r} type="button" className={card.role === r ? 'active' : ''} onClick={() => onRole(r)}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
        <div className="cardops">
          <button type="button" className="btn small" onClick={() => onCardOp('up')} disabled={index === 0}>
            ↑ 앞으로
          </button>
          <button type="button" className="btn small" onClick={() => onCardOp('down')} disabled={index === doc.cards.length - 1}>
            ↓ 뒤로
          </button>
          <button type="button" className="btn small" onClick={() => onCardOp('duplicate')}>
            ⧉ 복제
          </button>
          <button type="button" className="btn small" onClick={() => onCardOp('add')}>
            + 빈 장
          </button>
          <button
            type="button"
            className="btn small"
            style={{ color: 'var(--danger)' }}
            onClick={() => onCardOp('delete')}
            disabled={doc.cards.length <= 1}
          >
            🗑 삭제
          </button>
        </div>
        <div className="hint" style={{ marginTop: 10 }}>
          썸네일 바에서 끌어서 순서를 바꾸거나, 아래 <b>+</b> 로 빈 장을 추가할 수 있어요.
        </div>
      </Section>
    </>
  );
}

export function makeCards(text: string, doc: Doc): Card[] {
  return generateCards(text, styleFromTheme(doc.themeId));
}
