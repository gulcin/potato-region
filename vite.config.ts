import { defineConfig } from 'vite';

export default defineConfig({
  base: '/potato-region/',
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: { sourcemap: false },
});
