import { describe, expect, it } from 'vitest';
import { ARTIFACT_TYPES, artifactTypeInfo } from './artifactTypes';

describe('artifact type count labels', () => {
  it('uses a singular form that reads right with 1', () => {
    expect(artifactTypeInfo('class-sequence-diagram').countLabel).toEqual([
      'modelo de clases de secuencias',
      'modelos de clases de secuencias',
    ]);
  });

  it('gives every type a singular and a different plural', () => {
    for (const type of ARTIFACT_TYPES) {
      const [singular, plural] = type.countLabel;
      expect(singular.length).toBeGreaterThan(0);
      expect(plural).not.toBe(singular);
      expect(plural.startsWith(singular.split(' ')[0].replace(/s$/, ''))).toBe(true);
    }
  });
});
