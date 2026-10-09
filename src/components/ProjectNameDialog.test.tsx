import type { FormHTMLAttributes, InputHTMLAttributes, ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runtime } from '../hooks/testHookHarness';
import { ARTIFACT_TYPES } from '../constants/artifactTypes';
import { ArtifactTypeIcon } from './ArtifactTypeIcon';
import { ProjectNameDialog } from './ProjectNameDialog';

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  ...runtime.api,
  useId: () => 'project-dialog-test',
  useEffect: () => undefined,
}));

const elements = (node: ReactElement): ReactElement<Record<string, unknown>>[] => {
  const children = (node.props as { children?: unknown }).children;
  return [node as ReactElement<Record<string, unknown>>, ...[children].flat(Infinity).flatMap((child) =>
    typeof child === 'object' && child !== null && 'props' in child ? elements(child as ReactElement) : [])];
};
const props = (chooseInitialArtifact = true) => ({
  initialName: '  Turnos  ', title: 'Crear proyecto', description: 'Proyecto del sistema.',
  confirmLabel: 'Crear', chooseInitialArtifact, onCancel: vi.fn(), onConfirm: vi.fn(),
});
const render = (options: Parameters<typeof ProjectNameDialog>[0]) => {
  runtime.begin();
  return elements(ProjectNameDialog(options));
};
const submit = (tree: ReturnType<typeof render>) => {
  const form = tree.find((node) => node.type === 'form') as ReactElement<FormHTMLAttributes<HTMLFormElement>>;
  const preventDefault = vi.fn();
  form.props.onSubmit?.({ preventDefault } as unknown as Parameters<NonNullable<typeof form.props.onSubmit>>[0]);
  expect(preventDefault).toHaveBeenCalledOnce();
};

beforeEach(() => runtime.reset());

describe('ProjectNameDialog', () => {
  it('muestra radios nativos en el orden de la materia, con nombre, descripción e ícono', () => {
    const tree = render(props());
    expect(tree.find((node) => node.props.role === 'radiogroup')?.type).toBe('fieldset');
    expect(tree.find((node) => node.type === 'legend')?.props.children).toBe('¿Con qué querés empezar?');
    const radios = tree.filter((node) => node.props.type === 'radio');
    expect(radios.map((node) => node.props.value)).toEqual([
      'use-case-model', 'use-case-flow', 'sequence-diagram', 'class-sequence-diagram', 'class-diagram',
    ]);
    expect(new Set(radios.map((node) => node.props.name)).size).toBe(1);
    expect(radios.filter((node) => node.props.checked).map((node) => node.props.value)).toEqual(['use-case-model']);
    for (const type of ARTIFACT_TYPES) {
      const radio = radios.find((node) => node.props.value === type.id)!;
      expect(tree.find((node) => node.props.id === radio.props['aria-labelledby'])?.props.children).toBe(type.label);
      expect(tree.find((node) => node.props.id === radio.props['aria-describedby'])?.props.children).toBe(type.description);
    }
    expect(tree.filter((node) => node.type === ArtifactTypeIcon).map((node) => node.props.type)).toEqual(ARTIFACT_TYPES.map((type) => type.id));
  });

  it.each(ARTIFACT_TYPES)('devuelve $label al elegir y enviar el formulario', ({ id }) => {
    const options = props();
    const radio = render(options).find((node) => node.props.type === 'radio' && node.props.value === id) as ReactElement<InputHTMLAttributes<HTMLInputElement>>;
    radio.props.onChange?.({} as Parameters<NonNullable<typeof radio.props.onChange>>[0]);
    const tree = render(options);
    expect(tree.filter((node) => node.props.type === 'radio' && node.props.checked).map((node) => node.props.value)).toEqual([id]);
    submit(tree);
    expect(options.onConfirm).toHaveBeenCalledExactlyOnceWith('Turnos', id);
  });

  it('envía casos de uso si no cambiás la elección', () => {
    const options = props();
    submit(render(options));
    expect(options.onConfirm).toHaveBeenCalledExactlyOnceWith('Turnos', 'use-case-model');
  });

  it('Enter en un radio crea con la elección actual; las flechas quedan a cargo del navegador', () => {
    const options = props();
    const radio = render(options).find((node) => node.props.value === 'use-case-flow') as ReactElement<InputHTMLAttributes<HTMLInputElement>>;
    radio.props.onChange?.({} as Parameters<NonNullable<typeof radio.props.onChange>>[0]);
    const tree = render(options);
    const selected = tree.find((node) => node.props.value === 'use-case-flow') as ReactElement<InputHTMLAttributes<HTMLInputElement>>;
    const preventDefault = vi.fn();
    const requestSubmit = vi.fn(() => submit(tree));
    const keyDown = (key: string) => selected.props.onKeyDown?.({
      key, preventDefault, currentTarget: { form: { requestSubmit } },
    } as unknown as Parameters<NonNullable<typeof selected.props.onKeyDown>>[0]);
    keyDown('ArrowDown');
    expect(preventDefault).not.toHaveBeenCalled();
    expect(requestSubmit).not.toHaveBeenCalled();
    keyDown('Enter');
    expect(requestSubmit).toHaveBeenCalledOnce();
    expect(options.onConfirm).toHaveBeenCalledExactlyOnceWith('Turnos', 'use-case-flow');
  });

  it('conserva los diálogos de nombre sin mostrar la elección', () => {
    const options = props(false);
    const tree = render(options);
    expect(tree.some((node) => node.props.role === 'radiogroup')).toBe(false);
    submit(tree);
    expect(options.onConfirm).toHaveBeenCalledExactlyOnceWith('Turnos');
  });

  it('rechaza un nombre con espacios sin perder el tipo elegido', () => {
    const options = { ...props(), initialName: '   ' };
    submit(render(options));
    expect(options.onConfirm).not.toHaveBeenCalled();
    expect(render(options).find((node) => node.props.role === 'alert')?.props.children).toBe('Escribí un nombre para continuar.');
  });
});
