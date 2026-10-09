/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    // Keep local experiments out; include the native bridge regression on macOS.
    include: ['src/**/*.test.{ts,tsx}', 'macos/*.test.js'],
  },
});
