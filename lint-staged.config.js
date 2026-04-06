export default {
  'src/**/*.{ts,tsx}': 'eslint --fix',
  // Run full suite without passing staged paths (avoids vitest ENOENT on missing/stale files)
  'src/__tests__/**/*.test.{ts,tsx}': () => 'vitest run',
};
