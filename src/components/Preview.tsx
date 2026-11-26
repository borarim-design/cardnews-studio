import { useEffect, useRef, useState } from 'react';
import type { Doc } from '../types';
import { drawLayout } from '../render';
import { layoutFor, prepareAssets } from '../export';
import { safeGuide } from '../layout';

export function Preview({ doc, index }: { doc: Doc; index: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        await prepareAssets(doc);
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const lay = layoutFor(doc, index);
      if (canvas.width !== lay.w || canvas.height !== lay.h) {
        canvas.width = lay.w;
        canvas.height = lay.h;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawLayout(ctx, lay, 1);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, index]);

  const guide = safeGuide(doc.ratio);

  return (
    <div className="card-frame" data-testid="card-frame">
      <canvas ref={canvasRef} data-testid="preview-canvas" data-ready={ready ? 'true' : 'false'} />
      {doc.showGuides && (
        <div className="guides" data-testid="guides">
          {guide.areas.map((a) => (
            <div
              key={a.label}
              className="guide-box"
              style={{ left: `${a.left}%`, top: `${a.top}%`, right: `${a.right}%`, bottom: `${a.bottom}%` }}
            >
              <span>{a.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
