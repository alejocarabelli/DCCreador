import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type {
  ClassDiagramArtifact,
  ClassDiagramEdge,
  ClassDiagramNode,
  ClassSequenceDiagramArtifact,
  DesignProject,
  SequenceDiagramArtifact,
} from '../types/diagram';
import { themes } from '../theme/themes';
import { normalizeAssociationData } from '../utils/association';
import { createEmptySequenceDiagramContent, createSequenceMessage } from '../utils/sequenceDiagram';
import { ClassSequenceDiagramEditor } from './ClassSequenceDiagramEditor';
import { DialogProvider } from './ConfirmDialog';
import { DiagramEditor } from './DiagramEditor';

const RELATION_HINT = 'Para relacionar dos clases, arrastrá uno de los puntos del borde de una clase hasta la otra. Después tocá la línea para elegir multiplicidades.';

const classNode = (id: string, name: string): ClassDiagramNode => ({
  id,
  type: 'classNode',
  position: { x: 0, y: 0 },
  data: { name, attributes: [], methods: [] },
});

const association = (id: string, source: string, target: string): ClassDiagramEdge => ({
  id,
  source,
  target,
  type: 'association',
  data: normalizeAssociationData(undefined),
});

const classDiagram = (nodes: ClassDiagramNode[], edges: ClassDiagramEdge[] = []): ClassDiagramArtifact => ({
  id: 'diagram', type: 'class-diagram', name: 'Dominio', createdAt: 'now', updatedAt: 'now',
  content: { nodes, edges },
});

const classSequence = (linkedSequenceDiagramIds: string[]): ClassSequenceDiagramArtifact => ({
  id: 'model', type: 'class-sequence-diagram', name: 'Clases de secuencias', createdAt: 'now', updatedAt: 'now',
  content: { nodes: [], edges: [], version: 1, linkedSequenceDiagramIds },
});

const sequence: SequenceDiagramArtifact = {
  id: 'sequence', type: 'sequence-diagram', name: 'Buscar trámite', createdAt: 'now', updatedAt: 'now',
  content: {
    ...createEmptySequenceDiagramContent(),
    participants: [
      { id: 'consultor', kind: 'actor', name: 'Consultor', classifierName: '', x: 120 },
      { id: 'tramite', kind: 'entity', name: '', classifierName: 'Tramite', x: 420 },
    ],
    items: [{ ...createSequenceMessage('synchronous', 'consultor', 'tramite'), id: 'buscar', name: 'buscarTramite' }],
  },
};

const emptySequence: SequenceDiagramArtifact = { ...sequence, id: 'empty', name: 'Sin mensajes', content: createEmptySequenceDiagramContent() };

const project = (artifacts: DesignProject['artifacts']): DesignProject => ({
  id: 'project', name: 'Proyecto', createdAt: 'now', updatedAt: 'now', activeArtifactId: artifacts[0]?.id, artifacts,
});

const common = { canRedo: false, canUndo: false, theme: themes[0], onChangeContent: vi.fn(), onRedo: vi.fn(), onUndo: vi.fn() };

const strip = (html: string): string => html.replace(/<!--.*?-->/g, '');

const renderClasses = (artifact: ClassDiagramArtifact): string => strip(renderToString(
  <DialogProvider>
    <DiagramEditor {...common} artifact={artifact} project={project([artifact])} />
  </DialogProvider>,
));

const renderModel = (artifact: ClassSequenceDiagramArtifact, artifacts: DesignProject['artifacts'], onLinkAllSequenceDiagrams?: (id: string) => void): string => strip(renderToString(
  <DialogProvider>
    <ClassSequenceDiagramEditor {...common} artifact={artifact} project={project(artifacts)} onLinkAllSequenceDiagrams={onLinkAllSequenceDiagrams} />
  </DialogProvider>,
));

describe('class diagram: relation hint', () => {
  it('shows how to relate two classes once there are two and no association yet', () => {
    const html = renderClasses(classDiagram([classNode('a', 'Persona'), classNode('b', 'Alumno')]));
    expect(html).toContain(RELATION_HINT);
  });

  it('goes away as soon as the first association exists', () => {
    const html = renderClasses(classDiagram([classNode('a', 'Persona'), classNode('b', 'Alumno')], [association('e', 'a', 'b')]));
    expect(html).not.toContain('Para relacionar dos clases');
  });

  it('does not show it for a single class', () => {
    expect(renderClasses(classDiagram([classNode('a', 'Persona')]))).not.toContain('Para relacionar dos clases');
  });

  it('the empty card no longer promises associations without saying how', () => {
    const html = renderClasses(classDiagram([]));
    expect(html).toContain('Empezá por una clase');
    expect(html).not.toContain('uní sus asociaciones');
    expect(html).not.toContain('Para relacionar dos clases');
  });
});

describe('class sequence: empty state of its own', () => {
  const title = 'Clases de secuencias';
  const description = 'Reúne las clases y operaciones que aparecen en tus diagramas de secuencia.';

  it('explains the artifact and asks for a sequence first when the project has none', () => {
    const html = renderModel(classSequence([]), [classSequence([])]);
    expect(html).toContain(title);
    expect(html).toContain(description);
    expect(html).toContain('Primero armá un diagrama de secuencia; sus clases y mensajes van a aparecer acá para traerlas.');
    expect(html).not.toContain('Empezá por una clase');
    expect(html).not.toContain('Ver lo que se puede traer');
  });

  it('offers the novelties panel and says what the model is linked to', () => {
    const model = classSequence([sequence.id]);
    const html = renderModel(model, [model, sequence]);
    expect(html).toContain(description);
    expect(html).toContain('Vinculado a: Buscar trámite.');
    expect(html).toContain('Ver lo que se puede traer (2)');
    expect(html).not.toContain('Primero armá un diagrama de secuencia');
  });

  it('explains a linked sequence that has no classes to bring yet', () => {
    const model = classSequence([emptySequence.id]);
    const html = renderModel(model, [model, emptySequence]);
    expect(html).toContain('Vinculado a: Sin mensajes.');
    expect(html).toContain('Todavía no hay clases para traer');
    expect(html).not.toContain('Ver lo que se puede traer');
  });

  it('offers to link when sequences exist but none is linked yet', () => {
    const model = classSequence([]);
    const html = renderModel(model, [model, sequence], vi.fn());
    expect(html).toContain('Vinculá una secuencia para traer sus clases y mensajes.');
    expect(html).toContain('Vincular secuencias');
  });
});
