import { describe, expect, it } from 'vitest';
import { MIN_PUSHED_EDITOR_WIDTH, shouldOverlayNotebook } from './notebookLayout';

describe('shouldOverlayNotebook', () => {
  it('pushes the editor while it keeps the width of the narrowest supported window', () => {
    // 1280px window, expanded sidebar: 1024px workspace.
    expect(shouldOverlayNotebook(1024, 340)).toBe(false);
    expect(shouldOverlayNotebook(MIN_PUSHED_EDITOR_WIDTH + 340, 340)).toBe(false);
  });

  it('floats over the editor as soon as the push would squeeze it', () => {
    expect(shouldOverlayNotebook(MIN_PUSHED_EDITOR_WIDTH + 339, 340)).toBe(true);
    expect(shouldOverlayNotebook(1024, 520)).toBe(true);
    expect(shouldOverlayNotebook(844, 340)).toBe(true);
  });

  it('never leaves the canvas under 480px', () => {
    expect(MIN_PUSHED_EDITOR_WIDTH).toBeGreaterThanOrEqual(480);
  });
});
