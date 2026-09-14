import { describe, expect, it } from 'vitest';
import { normalizeAssociationData, normalizeAssociationEdge, resolveAssociationLineStyle } from './association';

describe('association routing', () => {
  it('uses orthogonal routing automatically for diagonal endpoints', () => {
    expect(resolveAssociationLineStyle('automatic', 280, 160)).toBe('orthogonal');
  });

  it('keeps aligned endpoints straight in automatic mode', () => {
    expect(resolveAssociationLineStyle('automatic', 280, 4)).toBe('straight');
    expect(resolveAssociationLineStyle('automatic', 5, 220)).toBe('straight');
  });

  it('respects an explicitly selected line style', () => {
    expect(resolveAssociationLineStyle('straight', 280, 160)).toBe('straight');
    expect(resolveAssociationLineStyle('orthogonal', 280, 0)).toBe('orthogonal');
  });

  it('defaults new and incomplete associations to automatic routing', () => {
    expect(normalizeAssociationData(undefined).lineStyle).toBe('automatic');
  });

  it('preserves an optional relationship label for old and new projects', () => {
    expect(normalizeAssociationData({ name: 'responsable' }).name).toBe('responsable');
    expect(normalizeAssociationData(undefined).name).toBe('');
  });

  it('preserves the exact connection point selected on each class', () => {
    const edge = normalizeAssociationEdge({
      id: 'edge-1',
      source: 'class-1',
      sourceHandle: 'right-start',
      target: 'class-2',
      targetHandle: 'left-end',
      type: 'association',
      data: normalizeAssociationData({ sourceSide: 'automatic', targetSide: 'automatic' }),
    });

    expect(edge.sourceHandle).toBe('right-start');
    expect(edge.targetHandle).toBe('left-end');
  });

  it('keeps the compatible central connection points available', () => {
    const edge = normalizeAssociationEdge({
      id: 'edge-2',
      source: 'class-1',
      sourceHandle: 'bottom',
      target: 'class-2',
      targetHandle: 'top',
      type: 'association',
      data: normalizeAssociationData({ sourceSide: 'automatic', targetSide: 'automatic' }),
    });

    expect(edge.sourceHandle).toBe('bottom');
    expect(edge.targetHandle).toBe('top');
  });

  it('preserves handles from a newly created connection through normalization', () => {
    const connection = {
      id: 'edge-created',
      source: 'class-1',
      sourceHandle: 'right-end',
      target: 'class-2',
      targetHandle: 'left-start',
      type: 'association' as const,
      data: normalizeAssociationData(undefined),
    };

    const normalized = normalizeAssociationEdge(connection);

    expect(normalized.sourceHandle).toBe(connection.sourceHandle);
    expect(normalized.targetHandle).toBe(connection.targetHandle);
  });

  it('preserves the handles selected by a manual reconnection', () => {
    const original = normalizeAssociationEdge({
      id: 'edge-reconnected',
      source: 'class-1',
      sourceHandle: 'right',
      target: 'class-2',
      targetHandle: 'left',
      type: 'association',
      data: normalizeAssociationData(undefined),
    });

    const manuallyReconnected = normalizeAssociationEdge({
      ...original,
      source: 'class-3',
      sourceHandle: 'bottom-end',
      target: 'class-4',
      targetHandle: 'top-start',
    });

    expect(manuallyReconnected.sourceHandle).toBe('bottom-end');
    expect(manuallyReconnected.targetHandle).toBe('top-start');
  });

  it('does not infer new handles when an association is normalized again', () => {
    const edge = normalizeAssociationEdge({
      id: 'edge-stable',
      source: 'class-1',
      sourceHandle: 'right-end',
      target: 'class-2',
      targetHandle: 'left-start',
      type: 'association',
      data: normalizeAssociationData(undefined),
    });

    const afterNodeMove = normalizeAssociationEdge(edge);

    expect(afterNodeMove.sourceHandle).toBe('right-end');
    expect(afterNodeMove.targetHandle).toBe('left-start');
  });
});
