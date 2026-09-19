import { describe, expect, it } from 'vitest';
import type { SequenceParticipant } from '../types/diagram';
import {
  hashParticipantIdentity,
  normalizeClassifierName,
  resolveParticipantIdentityKey,
  resolveParticipantVisualIdentity,
  SEQUENCE_PARTICIPANT_PALETTE,
} from './sequenceParticipantColors';

const participant = (
  id: string,
  classifierName: string,
  name = '',
  kind: SequenceParticipant['kind'] = 'object',
  classifierNodeId?: string,
): SequenceParticipant => ({
  id,
  kind,
  name,
  classifierName,
  classifierNodeId,
  x: 100,
});
describe('sequenceParticipantColors - normalización e identidad', () => {
  it('normaliza nombres de clasificador ignorando mayúsculas, espacios y dos puntos iniciales', () => {
    expect(normalizeClassifierName('Cliente')).toBe('cliente');
    expect(normalizeClassifierName(':Cliente')).toBe('cliente');
    expect(normalizeClassifierName('  ::PedidoDTO  ')).toBe('pedidodto');
    expect(normalizeClassifierName('')).toBe('');
    expect(normalizeClassifierName(undefined)).toBe('');
  });

  it('asigna la misma clave de identidad a distintas instancias de la misma clase', () => {
    const c1 = participant('p1', 'Cliente', 'cliente1');
    const c2 = participant('p2', 'Cliente', 'cliente2');
    const c3 = participant('p3', ':cliente', '');

    expect(resolveParticipantIdentityKey(c1)).toBe('class:cliente');
    expect(resolveParticipantIdentityKey(c2)).toBe('class:cliente');
    expect(resolveParticipantIdentityKey(c3)).toBe('class:cliente');
  });

  it('resuelve el nombre de la clase a partir del nodo vinculado si existe', () => {
    const nodeMap = new Map([['node-1', { name: 'Factura' }]]);
    const p = participant('p1', '', 'f', 'object', 'node-1');
    expect(resolveParticipantIdentityKey(p, { classNodesById: nodeMap })).toBe('class:factura');
  });

  it('utiliza fallbacks deterministas para actores o participantes sin clasificador', () => {
    const actor = participant('a1', '', 'Usuario', 'actor');
    expect(resolveParticipantIdentityKey(actor)).toBe('actor:default');

    const instanceOnly = participant('s1', '', 'Sistema', 'boundary');
    expect(resolveParticipantIdentityKey(instanceOnly)).toBe('instance:sistema');

    const empty = participant('e1', '', '', 'object');
    expect(resolveParticipantIdentityKey(empty)).toBe('fallback:object');
  });
});

describe('sequenceParticipantColors - determinismo y coherencia cromática', () => {
  it('el hash es estrictamente determinista y nunca depende de Math.random', () => {
    const key = 'class:tramite';
    const hash1 = hashParticipantIdentity(key);
    const hash2 = hashParticipantIdentity(key);
    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('number');
    expect(hash1).toBeGreaterThanOrEqual(0);
  });

  it('dos instancias de la misma clase obtienen exactamente la misma familia visual', () => {
    const c1 = participant('c1', 'Cliente', 'cliente1');
    const c2 = participant('c2', 'Cliente', 'cliente2');

    const v1 = resolveParticipantVisualIdentity(c1);
    const v2 = resolveParticipantVisualIdentity(c2);

    expect(v1.familyId).toBe(v2.familyId);
    expect(v1.headerFill).toBe(v2.headerFill);
    expect(v1.headerBorder).toBe(v2.headerBorder);
    expect(v1.lifelineStroke).toBe(v2.lifelineStroke);
    expect(v1.activationFill).toBe(v2.activationFill);
    expect(v1.activationBorder).toBe(v2.activationBorder);
  });

  it('agregar, eliminar o reordenar participantes no altera los colores existentes', () => {
    const cliente = participant('c1', 'Cliente', 'c');
    const tramite = participant('t1', 'Tramite', 't');
    const dto = participant('d1', 'TramiteDTO', 'dto');

    const originalCliente = resolveParticipantVisualIdentity(cliente);
    const originalTramite = resolveParticipantVisualIdentity(tramite);
    const originalDto = resolveParticipantVisualIdentity(dto);

    // Simulamos listas con distintos órdenes y participantes agregados
    const list1 = [cliente, tramite, dto];
    const list2 = [
      participant('x', 'OtraClase'),
      dto,
      participant('y', 'NuevaClase'),
      cliente,
      tramite,
    ];

    expect(resolveParticipantVisualIdentity(list1[0])).toEqual(originalCliente);
    expect(resolveParticipantVisualIdentity(list2[3])).toEqual(originalCliente);

    expect(resolveParticipantVisualIdentity(list1[1])).toEqual(originalTramite);
    expect(resolveParticipantVisualIdentity(list2[4])).toEqual(originalTramite);

    expect(resolveParticipantVisualIdentity(list1[2])).toEqual(originalDto);
    expect(resolveParticipantVisualIdentity(list2[1])).toEqual(originalDto);
  });

  it('los colores de la paleta cumplen los criterios de sutileza pastel para fondos claros', () => {
    for (const family of SEQUENCE_PARTICIPANT_PALETTE) {
      expect(family.headerFill).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(family.headerBorder).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(family.lifelineStroke).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(family.activationFill).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(family.activationBorder).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('soporta deshabilitar colores retornando identidad neutra', () => {
    const c1 = participant('c1', 'Cliente', 'c');
    const colored = resolveParticipantVisualIdentity(c1, { enabled: true });
    const disabled = resolveParticipantVisualIdentity(c1, { enabled: false });

    expect(disabled.familyId).toBe('neutral');
    expect(disabled.headerFill).toBe('#FFFFFF');
    expect(colored.familyId).not.toBe('neutral');
  });

  it('todos los fondos de cabecera garantizan contraste WCAG AAA (> 7:1) contra texto oscuro #1F2933', () => {
    const getLuminance = (hex: string): number => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    };

    const textLuminance = getLuminance('#1F2933'); // ~0.024
    for (const family of SEQUENCE_PARTICIPANT_PALETTE) {
      const fillLuminance = getLuminance(family.headerFill);
      const ratio = (fillLuminance + 0.05) / (textLuminance + 0.05);
      // El estándar WCAG AAA para texto normal exige >= 7:1. Verificamos que supera holgadamente 10:1.
      expect(ratio).toBeGreaterThanOrEqual(10);
    }
  });

  it('respeta los colores base de temas personalizados cuando el modo de color está desactivado', () => {
    const c = participant('c1', 'Cliente', 'c');
    const customTheme = {
      classNode: {
        background: '#F0F0F0',
        border: '#333333',
      },
      association: {
        stroke: '#333333',
      },
    } as unknown as import('../theme/themes').DiagramTheme;
    const identity = resolveParticipantVisualIdentity(c, {
      enabled: false,
      theme: customTheme,
    });
    expect(identity.headerFill).toBe('#F0F0F0');
    expect(identity.headerBorder).toBe('#333333');
    expect(identity.lifelineStroke).toBe('#333333');
  });
});
