import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['functions/**/*.js'],
      exclude: ['functions/_middleware.js'],
      reporter: ['text', 'text-summary'],
    },
  },
});
