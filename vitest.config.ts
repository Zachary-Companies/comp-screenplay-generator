import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'routes/**/*.test.ts', 'views/**/*.test.ts'],
    globals: false,
    testTimeout: 15000,
  },
});
