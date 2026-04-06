import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      include: ['src/core/**', 'src/react/**', 'src/transports/**'],
    },
  },
});