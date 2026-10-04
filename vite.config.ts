/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    // scratch/ holds local, git-ignored experiments; the suite is src/.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
