import { describe, expect, it } from 'vitest';
import type { ArtifactNotebook, NotebookBlock } from '../types/diagram';
import {
  DEFAULT_SKETCH_HEIGHT,
  MAX_BLOCKS,
  MAX_SHAPES_PER_SKETCH,
  MAX_SKETCH_HEIGHT,
  MAX_STROKE_POINTS,
  MAX_TEXT_LENGTH,
  MIN_SKETCH_HEIGHT,
  countNotebookPoints,
  countPendingQuestions,
  countResolvedQuestions,
  createNotebookBlock,
  isNotebookBlockEmpty,
  isNotebookEmpty,
  normalizeArtifactNotebook,
  simplifyStroke,
} from './artifactNotebook';
import { sampleNotebook } from './notebookTestData';

const raw = (value: unknown): ArtifactNotebook | undefined => normalizeArtifactNotebook(value);
const notebookOf = (blocks: unknown[]): unknown => ({ version: 1, blocks });
const pairs = (points: number[]): number => points.length / 2;

describe('simplifyStroke', () => {
  it('collapses a straight line to its two endpoints', () => {
    const line = Array.from({ length: 50 }, (_, i) => [i * 10, i * 4]).flat();
    expect(simplifyStroke(line)).toEqual([0, 0, 490, 196]);
  });

  it('keeps the corners of an L shape', () => {
    const points = [0, 0, 50, 0, 100, 0, 100, 50, 100, 100];
    expect(simplifyStroke(points)).toEqual([0, 0, 100, 0, 100, 100]);
  });

  it('rounds to integers and drops consecutive duplicates', () => {
    expect(simplifyStroke([0.4, 0.4, 0.2, 0.3, 10.6, 10.4])).toEqual([0, 0, 11, 10]);
  });

  it('keeps a single point as a dot', () => {
    expect(simplifyStroke([12.4, 30.6])).toEqual([12, 31]);
    expect(simplifyStroke([5, 5, 5, 5, 5, 5])).toEqual([5, 5]);
  });

  it('drops the trailing number of an odd-length array', () => {
    expect(simplifyStroke([0, 0, 100, 100, 7])).toEqual([0, 0, 100, 100]);
    expect(simplifyStroke([3])).toEqual([]);
    expect(simplifyStroke([])).toEqual([]);
  });

  it('keeps the first and last points of a noisy 5000-point stroke within the cap', () => {
    let seed = 7;
    const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const stroke: number[] = [];
    for (let i = 0; i < 5000; i += 1) {
      stroke.push(Math.round(i / 5 + random() * 30), Math.round(300 + Math.sin(i / 40) * 200 + random() * 30));
    }
    const result = simplifyStroke(stroke);
    expect(pairs(result)).toBeLessThanOrEqual(MAX_STROKE_POINTS);
    expect(pairs(result)).toBeGreaterThan(2);
    expect(result.slice(0, 2)).toEqual(stroke.slice(0, 2));
    expect(result.slice(-2)).toEqual(stroke.slice(-2));
    expect(result.every(Number.isInteger)).toBe(true);
  });

  it('keeps a closed loop whose first and last points coincide', () => {
    const loop = [0, 0, 100, 0, 100, 100, 0, 100, 0, 0];
    expect(simplifyStroke(loop)).toEqual(loop);
  });
});

