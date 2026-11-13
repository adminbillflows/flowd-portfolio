// Builds a server-less demo of the front end (sample works, hash routes) into dist-static/.
import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  define: { 'import.meta.env.VITE_STATIC': JSON.stringify('1') },
  build: { outDir: 'dist-static', chunkSizeWarningLimit: 900, assetsInlineLimit: 100000000, cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } } },
});
