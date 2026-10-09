import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ComponentProps } from 'react';
import { runtime, createMemoryStorage } from '../hooks/testHookHarness';
import { SequenceDiagramEditor } from './SequenceDiagramEditor';
import { SequenceDiagramCanvas } from './SequenceDiagramCanvas';
import { SequenceMessageDialog } from './SequenceMessageDialog';
import type { QuickMessageDraft } from '../utils/sequenceMessageDialogCompatibility';
import { SequenceKeyboardComposer } from './SequenceKeyboardComposer';
import { createEmptySequenceDiagramContent, createSequenceFragment, createSequenceMessage } from '../utils/sequenceDiagram';
import { buildSequenceLayout } from '../utils/sequenceDiagramLayout';
import { themes } from '../theme/themes';
import type { DesignProject, SequenceDiagramArtifact, SequenceDiagramContent } from '../types/diagram';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const { runtime: hooks } = await import('../hooks/testHookHarness');
  return { ...actual, ...hooks.api, useLayoutEffect: hooks.api.useEffect };
});
const dialogs = vi.hoisted(() => ({ confirm: vi.fn(async () => false), notify: vi.fn() }));
vi.mock('../hooks/useDialogs', () => ({ useDialogs: () => dialogs }));

type TestElement = ReactElement<Record<string, unknown>>;
const elements = (node: unknown): TestElement[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(elements)];
};
const find = (tree: unknown, predicate: (node: TestElement) => boolean): TestElement => {
  const node = elements(tree).find(predicate);
  if (!node) throw new Error('Element not found');
  return node;
};
const text = (node: unknown): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (isValidElement<{ children?: unknown }>(node)) return text(node.props.children);
  return '';
};
const click = (tree: unknown, label: string) => {
  const node = find(tree, (candidate) => candidate.props.label === label || text(candidate.props.children) === label);
  return (node.props.onClick as () => unknown)();
};

class TestElementTarget {
  closest() { return null; }
}
let modal: object | null;
let listeners: Map<string, Set<(event: KeyboardEvent) => void>>;
let artifact: SequenceDiagramArtifact;
let project: DesignProject;
let sequenceId = 0;
const onChangeContent = vi.fn();
const onCreateSequenceDiagramArtifact = vi.fn();
const renderEditor = (allowNew = true) => {
  runtime.begin();
  return SequenceDiagramEditor({
    artifact, project, theme: themes[0], canUndo: false, canRedo: false,
    onChangeContent, onUndo: vi.fn(), onRedo: vi.fn(),
    onCreateSequenceDiagramArtifact: allowNew ? onCreateSequenceDiagramArtifact : undefined,
  });
};
const composerState = (tree: unknown) => find(tree, (node) => node.type === SequenceKeyboardComposer).props.state;
const select = (tree: unknown, selection: { kind: string; id: string }) =>
  (find(tree, (node) => node.type === SequenceDiagramCanvas).props.onSelect as (value: typeof selection) => void)(selection);
const keyEvent = (key: string, extra: Record<string, unknown> = {}) => {
  const event = {
  key, target: new TestElementTarget(), ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
  defaultPrevented: false,
  preventDefault: () => { event.defaultPrevented = true; },
  stopPropagation: vi.fn(),
  ...extra,
  };
  return event as unknown as KeyboardEvent;
};
const press = (key: string, extra: Record<string, unknown> = {}) => {
  const event = keyEvent(key, extra);
  for (const listener of [...(listeners.get('keydown') ?? [])]) listener(event);
  return event;
};

