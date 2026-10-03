import { describe, expect, it } from 'vitest';
import type { ClassSequenceDiagramArtifact, SequenceDiagramArtifact } from '../types/diagram';
import { createEmptySequenceDiagramContent } from './sequenceDiagram';
import { linkNewSequenceToOnlyModel } from './sequenceModelLink';

const model: ClassSequenceDiagramArtifact = { id: 'model', type: 'class-sequence-diagram', name: 'Modelo', createdAt: 'before', updatedAt: 'before', content: { version: 1, nodes: [], edges: [], linkedSequenceDiagramIds: ['old'] } };
const sequence: SequenceDiagramArtifact = { id: 'new', type: 'sequence-diagram', name: 'Nueva', createdAt: 'now', updatedAt: 'now', content: createEmptySequenceDiagramContent() };

describe('linkNewSequenceToOnlyModel', () => {
  it('links both sides, preserving old links and inputs', () => {
    const result = linkNewSequenceToOnlyModel([model], sequence);
    expect(result[0]).toMatchObject({ updatedAt: 'now', content: { linkedSequenceDiagramIds: ['old', 'new'] } });
    expect(result[1].content).toMatchObject({ classDiagramArtifactId: 'model' });
    expect(model.content.linkedSequenceDiagramIds).toEqual(['old']);
    expect(sequence.content.classDiagramArtifactId).toBeUndefined();
  });
  it('does not guess with no model or multiple models', () => {
    expect(linkNewSequenceToOnlyModel([], sequence)).toEqual([sequence]);
    const models = [model, { ...model, id: 'other' }];
    expect(linkNewSequenceToOnlyModel(models, sequence)).toEqual([...models, sequence]);
  });
  it('preserves an explicit association', () => {
    const explicit = { ...sequence, content: { ...sequence.content, classDiagramArtifactId: 'explicit' } };
    expect(linkNewSequenceToOnlyModel([model], explicit)).toEqual([model, explicit]);
  });
});
