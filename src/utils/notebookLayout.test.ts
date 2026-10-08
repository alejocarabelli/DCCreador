import { describe, expect, it } from 'vitest';
import { EDITOR_MIN_WIDTH, shouldOverlayNotebook } from './notebookLayout';

describe('shouldOverlayNotebook', () => {
  it('pushes the editor while it keeps its minimum width', () => {
    expect(shouldOverlayNotebook(1184, 340, EDITOR_MIN_WIDTH['class-diagram'])).toBe(false);
    expect(shouldOverlayNotebook(784 + 340, 340, EDITOR_MIN_WIDTH['class-diagram'])).toBe(false);
  });

  it('floats over the editor as soon as the push would squeeze it', () => {
    expect(shouldOverlayNotebook(784 + 339, 340, EDITOR_MIN_WIDTH['class-diagram'])).toBe(true);
    expect(shouldOverlayNotebook(1184, 520, EDITOR_MIN_WIDTH['use-case-model'])).toBe(true);
    expect(shouldOverlayNotebook(1000, 340, EDITOR_MIN_WIDTH['sequence-diagram'])).toBe(true);
  });

  it('gives every artifact type a minimum that leaves 480px of canvas', () => {
    for (const minimum of Object.values(EDITOR_MIN_WIDTH)) expect(minimum).toBeGreaterThanOrEqual(480 + 280);
  });
});
