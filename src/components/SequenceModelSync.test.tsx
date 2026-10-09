import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { ClassSequenceDiagramArtifact, DesignProject, SequenceDiagramArtifact } from '../types/diagram';
import { themes } from '../theme/themes';
import { createEmptySequenceDiagramContent, createSequenceMessage } from '../utils/sequenceDiagram';
import { buildSequenceLayout } from '../utils/sequenceDiagramLayout';
import { importClassesFromSequences } from '../utils/sequenceClassImport';
import { ClassSequenceDiagramEditor } from './ClassSequenceDiagramEditor';
import { SequenceDiagramCanvas } from './SequenceDiagramCanvas';
import { SequenceDiagramEditor } from './SequenceDiagramEditor';
import { DialogProvider } from './ConfirmDialog';

const sequence: SequenceDiagramArtifact = {
  id: 'sequence', type: 'sequence-diagram', name: 'Buscar trámite', createdAt: 'now', updatedAt: 'now',
  content: { ...createEmptySequenceDiagramContent(), classDiagramArtifactId: 'model', participants: [{ id: 't', kind: 'entity', name: '', classifierName: 'Tramite', x: 200 }], items: [{ ...createSequenceMessage('synchronous', 't', 't'), id: 'call', name: 'buscar' }] },
};
const model: ClassSequenceDiagramArtifact = { id: 'model', type: 'class-sequence-diagram', name: 'Modelo', createdAt: 'now', updatedAt: 'now', content: { nodes: [], edges: [], version: 1, linkedSequenceDiagramIds: [sequence.id] } };
const project: DesignProject = { id: 'project', name: 'Proyecto', createdAt: 'now', updatedAt: 'now', activeArtifactId: model.id, artifacts: [model, sequence] };
const common = { canRedo: false, canUndo: false, theme: themes[0], onChangeContent: vi.fn(), onRedo: vi.fn(), onUndo: vi.fn() };

const renderModel = (artifact = model, currentProject = project) => renderToString(<DialogProvider><ClassSequenceDiagramEditor {...common} artifact={artifact} project={currentProject} /></DialogProvider>).replace(/<!--.*?-->/g, '');
const renderSequence = (currentProject = project) => renderToString(<DialogProvider><SequenceDiagramEditor {...common} artifact={sequence} project={currentProject} /></DialogProvider>).replace(/<!--.*?-->/g, '');

describe('sequence model synchronization UI', () => {
  it('shows only linked sequence novelties, selected by default, with navigation and linking below', () => {
    const unlinked = { ...sequence, id: 'unlinked', content: { ...sequence.content, classDiagramArtifactId: undefined, participants: [{ ...sequence.content.participants[0], classifierName: 'Otra' }] } };
    const html = renderModel(model, { ...project, artifacts: [...project.artifacts, unlinked] });
    expect(html).toContain('2 para traer');
    expect(html).toContain('title="Clases y operaciones de las secuencias vinculadas que todavía no están en este diagrama"');
    expect(html).toContain('Elegí qué traer de las secuencias');
    const syncMenu = html.slice(html.indexOf('sequence-model-status')).split('</details>')[0];
    expect((syncMenu.match(/aria-checked="true"/g) ?? [])).toHaveLength(2);
    expect(html).toContain('Traer seleccionadas');
    expect(html).toContain('Abrir secuencia vinculada');
    expect(html).toContain('Vincular 1 secuencia sin vincular');
    expect(html).not.toContain('>Otra<');
  });
  it('does not offer to link sequences that already use another model', () => {
    const otherModel = { ...model, id: 'other-model', content: { ...model.content, linkedSequenceDiagramIds: ['other-sequence'] } };
    const otherSequence = { ...sequence, id: 'other-sequence', content: { ...sequence.content, classDiagramArtifactId: otherModel.id } };
    const html = renderModel(model, { ...project, artifacts: [...project.artifacts, otherModel, otherSequence] });
    expect(html).not.toContain('secuencia sin vincular');
    expect(html).not.toContain('secuencias sin vincular');
    expect(html).toContain('2 para traer');
  });
  it('lists the operations with their parameters in the menu', () => {
    const withParameters = { ...sequence, content: { ...sequence.content, items: [{ ...createSequenceMessage('synchronous', 't', 't'), id: 'dni', name: 'ingresarDni', arguments: 'dni' }] } };
    const html = renderModel(model, { ...project, artifacts: [model, withParameters] });
    expect(html).toContain('ingresarDni(dni)');
  });
  it('shows the neutral up-to-date and no-linked-sequences states', () => {
    const synced = { ...model, content: { ...model.content, ...importClassesFromSequences(model.content, [sequence.content]).content } };
    expect(renderModel(synced)).toContain('✓ Todo traído de 1 secuencia');
    expect(renderModel(synced)).toContain('title="Todo lo que aparece en las secuencias vinculadas ya está en este diagrama"');
    expect(renderModel({ ...model, content: { ...model.content, linkedSequenceDiagramIds: [] } })).toContain('Sin secuencias vinculadas');
  });
  it('shows missing model elements and the import action only when necessary', () => {
    expect(renderSequence()).toContain('2 faltan');
    expect(renderSequence()).toContain('2 elementos faltan en «Modelo»');
    expect(renderSequence()).toContain('Agregar todo a «Modelo»');
    const synced = { ...model, content: { ...model.content, ...importClassesFromSequences(model.content, [sequence.content]).content } };
    const html = renderSequence({ ...project, artifacts: [synced, sequence] });
    expect(html).toContain('✓ Al día');
    expect(html).not.toContain('Agregar todo a «Modelo»');
    expect(html).toContain('Abrir «Modelo»');
  });
  it('flags missing participants and messages with a tooltip, without dotted underlines', () => {
    const props = { content: sequence.content, layout: buildSequenceLayout(sequence.content), selected: null, theme: themes[0], onSelect: vi.fn(), onParticipantPointerDown: vi.fn(), onNotePointerDown: vi.fn(), onNoteResizePointerDown: vi.fn() };
    const html = renderToString(<SequenceDiagramCanvas {...props} missingInModel={{ messageIds: new Set(['call']), participantIds: new Set(['t']) }} />);
    const warningLines = html.match(/<line data-export-control="true"[^>]*stroke-dasharray="2 3"[^>]*>/g) ?? [];
    expect(warningLines).toHaveLength(0);
    expect(html).toContain('<title>No está en el modelo de clases</title>');
    const exportHtml = renderToString(<SequenceDiagramCanvas {...props} interactive={false} />);
    expect(exportHtml).not.toContain('No está en el modelo de clases');
    expect(exportHtml).not.toContain('stroke-dasharray="2 3"');
  });
});
