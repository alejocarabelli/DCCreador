import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runtime } from './testHookHarness';
import { NotebookSheet, type NotebookSheetProps } from './NotebookSheet';
import { NotebookBlockView, type NotebookBlockViewProps } from './NotebookBlockView';
import { ToolButton } from '../ui/Toolbar';
import { NotebookSketch } from './NotebookSketch';
import { NotebookTextField } from './NotebookTextField';
import { MAX_TEXT_LENGTH } from '../../utils/artifactNotebook';

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  ...runtime.api,
  useId: () => 'notebook-test',
  useLayoutEffect: runtime.api.useEffect,
  useEffectEvent: (callback: unknown) => callback,
}));
vi.mock('react-dom', () => ({ flushSync: (callback: () => void) => callback() }));

const find = (node: ReactElement, type: unknown): ReactElement<Record<string, unknown>> | undefined => {
  if (node.type === type) return node as ReactElement<Record<string, unknown>>;
  const children = (node.props as { children?: unknown }).children;
  for (const child of [children].flat()) {
    if (typeof child !== 'object' || child === null || !('props' in child)) continue;
    const result = find(child as ReactElement, type);
    if (result !== undefined) return result;
  }
};
const render = (props: NotebookSheetProps) => { runtime.begin(); return NotebookSheet(props); };

beforeEach(() => {
  vi.useFakeTimers();
  runtime.reset();
  const target = new EventTarget();
  vi.stubGlobal('window', Object.assign(target, { setTimeout, clearTimeout }));
});
afterEach(() => { runtime.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('notebook close preparation', () => {
  const props = (): NotebookSheetProps => ({
    artifactName: 'Clases', notebook: { version: 1, blocks: [{ id: 't', kind: 'text', text: 'antes' }] },
    onCommit: vi.fn(), onClose: vi.fn(), onReturnFocus: vi.fn(), width: 360,
    onWidthChange: vi.fn(), saveFailed: false, focusRequest: 0,
  });

  it('delivers the focused draft synchronously before pagehide and cancels its timer', () => {
    const options = props();
    const sheet = render(options);
    const block = find(sheet, NotebookBlockView)!.props as NotebookBlockViewProps;
    block.onTextChange(block.block, 'última edición', 13);
    expect(options.onCommit).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('modelador:flush-drafts'));
    expect(options.onCommit).toHaveBeenCalledExactlyOnceWith({ version: 1, blocks: [{ id: 't', kind: 'text', text: 'última edición' }] });
    window.dispatchEvent(new Event('modelador:flush-drafts'));
    vi.advanceTimersByTime(400);
    expect(options.onCommit).toHaveBeenCalledTimes(1);
    runtime.unmount();
    window.dispatchEvent(new Event('modelador:flush-drafts'));
    expect(options.onCommit).toHaveBeenCalledTimes(1);
  });

  it('keeps the latest callback after rerendering', () => {
    const options = props();
    const block = find(render(options), NotebookBlockView)!.props as NotebookBlockViewProps;
    block.onTextChange(block.block, 'nuevo', 5);
    const onCommit = vi.fn();
    render({ ...options, onCommit });
    window.dispatchEvent(new Event('modelador:flush-drafts'));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(options.onCommit).not.toHaveBeenCalled();
  });

  it('shows an explicit notice after an oversized paste', () => {
    runtime.begin();
    const onValueChange = vi.fn();
    const field = NotebookTextField({ value: '', onValueChange });
    const textarea = find(field, 'textarea')!;
    const element = { selectionStart: 0, selectionEnd: 0, value: '', setSelectionRange: vi.fn() };
    const preventDefault = vi.fn();
    (textarea.props.onPaste as (event: unknown) => void)({ preventDefault, currentTarget: element, clipboardData: { getData: () => 'a'.repeat(MAX_TEXT_LENGTH + 3) } });
    expect(preventDefault).toHaveBeenCalled();
    expect(onValueChange).toHaveBeenCalledWith('a'.repeat(MAX_TEXT_LENGTH), MAX_TEXT_LENGTH);
    runtime.begin();
    const updated = NotebookTextField({ value: 'a'.repeat(MAX_TEXT_LENGTH), onValueChange });
    expect(JSON.stringify(updated)).toContain('Se pegó hasta el máximo de texto.');
  });
});


it('delivers the focused sketch text before the sheet flushes its blocks', () => {
  const onChange = vi.fn();
  const options = {
    block: { id: 's', height: 660, shapes: [{ id: 'label', kind: 'text' as const, color: 'ink' as const, x: 0, y: 0, text: 'antes' }] },
    notebookPoints: 0, onChange, onHeightChange: vi.fn(),
  };
  runtime.begin();
  const initial = NotebookSketch(options);
  (find(initial, ToolButton)!.props.onClick as () => void)();
  runtime.begin();
  const surface = find(NotebookSketch(options), 'svg')!;
  (surface.props.ref as (value: unknown) => void)({ getBoundingClientRect: () => ({ width: 1000, left: 0, top: 0 }) });
  (surface.props.onDoubleClick as (event: unknown) => void)({ clientX: 1, clientY: 1 });
  runtime.begin();
  const input = find(NotebookSketch(options), 'input')!;
  const element = { value: 'último texto', style: {} };
  (input.props.ref as { current: unknown }).current = element;
  (input.props.onChange as (event: unknown) => void)({ currentTarget: element });
  window.dispatchEvent(new Event('modelador:flush-drafts'));
  expect(onChange).toHaveBeenCalledExactlyOnceWith([{ ...options.block.shapes[0], text: 'último texto' }]);
});
