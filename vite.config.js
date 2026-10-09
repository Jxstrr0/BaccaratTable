import { defineConfig } from 'vite';

// Relative base so the build works from any sub-path (e.g. GitHub Pages /BaccaratTable/).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
});
