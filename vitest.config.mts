import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The integration tests share one PostgreSQL database. Running files
    // sequentially prevents cross-file races (for example the
    // last-active-super-admin assertions) and keeps fixtures deterministic.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 60_000,
    restoreMocks: true,
  },
});
