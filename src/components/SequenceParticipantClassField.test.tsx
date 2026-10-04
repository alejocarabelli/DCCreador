import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { ClassSequenceDiagramArtifact, SequenceParticipant } from '../types/diagram';
import { SequenceParticipantClassField } from './SequenceParticipantClassField';

const participant: SequenceParticipant = { id: 'p', kind: 'object', name: 'actual', classifierName: 'Pedido', x: 120 };
const model: ClassSequenceDiagramArtifact = {
  id: 'model', type: 'class-sequence-diagram', name: 'Clases de secuencias', createdAt: 'now', updatedAt: 'now',
  content: {
    version: 1, linkedSequenceDiagramIds: [], edges: [],
    nodes: ['Pedido', 'Cliente'].map((name) => ({
      id: name.toLowerCase(), type: 'classNode', position: { x: 0, y: 0 },
      data: { name, attributes: [], methods: [] },
    })),
  },
};
const renderField = (current = participant, currentModel: ClassSequenceDiagramArtifact | undefined = model) =>
  renderToString(<SequenceParticipantClassField participant={current} model={currentModel} onChange={vi.fn()} />);

describe('participant class inspector', () => {
  it('shows the effective class resolved by name and does not offer an ineffective unlink', () => {
    const html = renderField();
    expect(html).toContain('<option value="pedido" selected="">Pedido</option>');
    expect(html).toContain('<option value="cliente">Cliente</option>');
    expect(html).not.toContain('Sin vínculo');
    expect(html).toContain('se vincula por nombre automáticamente');
  });

  it('shows a deliberate link to another class and keeps the alternative choices', () => {
    const html = renderField({ ...participant, classifierNodeId: 'cliente' });
    expect(html).toContain('<option value="cliente" selected="">Cliente</option>');
    expect(html).toContain('<option value="pedido">Pedido</option>');
    expect(html).not.toContain('Sin vínculo');
  });

  it('offers manual mode only when there is no class with the participant name', () => {
    const html = renderField({ ...participant, classifierName: 'Pendiente', classifierNodeId: 'deleted' });
    expect(html).toContain('<option value="" selected="">Sin vínculo (manual)</option>');
    expect(html).toContain('Si el nombre coincide');
  });

  it('disables class selection without an associated sequence model', () => {
    const html = renderToString(<SequenceParticipantClassField participant={participant} onChange={vi.fn()} />);
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('value="pedido"');
    expect(html).toContain('Vinculá la secuencia');
  });
});