beforeEach(() => {
  runtime.reset();
  vi.useFakeTimers();
  vi.clearAllMocks();
  dialogs.confirm.mockResolvedValue(false);
  modal = null;
  listeners = new Map();
  const body = new TestElementTarget();
  vi.stubGlobal('Element', TestElementTarget);
  vi.stubGlobal('HTMLElement', TestElementTarget);
  vi.stubGlobal('document', { body, activeElement: body, querySelector: () => modal, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('window', {
    localStorage: createMemoryStorage(),
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    setTimeout, clearTimeout, requestAnimationFrame: vi.fn(),
    addEventListener: (name: string, listener: (event: KeyboardEvent) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    },
    removeEventListener: (name: string, listener: (event: KeyboardEvent) => void) => listeners.get(name)?.delete(listener),
  });
  const content = {
    ...createEmptySequenceDiagramContent(),
    participants: [
      { id: 'a', kind: 'object' as const, name: 'A', classifierName: '', x: 180 },
      { id: 'b', kind: 'object' as const, name: 'B', classifierName: '', x: 460 },
    ],
    items: [{ ...createSequenceMessage('synchronous', 'a', 'b'), id: 'call', name: 'buscar' }],
  };
  artifact = { id: `sequence-${++sequenceId}`, type: 'sequence-diagram', name: 'Secuencia', createdAt: 'now', updatedAt: 'now', content };
  project = { id: 'project', name: 'Proyecto', createdAt: 'now', updatedAt: 'now', activeArtifactId: artifact.id, artifacts: [artifact] };
});
afterEach(() => {
  runtime.reset();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('sequence editor keyboard isolation', () => {
  it.each(['ctrlKey', 'metaKey', 'altKey'])('keeps single-letter commands inert with %s in navigation and aiming', (modifier) => {
    renderEditor();
    press('m');
    let tree = renderEditor();
    for (const stage of ['navigate', 'aim']) {
      for (const key of ['m', 's', 'r', 'c', 'd', 'f', 'p', 'e', 'g', 'k']) {
        const state = composerState(tree);
        press(key, { [modifier]: true });
        tree = renderEditor();
        expect(composerState(tree)).toEqual(state);
      }
      expect(composerState(tree)).toMatchObject({ stage });
      if (stage === 'navigate') { press('Enter'); tree = renderEditor(); }
    }
  });

  it.each(['modal', 'prevented'])('blocks creation, duplication, copying, movement and deletion for %s events', (reason) => {
    let tree = renderEditor();
    select(tree, { kind: 'message', id: 'call' });
    renderEditor();
    const extra = reason === 'prevented' ? { defaultPrevented: true } : {};
    if (reason === 'modal') modal = {};
    for (const [key, modifiers] of [
      ['m', {}], ['n', {}], ['d', { ctrlKey: true }], ['c', { metaKey: true }],
      ['v', { metaKey: true }], ['ArrowDown', { altKey: true }], ['Delete', {}], ['Backspace', {}],
    ] as const) press(key, { ...modifiers, ...extra });
    tree = renderEditor();
    expect(elements(tree).some((node) => node.type === SequenceKeyboardComposer)).toBe(false);
    expect(onChangeContent).not.toHaveBeenCalled();
    expect(dialogs.confirm).not.toHaveBeenCalled();
  });

  it.each(['modal', 'prevented'])('keeps an active keyboard draft unchanged for %s Enter and Escape', (reason) => {
    renderEditor(); press('m'); renderEditor(); press('Enter');
    const before = composerState(renderEditor());
    if (reason === 'modal') modal = {};
    const extra = reason === 'prevented' ? { defaultPrevented: true } : {};
    press('Enter', extra); press('Escape', extra);
    expect(composerState(renderEditor())).toEqual(before);
    expect(onChangeContent).not.toHaveBeenCalled();
  });

  it('keeps ordinary editor shortcuts working and shows consistent exit guidance', () => {
    let tree = renderEditor(); select(tree, { kind: 'message', id: 'call' }); renderEditor();
    press('d', { ctrlKey: true });
    expect(onChangeContent).toHaveBeenCalledOnce();
    press('m'); tree = renderEditor();
    expect(text(tree)).toContain('MODO TECLADO');
    expect(find(tree, (node) => node.props.className === 'sequence-keyboard-exit-pill').props.title).toBe('Salir del modo teclado (M)');
    press('Enter'); expect(composerState(renderEditor())).toMatchObject({ stage: 'aim' });
    press('Escape'); expect(composerState(renderEditor())).toMatchObject({ stage: 'navigate' });
    press('m'); tree = renderEditor();
    expect(text(tree)).toContain('Modo teclado desactivado.');
    expect(elements(tree).some((node) => node.type === SequenceKeyboardComposer)).toBe(false);
  });
});

describe('sequence template replacement', () => {
  const openTemplates = (allowNew = true) => {
    const tree = renderEditor(allowNew); click(tree, 'Plantillas'); return renderEditor(allowNew);
  };
  it('preserves the current diagram when replacement is cancelled', async () => {
    const tree = openTemplates();
    expect(text(tree)).toContain('Creá un diagrama nuevo sin alterar los existentes');
    await click(tree, 'Reemplazar este diagrama…');
    expect(dialogs.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Reemplazar este diagrama?', confirmLabel: 'Reemplazar diagrama' }));
    expect(onChangeContent).not.toHaveBeenCalled();
    expect(text(renderEditor())).toContain('Plantillas educativas de secuencia');
  });
  it('replaces the diagram only after confirmation', async () => {
    dialogs.confirm.mockResolvedValue(true);
    await click(openTemplates(), 'Reemplazar este diagrama…');
    expect(onChangeContent).toHaveBeenCalledOnce();
    expect(onChangeContent.mock.calls[0][0].items).not.toEqual(artifact.content.items);
    expect(text(renderEditor())).not.toContain('Plantillas educativas de secuencia');
  });
  it.each(['participants', 'items', 'notes', 'activations'] as const)('asks before replacing a diagram containing only %s', async (field) => {
    const content: SequenceDiagramContent = {
      ...createEmptySequenceDiagramContent(),
      [field]: field === 'participants' ? artifact.content.participants
        : field === 'items' ? [createSequenceFragment('opt')]
          : field === 'notes' ? [{ id: 'note', text: 'Trabajo', x: 100, y: 100, width: 200, height: 80, anchorKind: 'free' }]
            : [{ id: 'activation', participantId: 'a', startMessageId: 'call' }],
    };
    artifact = { ...artifact, content };
    await click(openTemplates(), 'Reemplazar este diagrama…');
    expect(dialogs.confirm).toHaveBeenCalledOnce();
    expect(onChangeContent).not.toHaveBeenCalled();
  });
  it('loads into an empty diagram without a destructive confirmation', async () => {
    artifact = { ...artifact, content: createEmptySequenceDiagramContent() };
    await click(openTemplates(), 'Reemplazar este diagrama…');
    expect(dialogs.confirm).not.toHaveBeenCalled();
    expect(onChangeContent).toHaveBeenCalledOnce();
  });
  it('creates a new diagram without changing or confirming the current one', async () => {
    await click(openTemplates(), 'Crear como nuevo diagrama');
    expect(onCreateSequenceDiagramArtifact).toHaveBeenCalledOnce();
    expect(dialogs.confirm).not.toHaveBeenCalled();
    expect(onChangeContent).not.toHaveBeenCalled();
  });
  it('describes replacement when creating a new diagram is unavailable', () => {
    const tree = openTemplates(false);
    expect(text(tree)).toContain('Elegí una plantilla para reemplazar este diagrama.');
    expect(text(tree)).not.toContain('sin alterar');
  });
});

describe('fragment inspector message counts', () => {
  it.each([0, 1, 2])('counts %i nested messages and excludes subfragments', (count) => {
    const nested = createSequenceFragment('opt');
    nested.operands[0].items = Array.from({ length: count }, (_, index) => ({ ...createSequenceMessage('synchronous', 'a', 'b'), id: `nested-${index}`, name: 'buscar' }));
    const outer = createSequenceFragment('alt'); outer.operands[0].items = [nested];
    artifact = { ...artifact, content: { ...artifact.content, items: [outer] } };
    let tree = renderEditor(); select(tree, { kind: 'fragment', id: outer.id }); tree = renderEditor();
    expect(text(tree)).toContain('Ramas y mensajes');
    expect(text(find(tree, (node) => node.props.className === 'sequence-counter-badge'))).toBe(`${count} ${count === 1 ? 'mensaje' : 'mensajes'}`);
    expect(text(find(tree, (node) => typeof node.props.className === 'string' && node.props.className.startsWith('sequence-tab-counter')))).toBe(String(count));
  });
});

describe('focused sequence notes', () => {
  const renderNote = (interactive = true) => {
    const content = { ...artifact.content, notes: [{ id: 'note', text: 'Trabajo', x: 200, y: 220, width: 200, height: 80, anchorKind: 'free' as const }] };
    const onSelect = vi.fn(); const onEditNote = vi.fn();
    runtime.begin();
    const canvas = (SequenceDiagramCanvas as unknown as { type: (props: ComponentProps<typeof SequenceDiagramCanvas>) => ReactElement }).type;
    const tree = canvas({ content, layout: buildSequenceLayout(content), theme: themes[0], selected: null, interactive, onSelect, onEditNote, onParticipantPointerDown: vi.fn(), onNotePointerDown: vi.fn(), onNoteResizePointerDown: vi.fn() });
    const note = find(tree, (node) => typeof node.props.className === 'string' && node.props.className.startsWith('sequence-note '));
    return { handler: note.props.onKeyDown as (event: KeyboardEvent) => void, onSelect, onEditNote };
  };
  it('selects and edits a note with Enter, and only selects with Space', () => {
    const { handler, onSelect, onEditNote } = renderNote();
    handler(keyEvent(' ')); expect(onSelect).toHaveBeenCalledWith({ kind: 'note', id: 'note' }); expect(onEditNote).not.toHaveBeenCalled();
    handler(keyEvent('Enter')); expect(onEditNote).toHaveBeenCalledWith('note');
  });
  it.each(['modal', 'prevented', 'readonly'])('does not edit a focused note for %s input', (reason) => {
    const { handler, onSelect, onEditNote } = renderNote(reason !== 'readonly');
    if (reason === 'modal') modal = {};
    handler(keyEvent('Enter', { defaultPrevented: reason === 'prevented' }));
    expect(onSelect).not.toHaveBeenCalled(); expect(onEditNote).not.toHaveBeenCalled();
  });
});


describe('sequence creation feedback', () => {
  it('guides a failed creation edit to the visible message controls', () => {
    artifact = { ...artifact, content: { ...artifact.content, items: [
      ...artifact.content.items,
      { ...createSequenceMessage('synchronous', 'a', 'b'), id: 'second', name: 'continuar' },
    ] } };
    let tree = renderEditor();
    const canvas = find(tree, (node) => node.type === SequenceDiagramCanvas);
    (canvas.props.onEditMessage as (id: string) => void)('second');
    tree = renderEditor();
    const dialog = find(tree, (node) => node.type === SequenceMessageDialog);
    const draft = dialog.props.draft as QuickMessageDraft;
    (dialog.props.onSubmit as (event: { preventDefault: () => void }, draft: QuickMessageDraft) => void)(
      { preventDefault: vi.fn() }, { ...draft, type: 'create' },
    );
    expect(text(renderEditor())).toContain('Agregá un mensaje de tipo «Crear» con «Objeto nuevo».');
    expect(text(renderEditor())).not.toContain('botón create()');
    expect(onChangeContent).not.toHaveBeenCalled();
  });
});
