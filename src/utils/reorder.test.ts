import { describe, expect, it } from 'vitest';
import { reorderItemsByIds } from './reorder';

const items = [
  { id: 'first', value: 'A' },
  { id: 'second', value: 'B' },
  { id: 'third', value: 'C' },
];

describe('reorderItemsByIds', () => {
  it('applies a complete order without mutating the source', () => {
    expect(reorderItemsByIds(items, ['third', 'first', 'second']).map((item) => item.id)).toEqual([
      'third',
      'first',
      'second',
    ]);
    expect(items.map((item) => item.id)).toEqual(['first', 'second', 'third']);
  });

  it('keeps the same array when the order is unchanged or invalid', () => {
    expect(reorderItemsByIds(items, ['first', 'second', 'third'])).toBe(items);
    expect(reorderItemsByIds(items, ['first', 'second'])).toBe(items);
    expect(reorderItemsByIds(items, ['first', 'second', 'missing'])).toBe(items);
    expect(reorderItemsByIds(items, ['first', 'first', 'third'])).toBe(items);
  });
});
