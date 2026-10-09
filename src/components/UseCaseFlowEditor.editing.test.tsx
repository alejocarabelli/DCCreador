import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ComponentProps, type ReactElement } from 'react';
import { runtime, createMemoryStorage, stubBrowser } from '../hooks/testHookHarness';
import type { ClassDiagramArtifact, DiagramProject, UseCaseFlowArtifact } from '../types/diagram';
import { normalizeUseCaseFlowContent } from '../utils/diagramNormalization';
import { themes } from '../theme/themes';
import { FlowRichTextarea } from './FlowRichTextarea';
import { UseCaseFlowEditor } from './UseCaseFlowEditor';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const { runtime: hooks } = await import('../hooks/testHookHarness');
  return { ...actual, ...hooks.api, useLayoutEffect: hooks.api.useEffect };
});

type TestElement = ReactElement<Record<string, unknown>>;
const elements = (node: unknown): TestElement[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children)];
};
const find = (tree: unknown, predicate: (node: TestElement) => boolean): TestElement => {
  const node = elements(tree).find(predicate);
  if (!node) throw new Error('Element not found');
  return node;
};
const stateField = (tree: unknown, field: string) =>
  find(tree, (node) => node.props.id === `flow-${field}`).props as unknown as ComponentProps<typeof FlowRichTextarea>;
const cell = (tree: unknown, tableIndex: number, label: string) =>
  elements(tree).filter((node) => node.props['aria-label'] === label)[tableIndex].props as unknown as ComponentProps<typeof FlowRichTextarea>;

let artifact: UseCaseFlowArtifact;
let project: DiagramProject;
let frames: FrameRequestCallback[];
const onChangeContent = vi.fn();
const renderEditor = () => {
  runtime.begin();
  return UseCaseFlowEditor({
    artifact, project, theme: themes[0], canUndo: false, canRedo: false,
    onChangeContent, onUndo: vi.fn(), onRedo: vi.fn(),
  });
};
const textarea = (value: string) => ({
  value, selectionStart: value.length, focus: vi.fn(),
  setSelectionRange(this: { selectionStart: number }, start: number) { this.selectionStart = start; },
}) as unknown as HTMLTextAreaElement;
const change = (props: ComponentProps<typeof FlowRichTextarea>, target: HTMLTextAreaElement) =>
  props.onChange!({ target } as Parameters<NonNullable<typeof props.onChange>>[0]);
const flushFrames = () => { frames.splice(0).forEach((callback) => callback(0)); };

beforeEach(() => {
  runtime.reset();
  vi.clearAllMocks();
  vi.useFakeTimers();
  frames = [];
  stubBrowser({
    localStorage: createMemoryStorage(),
    requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback),
  });
  artifact = {
    id: 'flow', type: 'use-case-flow', name: 'Flujo', createdAt: 'now', updatedAt: 'now',
    content: normalizeUseCaseFlowContent({
      classDiagramArtifactId: null,
      basicFlow: [{ id: 'b1', actor: '1. Iniciar', system: '2. Buscar', ref: '' }],
      alternativeFlows: [{
        id: 'ca1', code: 'CA 1', name: 'Sin resultados',
        steps: [{ id: 'a1', actor: '', system: '3. ', ref: '' }],
      }],
    }),
  };
  project = { id: 'project', name: 'Proyecto', createdAt: 'now', updatedAt: 'now', activeArtifactId: artifact.id, artifacts: [artifact] };
  onChangeContent.mockImplementation((content) => {
    artifact = { ...artifact, content };
    project = { ...project, artifacts: project.artifacts.map((current) => current.id === artifact.id ? artifact : current) };
  });
});

