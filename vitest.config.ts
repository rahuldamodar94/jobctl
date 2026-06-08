import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Pin a non-UTC timezone (any one works; UTC+4 has no DST) so local-date
    // logic is exercised deterministically regardless of the CI machine's zone.
    env: { TZ: 'Asia/Dubai' },
  },
});
