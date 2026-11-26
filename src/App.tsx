import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card, CardStyle, Doc } from './types';
import { applyTheme, defaultDoc, emptyCard, loadDoc, moveCard, saveDoc, uid } from './doc';
import { getTheme, styleFromTheme } from './themes';
import { generateCards } from './autogen';
import { RATIO_H } from './layout';
import {
  downloadBlob,
  exportAllSequential,
  exportAllZip,
  exportCardBlob,
  exportFileName,
  openBlobInNewTab,
} from './export';
import { Preview } from './components/Preview';
import { Thumbs } from './components/Thumbs';
import { ExportSheet } from './components/ExportSheet';
import { AutoPanel } from './components/panels/AutoPanel';
import { ThemePanel } from './components/panels/ThemePanel';
import { TextPanel } from './components/panels/TextPanel';
import { FramePanel } from './components/panels/FramePanel';

type Tab = 'auto' | 'design' | 'text' | 'frame';

const TABS: Array<{ id: Tab; ico: string; label: string }> = [
  { id: 'auto', ico: '✨', label: '자동생성' },
  { id: 'design', ico: '🎨', label: '테마·배경' },
  { id: 'text', ico: '✍️', label: '글·강조' },
  { id: 'frame', ico: '📐', label: '비율·안전영역' },
];

const ROLE_LABEL: Record<Card['role'], string> = { cover: '표지', body: '본문', ending: '엔딩' };

