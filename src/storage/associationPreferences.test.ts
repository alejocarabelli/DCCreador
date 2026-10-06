import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAssociationLineStyle, writeAssociationLineStyle } from './associationPreferences';

afterEach(() => vi.unstubAllGlobals());

describe('association line style preference', () => {
  it.each([null, 'automatic', 'invalid', 'orthogonal'])('defaults stored %s to orthogonal', (stored) => {
    vi.stubGlobal('localStorage', { getItem: () => stored });
    expect(readAssociationLineStyle()).toBe('orthogonal');
  });

  it('remembers a straight line style across reads', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
    expect(writeAssociationLineStyle('straight')).toBe(true);
    expect(values.get('modelador.associationLineStyle')).toBe('straight');
    expect(readAssociationLineStyle()).toBe('straight');
    writeAssociationLineStyle('orthogonal');
    expect(readAssociationLineStyle()).toBe('orthogonal');
  });

  it('keeps working when local storage throws on reading or writing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage unavailable'); },
      setItem: () => { throw new Error('Storage unavailable'); },
    });
    expect(readAssociationLineStyle()).toBe('orthogonal');
    expect(writeAssociationLineStyle('straight')).toBe(false);
  });
});
