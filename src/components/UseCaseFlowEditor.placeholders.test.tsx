import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DialogProvider } from './ConfirmDialog';
import { UseCaseFlowEditor } from './UseCaseFlowEditor';
import { themes } from '../theme/themes';
import type { DesignProject, UseCaseFlowArtifact } from '../types/diagram';
import { normalizeUseCaseFlowContent } from '../utils/diagramNormalization';

describe('UseCaseFlowEditor wording', () => {
  it('describes what goes in each field instead of showing another domain example', () => {
    const now = '2026-01-01T00:00:00.000Z';
    const flowArtifact: UseCaseFlowArtifact = {
      id: 'flow-1',
      type: 'use-case-flow',
      name: 'Caso de uso',
      createdAt: now,
      updatedAt: now,
      content: normalizeUseCaseFlowContent({
        alternativeFlows: [{ id: 'ca-1', code: 'CA 1', name: '', steps: [] }],
      }),
    };
    const project: DesignProject = {
      id: 'project-1',
      name: 'Proyecto',
      createdAt: now,
      updatedAt: now,
      activeArtifactId: flowArtifact.id,
      artifacts: [flowArtifact],
    };

    const html = renderToString(
      <DialogProvider>
      <UseCaseFlowEditor
        artifact={flowArtifact}
        canRedo={false}
        canUndo={false}
        project={project}
        theme={themes[0]}
        onChangeContent={vi.fn()}
        onRedo={vi.fn()}
        onUndo={vi.fn()}
      />
      </DialogProvider>,
    );

    for (const placeholder of [
      'Actor principal',
      'Datos que recibe, separados por coma',
      'Condición que debe cumplirse antes',
      'Cómo queda el sistema al terminar',
      'Qué datos existen antes de empezar',
      'Qué datos existen al terminar',
      'Nombre del camino alternativo',
    ]) {
      expect(html).toContain(`placeholder="${placeholder}"`);
    }
    expect(html).not.toMatch(/placeholder="[^"]*(Consultor|Tramite|fechaHoraBaja|Datos inconsistentes)/);
    expect(html).toContain('title="Vincular el diagrama de clases permite revisar que las clases y atributos que nombrás existan."');
  });
});
