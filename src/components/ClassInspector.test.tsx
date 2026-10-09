import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { ClassDiagramNode } from '../types/diagram';
import { ClassInspector } from './ClassInspector';

const STATIC_HELP = 'S marca un miembro estático: se dibuja subrayado.';

const handlers = {
  onAddAttribute: vi.fn(),
  onAddMethod: vi.fn(),
  onDeleteAttribute: vi.fn(),
  onDeleteMethod: vi.fn(),
  onReorderAttributes: vi.fn(),
  onRenameClass: vi.fn(),
  onSetParametricValuesNote: vi.fn(),
  onUpdateDescription: vi.fn(),
  onUpdateAttribute: vi.fn(),
  onSetAttributeStatic: vi.fn(),
  onUpdateMethod: vi.fn(),
  onUpdateParametricValues: vi.fn(),
  onUpdateParametricValuesNoteConnection: vi.fn(),
};

const classNode = (attributes: ClassDiagramNode['data']['attributes'], methods: ClassDiagramNode['data']['methods']): ClassDiagramNode => ({
  id: 'class-1',
  type: 'classNode',
  position: { x: 0, y: 0 },
  data: { name: 'Cuenta', attributes, methods },
});

const render = (node: ClassDiagramNode): string => renderToString(<ClassInspector node={node} {...handlers} />);

describe('ClassInspector static member help', () => {
  it('explains the S button once per section that has members', () => {
    const html = render(classNode(
      [{ id: 'a1', name: 'instancia', type: 'Cuenta', isStatic: true }],
      [{ id: 'm1', visibility: '+', name: 'getInstancia', parameters: '', returnType: 'Cuenta', isStatic: true }],
    ));

    expect(html.split(STATIC_HELP)).toHaveLength(3);
  });

  it('does not explain it in a section without members', () => {
    const html = render(classNode([], []));

    expect(html).not.toContain(STATIC_HELP);
    expect(html).toContain('Esta clase no tiene atributos.');
  });
});
