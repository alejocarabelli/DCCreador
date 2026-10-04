import { describe, expect, it } from 'vitest';
import {
  buildSequenceParticipantFromLabel,
  createSequenceParticipantFromLabel,
  formatSequenceParticipantLabel,
  parseSequenceParticipantLabel,
  resolveSequenceParticipantInsertionX,
} from './sequenceParticipantEditing';
import { getSequenceParticipantHeaderWidth } from './sequenceDiagramGeometry';

describe('sequence participant textual editing', () => {
  it.each([
    ['TramiteActual:Tramite', { instanceName: 'TramiteActual', classifierName: 'Tramite' }],
    [':UIAsentarResultado', { instanceName: '', classifierName: 'UIAsentarResultado' }],
    ['  TramiteActual  :  Tramite  ', { instanceName: 'TramiteActual', classifierName: 'Tramite' }],
    ['ExpertoCU', { instanceName: '', classifierName: 'ExpertoCU' }],
  ])('parses %s with the shared contract', (text, expected) => {
    expect(parseSequenceParticipantLabel(text)).toEqual(expected);
  });

  it('builds the same persisted participant for normal and keyboard surfaces', () => {
    const normal = buildSequenceParticipantFromLabel({ id: 'p-normal', text: 'TramiteActual:Tramite', x: 120 });
    const keyboard = buildSequenceParticipantFromLabel({ id: 'p-keyboard', text: 'TramiteActual:Tramite', x: 120 });

    expect(normal).not.toBeNull();
    expect(keyboard).not.toBeNull();
    expect({ ...normal, id: 'same' }).toEqual({ ...keyboard, id: 'same' });
    expect(formatSequenceParticipantLabel(normal!)).toBe('TramiteActual:Tramite');
  });

  it('shares id allocation and measured insertion for every creation surface', () => {
    const existing = [{ id: 'existing', kind: 'object' as const, name: 'Base', classifierName: 'Base', x: 120 }];
    const normal = createSequenceParticipantFromLabel({ text: 'TramiteActual:Tramite', participants: existing });
    const keyboard = createSequenceParticipantFromLabel({ text: 'TramiteActual:Tramite', participants: existing });

    expect(normal).toMatchObject({ kind: 'object', name: 'TramiteActual', classifierName: 'Tramite' });
    expect(keyboard).toMatchObject({ kind: 'object', name: 'TramiteActual', classifierName: 'Tramite' });
    expect(normal?.x).toBe(keyboard?.x);
    expect(normal?.x).toBeGreaterThan(existing[0].x);
    expect(normal?.id).not.toBe(keyboard?.id);
  });

  it('rejects an empty classifier while allowing an empty instance', () => {
    expect(buildSequenceParticipantFromLabel({ id: 'invalid', text: 'Instancia:', x: 120 })).toBeNull();
    expect(buildSequenceParticipantFromLabel({ id: 'valid', text: ':Clase', x: 120 })).toMatchObject({
      name: '', classifierName: 'Clase', kind: 'object',
    });
  });

  it.each([-1, 1] as const)('leaves 40 px between headers when inserting to side %s', (side) => {
    const existing = { id: 'base', kind: 'object' as const, name: 'unaInstanciaLarga', classifierName: 'ClaseBase', x: 700 };
    const participant = { kind: 'object' as const, name: '', classifierName: 'ClaseNueva' };
    const x = resolveSequenceParticipantInsertionX([existing], participant, side);
    const gap = Math.abs(x - existing.x)
      - getSequenceParticipantHeaderWidth(existing) / 2
      - getSequenceParticipantHeaderWidth(participant) / 2;
    expect(gap).toBeCloseTo(40, 0);
  });

  it('shows legacy leading classifier separators only once', () => {
    expect(formatSequenceParticipantLabel({ name: 'instancia', classifierName: ':Clase' })).toBe('instancia:Clase');
    expect(formatSequenceParticipantLabel({ name: '', classifierName: ':Clase' })).toBe(':Clase');
  });
});