describe('normalizeArtifactNotebook', () => {
  it('returns undefined without usable blocks', () => {
    expect(raw(undefined)).toBeUndefined();
    expect(raw(null)).toBeUndefined();
    expect(raw('texto')).toBeUndefined();
    expect(raw({})).toBeUndefined();
    expect(raw({ version: 1, blocks: 'x' })).toBeUndefined();
    expect(raw(notebookOf([]))).toBeUndefined();
    expect(raw(notebookOf([{ id: 'a', kind: 'video' }, null, 4]))).toBeUndefined();
  });

  it('keeps a valid notebook unchanged', () => {
    expect(raw(sampleNotebook())).toEqual(sampleNotebook());
  });

  it('always writes version 1', () => {
    expect(raw({ version: 99, blocks: [{ id: 'a', kind: 'text', text: 'hola' }] })?.version).toBe(1);
  });

  it('drops unknown kinds and text blocks whose text is not a string', () => {
    const result = raw(notebookOf([
      { id: 'a', kind: 'text', text: 'ok' },
      { id: 'b', kind: 'text', text: 42 },
      { id: 'c', kind: 'question' },
      { id: 'd', kind: 'audio' },
    ]));
    expect(result?.blocks.map((block) => block.id)).toEqual(['a']);
  });

  it('coerces resolved to a boolean', () => {
    const result = raw(notebookOf([
      { id: 'a', kind: 'question', text: 'x', resolved: 'yes' },
      { id: 'b', kind: 'question', text: 'x', resolved: true },
      { id: 'c', kind: 'question', text: 'x' },
    ]));
    expect(result?.blocks.map((block) => block.kind === 'question' && block.resolved)).toEqual([false, true, false]);
  });

  it('regenerates missing and duplicate block ids', () => {
    const result = raw(notebookOf([
      { id: 'a', kind: 'text', text: '1' },
      { id: 'a', kind: 'text', text: '2' },
      { kind: 'text', text: '3' },
      { id: '', kind: 'text', text: '4' },
    ]));
    const ids = result?.blocks.map((block) => block.id) ?? [];
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(ids[0]).toBe('a');
    expect(result?.blocks.map((block) => block.kind === 'text' && block.text)).toEqual(['1', '2', '3', '4']);
  });

  it('clamps sketch heights and falls back to the default', () => {
    const result = raw(notebookOf([
      { id: 'a', kind: 'sketch', height: 10, shapes: [] },
      { id: 'b', kind: 'sketch', height: 99999, shapes: [] },
      { id: 'c', kind: 'sketch', height: Number.NaN, shapes: [] },
      { id: 'd', kind: 'sketch', height: '500', shapes: [] },
      { id: 'e', kind: 'sketch', shapes: 'no' },
    ]));
    expect(result?.blocks.map((block) => block.kind === 'sketch' && block.height)).toEqual([
      MIN_SKETCH_HEIGHT, MAX_SKETCH_HEIGHT, DEFAULT_SKETCH_HEIGHT, DEFAULT_SKETCH_HEIGHT, DEFAULT_SKETCH_HEIGHT,
    ]);
    expect(result?.blocks[4]).toMatchObject({ shapes: [] });
  });

  const shapesOf = (shapes: unknown[]): unknown[] => {
    const block = raw(notebookOf([{ id: 's', kind: 'sketch', height: 600, shapes }]))?.blocks[0];
    return block?.kind === 'sketch' ? block.shapes : [];
  };

  it('drops shapes with an unknown kind or colour', () => {
    expect(shapesOf([
      { id: '1', kind: 'rect', color: 'ink', x: 0, y: 0, w: 1, h: 1 },
      { id: '2', kind: 'rect', color: '#ff0000', x: 0, y: 0, w: 1, h: 1 },
      { id: '3', kind: 'rect', color: 'blue', x: 0, y: 0, w: 1, h: 1 },
      { id: '4', kind: 'rect', x: 0, y: 0, w: 1, h: 1 },
      { id: '5', kind: 'circle', color: 'ink', x: 0, y: 0, w: 1, h: 1 },
    ]).map((shape) => (shape as { id: string }).id)).toEqual(['1']);
  });

  it('drops shapes with non-finite or missing numbers and rounds the rest', () => {
    const result = shapesOf([
      { id: '1', kind: 'arrow', color: 'ink', x1: 0, y1: 0, x2: Number.POSITIVE_INFINITY, y2: 5 },
      { id: '2', kind: 'arrow', color: 'ink', x1: 0.4, y1: 0.6, x2: 10.5, y2: -0.4 },
      { id: '3', kind: 'rect', color: 'ink', x: '1', y: 0, w: 1, h: 1 },
      { id: '4', kind: 'text', color: 'ink', x: Number.NaN, y: 0, text: 'a' },
      { id: '5', kind: 'pen', color: 'ink', points: [1, 2, Number.NaN, 4] },
    ]);
    expect(result).toEqual([{ id: '2', kind: 'arrow', color: 'ink', x1: 0, y1: 1, x2: 11, y2: 0 }]);
    expect(Object.is((result[0] as { y2: number }).y2, 0)).toBe(true);
  });

  it('drops text shapes with empty text and keeps the rest', () => {
    expect(shapesOf([
      { id: '1', kind: 'text', color: 'ink', x: 0, y: 0, text: '   ' },
      { id: '2', kind: 'text', color: 'ink', x: 0, y: 0, text: ' hola ' },
      { id: '3', kind: 'text', color: 'ink', x: 0, y: 0 },
    ]).map((shape) => (shape as { id: string }).id)).toEqual(['2']);
  });

  it('sanitizes pen points: even length, integers, capped', () => {
    const [odd] = shapesOf([{ id: '1', kind: 'pen', color: 'red', points: [1.4, 2.6, 3, 4, 9] }]);
    expect(odd).toMatchObject({ points: [1, 3, 3, 4] });
    expect(shapesOf([{ id: '1', kind: 'pen', color: 'red', points: [5] }])).toEqual([]);
    expect(shapesOf([{ id: '1', kind: 'pen', color: 'red', points: 'no' }])).toEqual([]);

    const long = Array.from({ length: 3000 }, (_, i) => [i, (i % 7) * 13]).flat();
    const [capped] = shapesOf([{ id: '1', kind: 'pen', color: 'red', points: long }]) as Array<{ points: number[] }>;
    expect(pairs(capped.points)).toBeLessThanOrEqual(MAX_STROKE_POINTS);
  });

  it('regenerates duplicate shape ids within a sketch', () => {
    const result = shapesOf([
      { id: 'x', kind: 'rect', color: 'ink', x: 0, y: 0, w: 1, h: 1 },
      { id: 'x', kind: 'rect', color: 'ink', x: 5, y: 5, w: 1, h: 1 },
    ]) as Array<{ id: string }>;
    expect(new Set(result.map((shape) => shape.id)).size).toBe(2);
  });

  it('preserves existing text, blocks and shapes beyond editing limits', () => {
    const longText = 'a'.repeat(MAX_TEXT_LENGTH + 500);
    const manyShapes = Array.from({ length: MAX_SHAPES_PER_SKETCH + 20 }, (_, i) => ({ id: `s${i}`, kind: 'rect', color: 'ink', x: i, y: 0, w: 1, h: 1 }));
    const result = raw(notebookOf([
      { id: 't', kind: 'text', text: longText },
      { id: 'q', kind: 'question', text: longText, resolved: false },
      { id: 'k', kind: 'sketch', height: 600, shapes: manyShapes },
    ]));
    const [text, question, sketch] = result?.blocks ?? [];
    expect(text.kind === 'text' && text.text.length).toBe(longText.length);
    expect(question.kind === 'question' && question.text.length).toBe(longText.length);
    expect(sketch.kind === 'sketch' && sketch.shapes.length).toBe(manyShapes.length);

    const manyBlocks = Array.from({ length: MAX_BLOCKS + 10 }, (_, i) => ({ id: `b${i}`, kind: 'text', text: 'x' }));
    expect(raw(notebookOf(manyBlocks))?.blocks).toHaveLength(manyBlocks.length);
  });

  it('preserves oversized sketch text', () => {
    const text = 'a'.repeat(MAX_TEXT_LENGTH + 3);
    expect(shapesOf([{ id: 't', kind: 'text', color: 'ink', x: 0, y: 0, text }])).toEqual([
      { id: 't', kind: 'text', color: 'ink', x: 0, y: 0, text },
    ]);
  });

  it('is idempotent, including repaired input', () => {
    const messy = notebookOf([
      { id: 'a', kind: 'text', text: 'ok' },
      { id: 'a', kind: 'question', text: 'dup', resolved: 1 },
      { kind: 'sketch', height: 5, shapes: [
        { kind: 'pen', color: 'ink', points: Array.from({ length: 2001 }, (_, i) => (i * 37) % 1000) },
        { id: 'q', kind: 'rect', color: 'red', x: 1.5, y: 2.5, w: 3.5, h: 4.5 },
        { id: 'q', kind: 'text', color: 'accent', x: 0, y: 0, text: 'a' },
        { id: 'z', kind: 'rect', color: 'nope', x: 0, y: 0, w: 1, h: 1 },
      ] },
    ]);
    const once = raw(messy);
    expect(once).toBeDefined();
    expect(raw(once)).toEqual(once);
    expect(raw(JSON.parse(JSON.stringify(once)))).toEqual(once);
    expect(raw(sampleNotebook())).toEqual(raw(raw(sampleNotebook())));
  });

  it('does not mutate its input', () => {
    const input = sampleNotebook();
    const copy = structuredClone(input);
    raw(input);
    expect(input).toEqual(copy);
  });
});

