import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import ReactFlow, { type Connection, type EdgeChange, type NodeChange } from 'reactflow';
import { createMemoryStorage, runtime, stubBrowser } from '../hooks/testHookHarness';
import { themes } from '../theme/themes';
import { MULTI_SELECT_HINT_KEY } from '../storage/uiPreferences';
import { shortcutLabel } from '../utils/shortcutLabel';
import type { DesignProject, UseCaseModelArtifact, UseCaseModelEdge, UseCaseModelNode } from '../types/diagram';
import { UseCaseModelEditor } from './UseCaseModelEditor';
import { InspectorDeleteButton, InspectorPanel } from './ui/Panel';
import { ToolButton } from './ui/Toolbar';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const { runtime: hooks } = await import('../hooks/testHookHarness');
  return { ...actual, ...hooks.api, useLayoutEffect: hooks.api.useEffect };
});
vi.mock('../hooks/useGentleWheelZoom', () => ({ useGentleWheelZoom: vi.fn() }));
vi.mock('../hooks/useArtifactViewMemory', () => ({ useArtifactViewport: () => ({ defaultViewport: undefined, onMoveEnd: vi.fn() }) }));
vi.mock('../hooks/useDiagramImageExport', () => ({ useDiagramImageExport: () => ({ exportPng: vi.fn(), exportPdf: vi.fn() }) }));

type TestElement = ReactElement<Record<string, unknown>>;
const elements = (node: unknown): TestElement[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(elements)];
};
const findAll = (tree: unknown, predicate: (node: TestElement) => boolean): TestElement[] => elements(tree).filter(predicate);
const find = (tree: unknown, predicate: (node: TestElement) => boolean): TestElement => {
  const node = findAll(tree, predicate)[0];
  if (!node) throw new Error('Element not found');
  return node;
};
const text = (node: unknown): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (isValidElement<{ children?: unknown }>(node)) return text(node.props.children);
  return '';
};

type FlowProps = {
  onConnect: (connection: Connection) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onNodeClick: (event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; target?: unknown }, node?: { id: string }) => void;
};

const onChangeContent = vi.fn();
let artifact: UseCaseModelArtifact;
let project: DesignProject;

const actor = (id: string, name: string, x: number): UseCaseModelNode => ({
  id, type: 'useCaseActor', position: { x, y: 0 }, data: { kind: 'actor', name },
});
const useCase = (id: string, name: string, x: number): UseCaseModelNode => ({
  id, type: 'useCaseOval', position: { x, y: 160 }, data: { kind: 'use-case', name },
});
const relation = (id: string, source: string, target: string): UseCaseModelEdge => ({
  id, source, target, type: 'useCaseRelation', data: { relationType: 'association' },
});

const setContent = (nodes: UseCaseModelNode[], edges: UseCaseModelEdge[] = []): void => {
  artifact = { id: 'use-cases', type: 'use-case-model', name: 'Casos', createdAt: 'now', updatedAt: 'now', content: { nodes, edges } };
  project = { id: 'project', name: 'Proyecto', createdAt: 'now', updatedAt: 'now', activeArtifactId: artifact.id, artifacts: [artifact] };
};

const renderEditor = () => {
  runtime.begin();
  return UseCaseModelEditor({
    artifact, project, theme: themes[0], canUndo: false, canRedo: false,
    onChangeContent, onUndo: vi.fn(), onRedo: vi.fn(),
  });
};
const flowProps = (tree: unknown): FlowProps => find(tree, (node) => node.type === ReactFlow).props as unknown as FlowProps;
const select = (ids: string[]): void => {
  flowProps(renderEditor()).onNodesChange(ids.map((id) => ({ type: 'select', id, selected: true })) as NodeChange[]);
};
const lastCall = () => onChangeContent.mock.calls.at(-1) as [{ nodes: UseCaseModelNode[]; edges: UseCaseModelEdge[] }, unknown];

