import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the same build works on Cloudflare Pages (root)
  // and GitHub Pages (served from /repo-name/) with no config change.
  base: './',
  build: { outDir: 'dist', assetsDir: 'assets' },
});