describe('notebook helpers', () => {
  it('counts pending and resolved questions', () => {
    const notebook: ArtifactNotebook = { version: 1, blocks: [
      { id: '1', kind: 'question', text: 'abierta', resolved: false },
      { id: '2', kind: 'question', text: '   ', resolved: false },
      { id: '3', kind: 'question', text: 'cerrada', resolved: true },
      { id: '4', kind: 'text', text: 'nota' },
    ] };
    expect(countPendingQuestions(notebook)).toBe(1);
    expect(countResolvedQuestions(notebook)).toBe(1);
    expect(countPendingQuestions(undefined)).toBe(0);
    expect(countResolvedQuestions(undefined)).toBe(0);
  });

  it('counts pen point pairs across sketches', () => {
    expect(countNotebookPoints(sampleNotebook())).toBe(3 + 1);
    expect(countNotebookPoints(undefined)).toBe(0);
  });

  it('detects empty blocks and notebooks', () => {
    expect(isNotebookBlockEmpty({ id: 'a', kind: 'text', text: ' \n' })).toBe(true);
    expect(isNotebookBlockEmpty({ id: 'a', kind: 'question', text: 'x', resolved: false })).toBe(false);
    expect(isNotebookBlockEmpty({ id: 'a', kind: 'sketch', height: 600, shapes: [] })).toBe(true);
    expect(isNotebookBlockEmpty(sampleNotebook().blocks[3])).toBe(false);
    expect(isNotebookEmpty(undefined)).toBe(true);
    expect(isNotebookEmpty({ version: 1, blocks: [] })).toBe(true);
    expect(isNotebookEmpty({ version: 1, blocks: [createNotebookBlock('text'), createNotebookBlock('sketch')] })).toBe(true);
    expect(isNotebookEmpty(sampleNotebook())).toBe(false);
  });

  it('creates fresh blocks with unique ids', () => {
    const blocks: NotebookBlock[] = [createNotebookBlock('text'), createNotebookBlock('question'), createNotebookBlock('sketch'), createNotebookBlock('text')];
    expect(new Set(blocks.map((block) => block.id)).size).toBe(4);
    expect(blocks[0]).toMatchObject({ kind: 'text', text: '' });
    expect(blocks[1]).toMatchObject({ kind: 'question', text: '', resolved: false });
    expect(blocks[2]).toMatchObject({ kind: 'sketch', height: DEFAULT_SKETCH_HEIGHT, shapes: [] });
  });
});
