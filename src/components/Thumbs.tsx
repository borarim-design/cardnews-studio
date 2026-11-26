import { useEffect, useRef, useState } from 'react';
import type { Doc } from '../types';
import { layoutFor, prepareAssets } from '../export';
import { drawLayout } from '../render';

function ThumbCanvas({ doc, index, scale }: { doc: Doc; index: number; scale: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const lay = layoutFor(doc, index);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await prepareAssets(doc);
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      const canvas = ref.current;
      if (!canvas) return;
      const l = layoutFor(doc, index);
      if (canvas.width !== Math.round(l.w * scale)) {
        canvas.width = Math.round(l.w * scale);
        canvas.height = Math.round(l.h * scale);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawLayout(ctx, l, scale);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, index, scale]);

  return <canvas ref={ref} width={Math.round(lay.w * scale)} height={Math.round(lay.h * scale)} />;
}

export function Thumbs({
  doc,
  currentIndex,
  onSelect,
  onAdd,
  onMove,
}: {
  doc: Doc;
  currentIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onMove: (index: number, delta: number) => void;
}) {
  const dragIndex = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  return (
    <div className="thumbs" data-testid="thumbs">
      {doc.cards.map((card, i) => (
        <button
          key={card.id}
          type="button"
          className={`thumb ${i === currentIndex ? 'active' : ''}`}
          data-testid={`thumb-${i}`}
          title={`${i + 1}번 장 (${card.role === 'cover' ? '표지' : card.role === 'ending' ? '엔딩' : '본문'})`}
          onClick={() => onSelect(i)}
          draggable
          onDragStart={() => {
            dragIndex.current = i;
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(i);
          }}
          onDragLeave={() => setDragOver((v) => (v === i ? null : v))}
          onDrop={(e) => {
            e.preventDefault();
            const from = dragIndex.current;
            dragIndex.current = null;
            setDragOver(null);
            if (from === null || from === i) return;
            onMove(from, i - from);
          }}
          style={dragOver === i ? { outline: '2px dashed var(--sky)' } : undefined}
        >
          <ThumbCanvas doc={doc} index={i} scale={0.09} />
          <span className="thumb-num">{i + 1}</span>
        </button>
      ))}
      <button type="button" className="thumb add" onClick={onAdd} title="빈 장 추가" data-testid="thumb-add">
        +
      </button>
    </div>
  );
}
