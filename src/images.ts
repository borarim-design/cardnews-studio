const cache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

export function getImage(src: string): HTMLImageElement | null {
  const img = cache.get(src);
  if (img && img.complete && img.naturalWidth > 0) return img;
  return null;
}

export function preloadImage(src: string): Promise<HTMLImageElement> {
  const hit = cache.get(src);
  if (hit && hit.complete && hit.naturalWidth > 0) return Promise.resolve(hit);
  const inflight = pending.get(src);
  if (inflight) return inflight;
  const task = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      cache.set(src, img);
      pending.delete(src);
      resolve(img);
    };
    img.onerror = () => {
      pending.delete(src);
      reject(new Error('이미지를 불러오지 못했습니다'));
    };
    img.src = src;
  });
  pending.set(src, task);
  return task;
}

/** 업로드한 사진을 1600px 이내로 줄여 data URL 로 만든다 (메모리·저장공간 보호) */
export function readImageFile(file: File, max = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('사진을 읽지 못했습니다'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('사진 형식을 열 수 없습니다'));
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        if (k >= 1 && file.size < 900_000) {
          resolve(String(reader.result));
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * k);
        canvas.height = Math.round(img.naturalHeight * k);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/** 화면에 쓰이는 사진 배경을 미리 메모리에 올려둔다 (Canvas export 직전에 필요) */
export async function preloadAll(srcs: string[]): Promise<void> {
  await Promise.all(srcs.filter(Boolean).map((s) => preloadImage(s).catch(() => null)));
}