beforeEach(() => {
  runtime.reset();
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', createMemoryStorage());
  stubBrowser();
  setContent([actor('a1', 'Cliente', 0), useCase('u1', 'Pagar', 300), useCase('u2', 'Cancelar', 600)], [relation('r1', 'a1', 'u1')]);
});
afterEach(() => {
  runtime.reset();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('use-case relations take their own history step', () => {
  it('connecting two elements opens a step of its own', () => {
    flowProps(renderEditor()).onConnect({ source: 'a1', target: 'u2', sourceHandle: null, targetHandle: null });

    const [content, options] = lastCall();
    expect(content.edges).toHaveLength(2);
    expect(options).toEqual({ separateHistoryEntry: true });
  });

  it('removing a relation from the canvas opens a step of its own', () => {
    flowProps(renderEditor()).onEdgesChange([{ type: 'remove', id: 'r1' }]);

    const [content, options] = lastCall();
    expect(content.edges).toHaveLength(0);
    expect(options).toEqual({ separateHistoryEntry: true });
  });

  it('adding or removing a relation from the participation checklist opens a step of its own', () => {
    select(['a1']);
    const toggleIn = (tree: unknown) => find(tree, (node) => typeof node.props.onToggleAssociation === 'function').props.onToggleAssociation as (actorId: string, useCaseId: string) => void;

    toggleIn(renderEditor())('a1', 'u2');
    expect(lastCall()[0].edges).toHaveLength(2);
    expect(lastCall()[1]).toEqual({ separateHistoryEntry: true });

    // The editor shows what was saved, so the next change starts from the saved relations.
    setContent(lastCall()[0].nodes, lastCall()[0].edges);
    toggleIn(renderEditor())('a1', 'u1');
    expect(lastCall()[0].edges.map((edge) => edge.target)).toEqual(['u2']);
    expect(lastCall()[1]).toEqual({ separateHistoryEntry: true });
  });

  it('moving an element does not open a step of its own, so it joins the burst', () => {
    flowProps(renderEditor()).onNodesChange([{ type: 'position', id: 'u1', position: { x: 340, y: 160 }, dragging: true }] as NodeChange[]);

    expect(lastCall()[1]).toBeUndefined();
  });
});

describe('selecting several elements', () => {
  it('one inspector for the whole set, and its button deletes the set in one step', () => {
    select(['a1', 'u1']);
    const tree = renderEditor();

    const panel = find(tree, (node) => node.type === InspectorPanel);
    expect(panel.props.title).toBe('2 elementos seleccionados');
    expect(text(tree)).toContain('Arrastrá cualquiera para moverlos juntos.');

    (find(tree, (node) => node.type === InspectorDeleteButton && node.props.label === 'Eliminar 2 elementos').props.onClick as () => void)();
    const [content, options] = lastCall();
    expect(content.nodes.map((node) => node.id)).toEqual(['u2']);
    expect(content.edges).toEqual([]);
    expect(options).toEqual({ separateHistoryEntry: true });
  });

  it('a click on a name selects, and with Mayús adds, although React Flow does not select there', () => {
    const onName = { closest: (selector: string) => (selector === '.nodrag' ? {} : null) };
    flowProps(renderEditor()).onNodeClick({ shiftKey: false, metaKey: false, ctrlKey: false, target: onName }, { id: 'u1' });
    flowProps(renderEditor()).onNodeClick({ shiftKey: true, metaKey: false, ctrlKey: false, target: onName }, { id: 'a1' });

    expect(find(renderEditor(), (node) => node.type === InspectorPanel).props.title).toBe('2 elementos seleccionados');
  });

  it('one selected element keeps the single inspector', () => {
    select(['u1']);
    const panel = find(renderEditor(), (node) => node.type === InspectorPanel);

    expect(panel.props.title).toBe('Pagar');
    expect(panel.props.kind).toBe('Caso de uso');
  });
});

describe('the multi-select hint', () => {
  const hintText = shortcutLabel('Consejo: con Mayús+clic o ⌘ clic sumás elementos a la selección.');
  const feedback = (tree: unknown): string | null => {
    const node = findAll(tree, (candidate) => candidate.props.className === 'editor-feedback')[0];
    return node ? text(node) : null;
  };

  it('is shown on the first plain click, then never again', () => {
    flowProps(renderEditor()).onNodeClick({ shiftKey: false, metaKey: false, ctrlKey: false });
    expect(feedback(renderEditor())).toBe(hintText);
    expect(localStorage.getItem(MULTI_SELECT_HINT_KEY)).toBe('true');

    vi.advanceTimersByTime(2000);
    flowProps(renderEditor()).onNodeClick({ shiftKey: false, metaKey: false, ctrlKey: false });
    expect(feedback(renderEditor())).toBeNull();
  });

  it('is not shown for a click that already adds to the selection', () => {
    flowProps(renderEditor()).onNodeClick({ shiftKey: true, metaKey: false, ctrlKey: false });
    expect(feedback(renderEditor())).toBeNull();
    expect(localStorage.getItem(MULTI_SELECT_HINT_KEY)).toBeNull();
  });
});

describe('toolbar emphasis while the model has no actor', () => {
  const variantOf = (tree: unknown, label: string) => find(tree, (node) => node.type === ToolButton && node.props.label === label).props.variant;

  it('the filled button creates an actor until there is one', () => {
    setContent([useCase('u1', 'Pagar', 300)]);
    const tree = renderEditor();

    expect(variantOf(tree, 'Actor')).toBe('primary');
    expect(variantOf(tree, 'Caso de uso')).toBe('default');
  });

  it('goes back to the use case button once there is an actor', () => {
    const tree = renderEditor();

    expect(variantOf(tree, 'Actor')).toBe('default');
    expect(variantOf(tree, 'Caso de uso')).toBe('primary');
  });
});
