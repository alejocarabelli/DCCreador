import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DialogProvider } from './ConfirmDialog';
import { themes } from '../theme/themes';
import type { ClassDiagramArtifact, DesignProject, SequenceDiagramArtifact } from '../types/diagram';
import { createEmptySequenceDiagramContent, normalizeSequenceDiagramContent } from '../utils/sequenceDiagram';
import { SequenceDiagramEditor } from './SequenceDiagramEditor';

describe('SequenceDiagramEditor referenced class diagram compatibility', () => {
  it('does not crash when the referenced class diagram has no nodes', () => {
    const now = '2026-01-01T00:00:00.000Z';
    const malformedClassDiagram = {
      id: 'class-1',
      type: 'class-diagram',
      name: 'Clases incompletas',
      createdAt: now,
      updatedAt: now,
      content: {},
    } as unknown as ClassDiagramArtifact;
    const sequenceArtifact: SequenceDiagramArtifact = {
      id: 'sequence-1',
      type: 'sequence-diagram',
      name: 'Secuencia',
      createdAt: now,
      updatedAt: now,
      content: normalizeSequenceDiagramContent({
        ...createEmptySequenceDiagramContent(),
        classDiagramArtifactId: 'class-1',
      }),
    };
    const project: DesignProject = {
      id: 'project-1',
      name: 'Proyecto',
      createdAt: now,
      updatedAt: now,
      activeArtifactId: sequenceArtifact.id,
      artifacts: [malformedClassDiagram, sequenceArtifact],
    };

    expect(() => renderToString(
      <DialogProvider>
      <SequenceDiagramEditor
        artifact={sequenceArtifact}
        canRedo={false}
        canUndo={false}
        project={project}
        theme={themes[0]}
        onChangeContent={vi.fn()}
        onRedo={vi.fn()}
        onUndo={vi.fn()}
      />
      </DialogProvider>,
    )).not.toThrow();
  });

  it('does not mount the duplicate export SVG while the export dialog is closed', () => {
    const now = '2026-01-01T00:00:00.000Z';
    const sequenceArtifact: SequenceDiagramArtifact = {
      id: 'sequence-1',
      type: 'sequence-diagram',
      name: 'Secuencia',
      createdAt: now,
      updatedAt: now,
      content: normalizeSequenceDiagramContent(createEmptySequenceDiagramContent()),
    };
    const project: DesignProject = {
      id: 'project-1',
      name: 'Proyecto',
      createdAt: now,
      updatedAt: now,
      activeArtifactId: sequenceArtifact.id,
      artifacts: [sequenceArtifact],
    };

    const html = renderToString(
      <DialogProvider>
      <SequenceDiagramEditor
        artifact={sequenceArtifact}
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

    expect((html.match(/class="sequence-diagram-svg"/g) ?? [])).toHaveLength(1);
    expect(html).not.toContain('sequence-export-source');
  });
});
