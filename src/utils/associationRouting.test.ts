import { Position } from 'reactflow';
import { describe, expect, it } from 'vitest';
import type { ClassDiagramEdge } from '../types/diagram';
import { normalizeAssociationData } from './association';
import {
  buildAssociationPath,
  getAssociationCenterLabelPosition,
  resolveAssociationHandles,
  resolveAutomaticNoteHandles,
} from './associationRouting';

const automaticEdge: ClassDiagramEdge = {
  id: 'edge',
  source: 'source',
  target: 'target',
  type: 'association',
  data: normalizeAssociationData({ sourceSide: 'automatic', targetSide: 'automatic' }),
};

describe('association geometry', () => {
  it('moves automatic endpoints when classes exchange vertical order', () => {
    const upper = { position: { x: 100, y: 20 }, width: 220, height: 100 };
    const lower = { position: { x: 110, y: 300 }, width: 220, height: 100 };

    expect(resolveAssociationHandles(automaticEdge, upper, lower)).toMatchObject({
      sourceSide: 'bottom',
      targetSide: 'top',
    });
    expect(resolveAssociationHandles(automaticEdge, lower, upper)).toMatchObject({
      sourceSide: 'top',
      targetSide: 'bottom',
    });
  });

  it('selects an offset slot while preserving central handle ids', () => {
    const source = { position: { x: 0, y: 0 }, width: 220, height: 120 };
    const target = { position: { x: 400, y: 220 }, width: 220, height: 120 };
    const handles = resolveAssociationHandles(automaticEdge, source, target);

    expect(handles.sourceHandle).toBe('right-end');
    expect(handles.targetHandle).toBe('left-start');

    const centeredTarget = { position: { x: 400, y: 0 }, width: 220, height: 120 };
    expect(resolveAssociationHandles(automaticEdge, source, centeredTarget)).toMatchObject({
      sourceHandle: 'right',
      targetHandle: 'left',
    });
  });

  it('respects a manual endpoint and derives the opposite automatic side', () => {
    const edge: ClassDiagramEdge = {
      ...automaticEdge,
      data: normalizeAssociationData({ sourceSide: 'top', targetSide: 'automatic' }),
    };
    const handles = resolveAssociationHandles(
      edge,
      { position: { x: 0, y: 0 }, width: 220, height: 100 },
      { position: { x: 400, y: 0 }, width: 220, height: 100 },
    );

    expect(handles.sourceHandle).toBe('top');
    expect(handles.targetSide).toBe('bottom');
  });

  it('uses opposing note endpoints based on relative position', () => {
    const classNode = { position: { x: 100, y: 100 }, width: 220, height: 100 };
    const noteBelow = { position: { x: 120, y: 280 }, width: 180, height: 90 };

    expect(resolveAutomaticNoteHandles(classNode, noteBelow)).toEqual({
      sourceHandle: 'bottom',
      targetHandle: 'top',
    });
  });

  it('builds a sharp orthogonal preview for diagonal endpoints', () => {
    const resolution = buildAssociationPath({
      sourceX: 0,
      sourceY: 0,
      targetX: 300,
      targetY: 180,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      lineStyle: 'automatic',
    });

    expect(resolution.style).toBe('orthogonal');
    expect(resolution.path).toContain('L');
    expect(Number.isFinite(resolution.labelX)).toBe(true);
    expect(Number.isFinite(resolution.labelY)).toBe(true);
  });

  it('places a relationship label above predominantly horizontal paths', () => {
    expect(getAssociationCenterLabelPosition(150, 90, 0, 80, 300, 100)).toEqual({
      x: 150,
      y: 76,
    });
  });

  it('places a relationship label beside predominantly vertical paths', () => {
    expect(getAssociationCenterLabelPosition(90, 150, 80, 0, 100, 300)).toEqual({
      x: 104,
      y: 150,
    });
  });
});
