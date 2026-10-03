import type { DesignArtifact, SequenceDiagramArtifact } from '../types/diagram';

/** Link a new sequence only when the project has an unambiguous sequence model. */
export const linkNewSequenceToOnlyModel = (artifacts: DesignArtifact[], sequence: SequenceDiagramArtifact): DesignArtifact[] => {
  if (sequence.content.classDiagramArtifactId !== undefined) return [...artifacts, sequence];
  const models = artifacts.filter((artifact) => artifact.type === 'class-sequence-diagram');
  if (models.length !== 1) return [...artifacts, sequence];
  const model = models[0];
  return [...artifacts.map((artifact) => artifact.id === model.id && artifact.type === 'class-sequence-diagram' ? {
    ...artifact,
    updatedAt: sequence.updatedAt,
    content: { ...artifact.content, linkedSequenceDiagramIds: [...new Set([...artifact.content.linkedSequenceDiagramIds, sequence.id])] },
  } : artifact), { ...sequence, content: { ...sequence.content, classDiagramArtifactId: model.id } }];
};
