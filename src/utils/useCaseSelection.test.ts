import { describe, expect, it } from 'vitest';
import { applyNodeChanges, type NodeChange } from 'reactflow';
import type { ClassDiagramNode, UseCaseModelEdge, UseCaseModelNode } from '../types/diagram';
import { normalizeDiagramContent, normalizeUseCaseModelContent } from './diagramNormalization';
import { changeHistory, type ArtifactHistory } from './artifactHistory';

// B2: selecting nodes must not change the saved content (and so must not enter
// the undo history). UseCaseModelEditor.onNodesChange (line ~399) feeds React
// Flow's changes through applyNodeChanges and then commitContent, which runs
// normalizeUseCaseModelContent. App.tsx:405-407 compares the JSON of the old and
// new content to decide whether to push a history entry.

const actor = (id: string, name: string, x: number): UseCaseModelNode => ({
  id, type: 'useCaseActor', position: { x, y: 0 }, data: { kind: 'actor', name },
});
const caseNode = (id: string, name: string, x: number): UseCaseModelNode => ({
  id, type: 'useCaseOval', position: { x, y: 120 }, data: { kind: 'use-case', name },
});

// What App.tsx compares: the artifact content before and after the change.
const asStored = (nodes: UseCaseModelNode[], edges: UseCaseModelEdge[]): string =>
  JSON.stringify(normalizeUseCaseModelContent({ nodes, edges }));

// Same step UseCaseModelEditor.onNodesChange performs for a change set.
const applyChanges = (base: { nodes: UseCaseModelNode[]; edges: UseCaseModelEdge[] }, changes: NodeChange[]) =>
  normalizeUseCaseModelContent({
    nodes: applyNodeChanges(changes, base.nodes) as UseCaseModelNode[],
    edges: base.edges,
  });

const base = normalizeUseCaseModelContent({
  nodes: [actor('a1', 'Cliente', 0), caseNode('u1', 'Pagar', 240), caseNode('u2', 'Cancelar', 480)],
  edges: [],
});

describe('B2 use-case model: selection is not content', () => {
  it('selecting a node leaves the saved content identical', () => {
    const selected = applyChanges(base, [{ type: 'select', id: 'u1', selected: true }]);
    expect(asStored(selected.nodes, selected.edges)).toBe(asStored(base.nodes, base.edges));
  });

  it('selecting another node after the first leaves the saved content identical', () => {
    const first = applyChanges(base, [{ type: 'select', id: 'u1', selected: true }]);
    const second = applyChanges(first, [
      { type: 'select', id: 'u1', selected: false },
      { type: 'select', id: 'u2', selected: true },
    ]);
    expect(asStored(second.nodes, second.edges)).toBe(asStored(base.nodes, base.edges));
  });

  it('after undo, a selection keeps the redo entry', () => {
    // State after one move, then undo (App.tsx:519-537): the content is `base`, future holds the moved content.
    const moved = applyChanges(base, [{ type: 'position', id: 'u1', position: { x: 300, y: 120 } }]);
    let history: ArtifactHistory<string> = { past: [], future: [asStored(moved.nodes, moved.edges)] };

    // Selecting u1 goes through App.tsx:405-407 (JSON guard) and 421-426 (changeHistory, separate entry after undo).
    const selected = applyChanges(base, [{ type: 'select', id: 'u1', selected: true }]);
    const previous = asStored(base.nodes, base.edges);
    const next = asStored(selected.nodes, selected.edges);
    if (previous !== next) history = changeHistory(history, previous, true);

    expect(history.future).toHaveLength(1);
  });

  it('a measurement report from React Flow leaves the saved content identical', () => {
    const measured = applyChanges(base, [{ type: 'dimensions', id: 'u1', dimensions: { width: 140, height: 56 } }]);
    expect(asStored(measured.nodes, measured.edges)).toBe(asStored(base.nodes, base.edges));
  });

  it('a system boundary resized by the user keeps its new size as content', () => {
    const boundary = normalizeUseCaseModelContent({
      nodes: [{ id: 'b1', type: 'systemBoundary', position: { x: 0, y: 0 }, data: { kind: 'system-boundary', name: 'Sistema' }, style: { width: 520, height: 340 } }],
      edges: [],
    });
    const resized = applyChanges(boundary, [{ type: 'dimensions', id: 'b1', dimensions: { width: 600, height: 400 }, updateStyle: true }]);
    expect(resized.nodes[0].style).toEqual({ width: 600, height: 400 });
  });
});

describe('B2 reference: class editor keeps selection out of content', () => {
  it('normalizeDiagramContent strips selected from class nodes', () => {
    const classNode = (id: string, selected: boolean): ClassDiagramNode => ({
      id, type: 'classNode', position: { x: 0, y: 0 }, selected,
      data: { name: 'Cliente', attributes: [], methods: [] },
    } as ClassDiagramNode);
    expect(JSON.stringify(normalizeDiagramContent({ nodes: [classNode('c1', true)], edges: [] })))
      .toBe(JSON.stringify(normalizeDiagramContent({ nodes: [classNode('c1', false)], edges: [] })));
  });
});
