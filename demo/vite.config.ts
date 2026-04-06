import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@zimran-test-lib/core/react', replacement: path.resolve(__dirname, '../src/react/index.ts') },
      { find: '@zimran-test-lib/core/transports', replacement: path.resolve(__dirname, '../src/transports/index.ts') },
      { find: '@zimran-test-lib/core', replacement: path.resolve(__dirname, '../src/index.ts') },
      { find: '@', replacement: path.resolve(__dirname, '../src') },
    ],
  },
});
