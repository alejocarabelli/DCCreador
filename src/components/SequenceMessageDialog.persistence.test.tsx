import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type FormHTMLAttributes, type ReactElement, type TextareaHTMLAttributes } from 'react';
import { runtime } from '../hooks/testHookHarness';
import { createSequenceMessageEditModel, sequenceMessageEditModelToPatch } from '../utils/sequenceMessageEditing';
import { SequenceMessageDialog } from './SequenceMessageDialog';

vi.mock('react', async (importOriginal) => {
  const { runtime: hooks } = await import('../hooks/testHookHarness');
  return {
    ...await importOriginal<typeof import('react')>(),
    ...hooks.api,
    useEffect: () => undefined,
  };
});

const elements = (node: unknown): ReactElement<Record<string, unknown>>[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children)];
};
beforeEach(() => runtime.reset());

describe('dialog signature persistence', () => {
  it.each([
    { name: 'f', arguments: 'a,b' },
    { name: 'f(a,b)', arguments: '' },
    { name: 'f', arguments: String.raw`"a\",b,c",d` },
  ])('preserves saved text on submit without editing: $name $arguments', (text) => {
    const draft = createSequenceMessageEditModel({ editId: 'saved', ...text, parameterValues: '1,2', returnType: 'Saved', operationMethodId: 'method' });
    const onSubmit = vi.fn();
    runtime.begin();
    const tree = elements(SequenceMessageDialog({ draft, participants: [], onChange: vi.fn(), onSubmit, onCancel: vi.fn() }));
    const textarea = tree.find((node) => node.type === 'textarea')!;
    expect(textarea.props.value).toContain(', ');
    const form = tree.find((node) => node.type === 'form') as ReactElement<FormHTMLAttributes<HTMLFormElement>>;
    form.props.onSubmit!({ preventDefault: vi.fn() } as unknown as Parameters<NonNullable<typeof form.props.onSubmit>>[0]);
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(sequenceMessageEditModelToPatch(onSubmit.mock.calls[0][1])).toEqual(sequenceMessageEditModelToPatch(draft));
  });

  it('persists an explicitly edited signature', () => {
    let draft = createSequenceMessageEditModel({ editId: 'saved', name: 'f', arguments: 'a,b' });
    const onChange = vi.fn((next) => { draft = next; });
    const onSubmit = vi.fn();
    const render = () => {
      runtime.begin();
      return elements(SequenceMessageDialog({ draft, participants: [], onChange, onSubmit, onCancel: vi.fn() }));
    };
    const textarea = render().find((node) => node.type === 'textarea') as ReactElement<TextareaHTMLAttributes<HTMLTextAreaElement>>;
    textarea.props.onChange!({ target: { value: 'f(c,d): Result' } } as Parameters<NonNullable<typeof textarea.props.onChange>>[0]);
    const form = render().find((node) => node.type === 'form') as ReactElement<FormHTMLAttributes<HTMLFormElement>>;
    form.props.onSubmit!({ preventDefault: vi.fn() } as unknown as Parameters<NonNullable<typeof form.props.onSubmit>>[0]);
    expect(onSubmit.mock.calls[0][1]).toMatchObject({ name: 'f', arguments: 'c,d', returnType: 'Result' });
  });
});
