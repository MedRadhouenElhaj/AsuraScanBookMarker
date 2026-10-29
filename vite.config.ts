/// <reference types="vitest" />
import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    css: { include: /theme\.css/ },
    setupFiles: ['./src/test/setup.ts'],
  },
});