afterEach(() => {
  runtime.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('flow editor text changes', () => {
  it.each([
    ['initialState', false], ['finalState', false], ['initialState', true], ['finalState', true],
  ] as const)('keeps typing in order in %s (linked model: %s)', (field, linked) => {
    if (linked) {
      const model: ClassDiagramArtifact = {
        id: 'model', type: 'class-diagram', name: 'Clases', createdAt: 'now', updatedAt: 'now',
        content: { nodes: [{ id: 'libro', type: 'classNode', position: { x: 0, y: 0 }, data: {
          name: 'Libro', attributes: [{ id: 'titulo', name: 'titulo', type: 'String' }], methods: [],
        } }], edges: [] },
      };
      artifact = { ...artifact, content: { ...artifact.content, classDiagramArtifactId: model.id } };
      project = { ...project, artifacts: [artifact, model] };
    }
    const heading = 'Instancia de Libro con:';
    const input = textarea(heading);
    change(stateField(renderEditor(), field), input);
    stateField(renderEditor(), field).onKeyDown!({
      currentTarget: input, key: 'Enter', preventDefault: vi.fn(), shiftKey: false,
    } as unknown as Parameters<NonNullable<ComponentProps<typeof FlowRichTextarea>['onKeyDown']>>[0]);
    input.value = String(stateField(renderEditor(), field).value);
    flushFrames();
    expect(input.value).toBe(`${heading}\n• `);

    for (const letter of 'titulo igual a vacío') {
      const position = input.selectionStart;
      input.value = input.value.slice(0, position) + letter + input.value.slice(position);
      input.selectionStart += letter.length;
      change(stateField(renderEditor(), field), input);
      input.value = String(stateField(renderEditor(), field).value);
      flushFrames();
      expect(input.selectionStart).toBe(input.value.length);
    }
    expect(artifact.content.description[field]).toBe(`${heading}\n• titulo igual a vacío`);
  });

  it('does not emit unchanged Ref. or renumbered blur content', () => {
    artifact.content.alternativeFlows[0].steps[0].system = '2. ';
    const input = textarea('CA 1');
    change(cell(renderEditor(), 0, 'Referencia, fila 1'), input);
    expect(onChangeContent).toHaveBeenCalledTimes(1);

    for (let index = 0; index < 5; index += 1) {
      // A parent may supply a fresh content object with exactly the same values.
      artifact = { ...artifact, content: structuredClone(artifact.content) };
      const tree = renderEditor();
      change(cell(tree, 0, 'Referencia, fila 1'), input);
      cell(tree, 1, 'Sistema, fila 1').onBlur!({
        currentTarget: textarea(artifact.content.alternativeFlows[0].steps[0].system),
      } as Parameters<NonNullable<ComponentProps<typeof FlowRichTextarea>['onBlur']>>[0]);
    }
    expect(onChangeContent).toHaveBeenCalledTimes(1);
  });

  it('preserves every letter in the alternative after accepting Ref. with Tab', () => {
    const ref = textarea('CA 1');
    change(cell(renderEditor(), 0, 'Referencia, fila 1'), ref);
    const preventDefault = vi.fn();
    cell(renderEditor(), 0, 'Referencia, fila 1').onKeyDown!({
      currentTarget: ref, key: 'Tab', preventDefault,
    } as unknown as Parameters<NonNullable<ComponentProps<typeof FlowRichTextarea>['onKeyDown']>>[0]);
    expect(preventDefault).toHaveBeenCalled();
    flushFrames();
    expect(onChangeContent).toHaveBeenCalledTimes(1);

    const input = textarea('3. ');
    for (const letter of 'El sistema informa que no hay resultados.') {
      input.value += letter;
      input.selectionStart = input.value.length;
      change(cell(renderEditor(), 1, 'Sistema, fila 1'), input);
    }
    expect(artifact.content.alternativeFlows[0].steps[0].system)
      .toBe('3. El sistema informa que no hay resultados.');
  });

  it('ignores a pending shortcut caret restoration after a newer keystroke', () => {
    const input = textarea('-uno');
    change(stateField(renderEditor(), 'initialState'), input);
    input.value = String(stateField(renderEditor(), 'initialState').value);
    input.selectionStart = input.value.length;
    input.value += ' más';
    input.selectionStart = input.value.length;
    change(stateField(renderEditor(), 'initialState'), input);
    renderEditor();
    flushFrames();
    expect(input.value).toBe('• uno más');
    expect(input.selectionStart).toBe(input.value.length);
  });
});