export default function App() {
  const [doc, setDoc] = useState<Doc>(() => loadDoc() ?? defaultDoc());
  const [currentId, setCurrentId] = useState<string>(() => doc.cards[0].id);
  const [tab, setTab] = useState<Tab>('auto');
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const index = Math.max(
    0,
    doc.cards.findIndex((c) => c.id === currentId),
  );
  const card = doc.cards[index] ?? doc.cards[0];

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => saveDoc(doc), 400);
    return () => window.clearTimeout(t);
  }, [doc]);

  const updateDoc = useCallback((patch: Partial<Doc>) => setDoc((d) => ({ ...d, ...patch })), []);

  const updateCard = useCallback(
    (patch: Partial<Card>) =>
      setDoc((d) => ({ ...d, cards: d.cards.map((c) => (c.id === card.id ? { ...c, ...patch } : c)) })),
    [card.id],
  );

  const updateStyle = useCallback(
    (patch: Partial<CardStyle>) =>
      setDoc((d) => ({
        ...d,
        cards: d.cards.map((c) => (c.id === card.id ? { ...c, style: { ...c.style, ...patch } } : c)),
      })),
    [card.id],
  );

  const onApplyTheme = useCallback(
    (themeId: string) => {
      setDoc((d) => applyTheme(d, themeId));
      notify(`‘${getTheme(themeId).name}’ 테마를 전체 장에 적용했어요`);
    },
    [notify],
  );

  const onGenerate = useCallback(
    (text: string) => {
      const cards = generateCards(text, styleFromTheme(doc.themeId));
      if (!cards.length) {
        notify('글이 비어 있어 카드를 만들지 못했어요');
        return;
      }
      setDoc((d) => ({ ...d, cards }));
      setCurrentId(cards[0].id);
      notify(`${cards.length}장 카드뉴스를 만들었어요`);
    },
    [doc.themeId, notify],
  );

  const onCardOp = useCallback(
    (op: 'add' | 'duplicate' | 'delete' | 'up' | 'down') => {
      setDoc((d) => {
        const i = d.cards.findIndex((c) => c.id === card.id);
        if (i < 0) return d;
        if (op === 'delete') {
          if (d.cards.length <= 1) {
            notify('카드가 한 장뿐이라 삭제할 수 없어요');
            return d;
          }
          const cards = d.cards.filter((_, k) => k !== i);
          const next = cards[Math.min(i, cards.length - 1)];
          setCurrentId(next.id);
          return { ...d, cards };
        }
        if (op === 'duplicate') {
          const copy: Card = { ...d.cards[i], id: uid(), style: { ...d.cards[i].style, photo: d.cards[i].style.photo } };
          const cards = d.cards.slice();
          cards.splice(i + 1, 0, copy);
          setCurrentId(copy.id);
          return { ...d, cards };
        }
        if (op === 'add') {
          const fresh = emptyCard(d.themeId, 'body');
          const cards = d.cards.slice();
          cards.splice(i + 1, 0, fresh);
          setCurrentId(fresh.id);
          return { ...d, cards };
        }
        const delta = op === 'up' ? -1 : 1;
        return moveCard(d, i, delta);
      });
      if (op === 'add' || op === 'duplicate') setTab('text');
    },
    [card.id, doc.themeId, notify],
  );

  const onMove = useCallback((from: number, delta: number) => {
    setDoc((d) => moveCard(d, from, delta));
  }, []);

  const onAddAtEnd = useCallback(() => {
    const fresh = emptyCard(doc.themeId, 'body');
    setDoc((d) => ({ ...d, cards: [...d.cards, fresh] }));
    setCurrentId(fresh.id);
    setTab('text');
  }, [doc.themeId]);

  const runExport = useCallback(
    async (kind: 'current' | 'zip' | 'seq' | 'open') => {
      if (busy) return;
      setBusy(kind);
      const started = Date.now();
      try {
        if (kind === 'current') {
          const blob = await exportCardBlob(doc, index);
          downloadBlob(blob, exportFileName(doc, index));
          notify(`${exportFileName(doc, index)} 저장을 시작했어요`);
        } else if (kind === 'open') {
          const blob = await exportCardBlob(doc, index);
          openBlobInNewTab(blob);
          notify('새 창에서 이미지를 길게 눌러 저장하세요');
        } else if (kind === 'zip') {
          const blob = await exportAllZip(doc);
          downloadBlob(blob, `cardnews_${doc.ratio.replace(':', 'x')}_${doc.cards.length}장.zip`);
          notify(`ZIP 저장을 시작했어요 (${doc.cards.length}장)`);
        } else {
          await exportAllSequential(doc, (i, total) => notify(`${i}/${total}장 저장 중…`));
          if (Date.now() - started > 1200) notify(`${doc.cards.length}장 개별 저장 완료`);
        }
        setSheet(false);
      } catch (e) {
        notify(`저장 실패: ${(e as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [busy, doc, index, notify],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void runExport('current');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runExport]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          <span className="brand-name">카드뉴스 스튜디오</span>
          <span className="brand-sub">글만 붙여넣으면 캐러셀 완성</span>
        </div>
        <div className="topbar-spacer" />
        <span className="pill" data-testid="card-count">
          {doc.cards.length}장 · {doc.ratio}
        </span>
        <button type="button" className="btn primary" data-testid="open-export" onClick={() => setSheet(true)}>
          PNG 저장
        </button>
      </header>

      <div className="workspace">
        <main className="stage-area">
          <div className="stagewrap">
            <div className="stage">
              <Preview doc={doc} index={index} />
            </div>
            <div className="stage-meta">
              <span data-testid="stage-meta">
                {index + 1} / {doc.cards.length}장 · {ROLE_LABEL[card.role]} · 1080×{RATIO_H[doc.ratio]}
              </span>
            </div>
          </div>
          <Thumbs
            doc={doc}
            currentIndex={index}
            onSelect={(i) => setCurrentId(doc.cards[i].id)}
            onAdd={onAddAtEnd}
            onMove={onMove}
          />
        </main>

        <aside className="editor">
          <nav className="tabs" role="tablist" aria-label="편집 탭">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`tab ${tab === t.id ? 'active' : ''}`}
                data-testid={`tab-${t.id}`}
                onClick={() => setTab(t.id)}
              >
                <span className="tab-ico">{t.ico}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
          <div className="panel" data-testid={`panel-${tab}`}>
            {tab === 'auto' && (
              <AutoPanel
                doc={doc}
                index={index}
                onGenerate={onGenerate}
                onCardOp={onCardOp}
                onRole={(role) => updateCard({ role })}
              />
            )}
            {tab === 'design' && (
              <ThemePanel doc={doc} index={index} updateStyle={updateStyle} onApplyTheme={onApplyTheme} notify={notify} />
            )}
            {tab === 'text' && (
              <TextPanel
                doc={doc}
                index={index}
                updateCard={updateCard}
                updateStyle={updateStyle}
                updateDoc={updateDoc}
                notify={notify}
              />
            )}
            {tab === 'frame' && <FramePanel doc={doc} updateDoc={updateDoc} onExport={runExport} busy={busy} />}
          </div>
        </aside>
      </div>

      <ExportSheet open={sheet} doc={doc} busy={busy} onClose={() => setSheet(false)} onExport={runExport} />
      {toast && (
        <div className="toast" data-testid="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
