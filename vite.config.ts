import { defineConfig } from 'vite';

// GitHub Pages serves the site from https://<user>.github.io/boardgame-insert/
export default defineConfig({
  base: '/boardgame-insert/',
  build: { chunkSizeWarningLimit: 1500 },
});
