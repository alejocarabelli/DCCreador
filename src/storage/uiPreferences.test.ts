import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CANVAS_GRID_KEY,
  NOTEBOOK_WIDTH_DEFAULT,
  NOTEBOOK_WIDTH_MAX,
  NOTEBOOK_WIDTH_MIN,
  SIDEBAR_SPLIT_MAX,
  SIDEBAR_SPLIT_MIN,
  clampNotebookWidth,
  clampSidebarSplit,
  readCanvasGridEnabled,
  readNotebookOpen,
  readNotebookWidth,
  readSidebarOthersOpen,
  readSidebarSplit,
  writeNotebookOpen,
  writeNotebookWidth,
  writeSidebarOthersOpen,
  writeSidebarSplit,
} from './uiPreferences';

const stubStorage = (initial: Record<string, string> = {}): Map<string, string> => {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  });
  return data;
};

afterEach(() => vi.unstubAllGlobals());

describe('Apuntes preferences', () => {
  it('clamps the width to 280–520 and falls back to the default for garbage', () => {
    expect(clampNotebookWidth(100)).toBe(NOTEBOOK_WIDTH_MIN);
    expect(clampNotebookWidth(900)).toBe(NOTEBOOK_WIDTH_MAX);
    expect(clampNotebookWidth(333.4)).toBe(333);
    expect(clampNotebookWidth(Number.NaN)).toBe(NOTEBOOK_WIDTH_DEFAULT);
  });

  it('starts closed at 340px', () => {
    stubStorage();
    expect(readNotebookOpen()).toBe(false);
    expect(readNotebookWidth()).toBe(340);
  });

  it('remembers open state and width, clamping what is stored', () => {
    const data = stubStorage();
    writeNotebookOpen(true);
    writeNotebookWidth(9999);
    expect(readNotebookOpen()).toBe(true);
    expect(data.get('modelador.notebook-width')).toBe('520');
    data.set('modelador.notebook-width', 'nope');
    expect(readNotebookWidth()).toBe(NOTEBOOK_WIDTH_DEFAULT);
    data.set('modelador.notebook-width', '12');
    expect(readNotebookWidth()).toBe(NOTEBOOK_WIDTH_MIN);
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(readNotebookOpen()).toBe(false);
    expect(readNotebookWidth()).toBe(NOTEBOOK_WIDTH_DEFAULT);
    expect(writeNotebookOpen(true)).toBe(false);
  });
});

describe('canvas grid preference', () => {
  it('is on unless the editors turned it off, so the read-only window matches them', () => {
    stubStorage();
    expect(readCanvasGridEnabled()).toBe(true);
    stubStorage({ [CANVAS_GRID_KEY]: 'false' });
    expect(readCanvasGridEnabled()).toBe(false);
    stubStorage({ [CANVAS_GRID_KEY]: 'true' });
    expect(readCanvasGridEnabled()).toBe(true);
  });
});

describe('Sidebar section preferences', () => {
  it('folds «Otros proyectos» by default', () => {
    stubStorage();
    expect(readSidebarOthersOpen()).toBe(false);
    expect(readSidebarSplit()).toBeNull();
  });

  it('remembers the fold state', () => {
    const data = stubStorage();
    writeSidebarOthersOpen(true);
    expect(data.get('modelador.sidebar-others-open')).toBe('true');
    expect(readSidebarOthersOpen()).toBe(true);
  });

  it('clamps the split away from the extremes', () => {
    expect(clampSidebarSplit(0)).toBe(SIDEBAR_SPLIT_MIN);
    expect(clampSidebarSplit(1)).toBe(SIDEBAR_SPLIT_MAX);
    expect(clampSidebarSplit(Number.NaN)).toBe(0.5);
  });

  it('stores the split, clamps what comes back and resets to automatic with null', () => {
    stubStorage();
    writeSidebarSplit(0.42);
    expect(readSidebarSplit()).toBe(0.42);
    stubStorage({ 'modelador.sidebar-split': '7' });
    expect(readSidebarSplit()).toBe(SIDEBAR_SPLIT_MAX);
    stubStorage({ 'modelador.sidebar-split': 'abc' });
    expect(readSidebarSplit()).toBeNull();
    stubStorage();
    writeSidebarSplit(0.6);
    writeSidebarSplit(null);
    expect(readSidebarSplit()).toBeNull();
  });
});
