import { describe, expect, it } from 'vitest';
import type { ClassSequenceDiagramArtifact, DesignArtifact, SequenceDiagramArtifact } from '../types/diagram';
import { createEmptySequenceDiagramContent } from './sequenceDiagram';
import { findNeverLinkedSequences, findSequenceModel, findUnlinkedSequences, linkNewSequenceToOnlyModel, linkSequencesToModel, reconcileSequenceModelLinks } from './sequenceModelLink';

const model: ClassSequenceDiagramArtifact = { id: 'model', type: 'class-sequence-diagram', name: 'Modelo', createdAt: 'before', updatedAt: 'before', content: { version: 1, nodes: [], edges: [], linkedSequenceDiagramIds: ['old'] } };
const old: SequenceDiagramArtifact = { id: 'old', type: 'sequence-diagram', name: 'Vieja', createdAt: 'before', updatedAt: 'before', content: { ...createEmptySequenceDiagramContent(), classDiagramArtifactId: 'model' } };
const sequence: SequenceDiagramArtifact = { id: 'new', type: 'sequence-diagram', name: 'Nueva', createdAt: 'now', updatedAt: 'now', content: createEmptySequenceDiagramContent() };

describe('linkNewSequenceToOnlyModel', () => {
  it('links both sides, preserving old links and inputs', () => {
    const result = linkNewSequenceToOnlyModel([model, old], sequence);
    expect(result[0]).toMatchObject({ updatedAt: 'now', content: { linkedSequenceDiagramIds: ['old', 'new'] } });
    expect(result[2].content).toMatchObject({ classDiagramArtifactId: 'model' });
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

describe('reconcileSequenceModelLinks', () => {
  const classDiagram: DesignArtifact = { id: 'cd', type: 'class-diagram', name: 'Dominio', createdAt: 'x', updatedAt: 'x', content: { nodes: [], edges: [] } };
  const seq = (id: string, classDiagramArtifactId?: string): SequenceDiagramArtifact => ({
    id, type: 'sequence-diagram', name: id, createdAt: 'x', updatedAt: 'x',
    content: { ...createEmptySequenceDiagramContent(), classDiagramArtifactId },
  });
  const csd = (id: string, linkedSequenceDiagramIds: string[]): ClassSequenceDiagramArtifact => ({
    id, type: 'class-sequence-diagram', name: id, createdAt: 'x', updatedAt: 'x',
    content: { version: 1, nodes: [], edges: [], linkedSequenceDiagramIds },
  });

  it('returns the same array when both sides already agree', () => {
    const artifacts = [csd('m', ['a']), seq('a', 'm'), seq('b')];
    expect(reconcileSequenceModelLinks(artifacts)).toBe(artifacts);
  });

  it('moves a sequence that points at a plain class diagram to the model that lists it', () => {
    const [, , migrated] = reconcileSequenceModelLinks([classDiagram, csd('m', ['a']), seq('a', 'cd')]) as [unknown, ClassSequenceDiagramArtifact, SequenceDiagramArtifact];
    expect(migrated.content.classDiagramArtifactId).toBe('m');
  });

  it('drops links to missing artifacts and lists exactly the sequences that point at each model', () => {
    const result = reconcileSequenceModelLinks([csd('m', ['gone', 'b']), csd('n', ['a']), seq('a', 'm'), seq('b', 'missing'), seq('c', 'missing')]);
    expect((result[0] as ClassSequenceDiagramArtifact).content.linkedSequenceDiagramIds).toEqual(['b', 'a']);
    expect((result[1] as ClassSequenceDiagramArtifact).content.linkedSequenceDiagramIds).toEqual([]);
    expect((result[3] as SequenceDiagramArtifact).content.classDiagramArtifactId).toBe('m');
    expect((result[4] as SequenceDiagramArtifact).content.classDiagramArtifactId).toBeUndefined();
  });

  it('never links a sequence the person left without a model', () => {
    const result = reconcileSequenceModelLinks([csd('m', ['a']), seq('a')]);
    expect((result[0] as ClassSequenceDiagramArtifact).content.linkedSequenceDiagramIds).toEqual([]);
    expect((result[1] as SequenceDiagramArtifact).content.classDiagramArtifactId).toBeUndefined();
  });

  it('links only the requested sequences', () => {
    const result = linkSequencesToModel([csd('m', []), csd('n', ['b']), seq('a'), seq('b', 'n')], ['a'], 'm');
    expect((result[0] as ClassSequenceDiagramArtifact).content.linkedSequenceDiagramIds).toEqual(['a']);
    expect((result[1] as ClassSequenceDiagramArtifact).content.linkedSequenceDiagramIds).toEqual(['b']);
  });
});

describe('sequences unlinked on purpose (null)', () => {
  const seq = (id: string, classDiagramArtifactId?: string | null): SequenceDiagramArtifact => ({
    id, type: 'sequence-diagram', name: id, createdAt: 'x', updatedAt: 'x',
    content: { ...createEmptySequenceDiagramContent(), classDiagramArtifactId },
  });

  it('automatic links skip null, the explicit list includes it', () => {
    const artifacts = [model, seq('never'), seq('none', null), seq('stale', 'gone')];
    expect(findNeverLinkedSequences(artifacts).map((s) => s.id)).toEqual(['never', 'stale']);
    expect(findUnlinkedSequences(artifacts).map((s) => s.id)).toEqual(['never', 'none', 'stale']);
  });

  it('a new model takes only never-chosen sequences; the explicit button also takes null', () => {
    const artifacts = [seq('never'), seq('none', null)];
    const created = linkSequencesToModel([...artifacts, { ...model, content: { ...model.content, linkedSequenceDiagramIds: [] } }], findNeverLinkedSequences(artifacts).map((s) => s.id), 'model');
    expect(created.filter((a): a is SequenceDiagramArtifact => a.type === 'sequence-diagram').map((s) => s.content.classDiagramArtifactId)).toEqual(['model', null]);
    const explicit = linkSequencesToModel(created, findUnlinkedSequences(created).map((s) => s.id), 'model');
    expect(explicit.filter((a): a is SequenceDiagramArtifact => a.type === 'sequence-diagram').map((s) => s.content.classDiagramArtifactId)).toEqual(['model', 'model']);
  });

  it('unlinking stores null and keeps it through reconcile', () => {
    const linked = [{ ...model, content: { ...model.content, linkedSequenceDiagramIds: ['a'] } }, seq('a', 'model')];
    const result = linkSequencesToModel(linked, ['a'], null);
    expect((result[1] as SequenceDiagramArtifact).content.classDiagramArtifactId).toBeNull();
    expect((result[0] as ClassSequenceDiagramArtifact).content.linkedSequenceDiagramIds).toEqual([]);
    const withNull = [model, seq('n', null)];
    expect(reconcileSequenceModelLinks(withNull)[1]).toBe(withNull[1]);
    expect(findSequenceModel(withNull, seq('n', null))).toBeUndefined();
  });

  it('does not link a new sequence that is already null', () => {
    const none = seq('n', null);
    expect(linkNewSequenceToOnlyModel([model], none)).toEqual([model, none]);
  });
});
