import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ArtifactErrorBoundary } from './ArtifactErrorBoundary';

const boundaryWith = (error: Error | null, onExportProject = vi.fn()): ArtifactErrorBoundary => {
  const boundary = new ArtifactErrorBoundary({ onExportProject, children: <p>Editor</p> });
  boundary.state = error === null ? { error: null } : ArtifactErrorBoundary.getDerivedStateFromError(error);
  return boundary;
};

// Finds the element whose text is the label, so its onClick can be checked.
const findByText = (node: ReactNode, text: string): ReactElement<{ onClick?: () => void }> | null => {
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) return null;
  if (node.props.children === text) return node;
  const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
  for (const child of children) {
    const found = findByText(child, text);
    if (found) return found;
  }
  return null;
};

describe('artifact editor error boundary', () => {
  it('moves into the error state when a child throws during render', () => {
    const state = ArtifactErrorBoundary.getDerivedStateFromError(new Error('El inspector falló'));

    expect(state.error?.message).toBe('El inspector falló');
  });

  it('renders the editor unchanged while there is no error', () => {
    expect(renderToStaticMarkup(boundaryWith(null).render() as ReactElement)).toBe('<p>Editor</p>');
  });

  it('shows the fallback with the reassurance, the technical detail and both recovery actions', () => {
    const html = renderToStaticMarkup(boundaryWith(new Error('Cannot read properties of undefined')).render() as ReactElement);

    expect(html).toContain('No se pudo mostrar este artefacto');
    expect(html).toContain('Tus datos siguen guardados. Probá de nuevo o exportá el proyecto para no perder nada.');
    expect(html).toContain('Cannot read properties of undefined');
    expect(html).toContain('Probar de nuevo');
    expect(html).toContain('Exportar proyecto (JSON)');
    expect(html).not.toContain('Editor');
  });

  it('connects the export button to the project export it was given', () => {
    const onExportProject = vi.fn();
    const element = boundaryWith(new Error('falló'), onExportProject).render();
    const exportButton = findByText(element, 'Exportar proyecto (JSON)');

    exportButton?.props.onClick?.();

    expect(onExportProject).toHaveBeenCalledTimes(1);
  });
});
