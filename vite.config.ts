import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 의 `https://<user>.github.io/cardnews-studio/` 같은 하위 경로에서도
// 그대로 동작하도록 모든 자산 경로를 상대 경로로 만든다.
// 다른 곳에 올릴 때는 VITE_BASE_PATH 로 덮어쓴다.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
  plugins: [react()],
  server: { port: 5180, host: true },
  preview: { port: 4180 },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    assetsInlineLimit: 0,
  },
});
