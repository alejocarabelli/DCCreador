import type { ClassSequenceDiagramArtifact, DesignArtifact, SequenceDiagramArtifact } from '../types/diagram';
import { bindSequenceToModel } from './sequenceClassImport';

/**
 * A sequence diagram draws on at most one "Clases de secuencias" model: its
 * `classDiagramArtifactId`. The model's `linkedSequenceDiagramIds` is the same
 * link read from the other side, so it is derived here instead of edited on
 * its own. A plain class diagram is never a sequence model.
 */
export const isSequenceModelArtifact = (artifact: DesignArtifact): artifact is ClassSequenceDiagramArtifact =>
  artifact.type === 'class-sequence-diagram';

/** The model a sequence uses, or `undefined` when it has none (or a stale one). */
export const findSequenceModel = (
  artifacts: DesignArtifact[],
  sequence: Pick<SequenceDiagramArtifact, 'content'>,
): ClassSequenceDiagramArtifact | undefined => {
  const modelId = sequence.content.classDiagramArtifactId;
  if (modelId === undefined || modelId === null) return undefined;
  return artifacts.find((artifact): artifact is ClassSequenceDiagramArtifact =>
    artifact.id === modelId && isSequenceModelArtifact(artifact));
};

/**
 * Makes both sides of every sequence ↔ model link agree:
 * - a sequence that points at something that is not a "Clases de secuencias"
 *   model (an older plain class diagram, a deleted artifact) moves to the model
 *   that still lists it, or loses the link;
 * - each model lists exactly the sequences that point at it, keeping the order
 *   it already had.
 * - each linked sequence is tied to the model's classes and methods by name
 *   (see `bindSequenceToModel`), so renames in the model reach it.
 * A sequence with no model stays without one: unlinking is a choice, and
 * `null` ("Sin vincular", chosen on purpose) is left exactly as it is.
 * Returns the same array when nothing changes.
 */
export const reconcileSequenceModelLinks = (artifacts: DesignArtifact[], now?: string): DesignArtifact[] => {
  const models = artifacts.filter(isSequenceModelArtifact);
  const modelIds = new Set(models.map((model) => model.id));
  let changed = false;

  const relinked = artifacts.map((artifact) => {
    if (artifact.type !== 'sequence-diagram') return artifact;
    const current = artifact.content.classDiagramArtifactId;
    if (current === undefined || current === null || modelIds.has(current)) return artifact;
    const listing = models.find((model) => model.content.linkedSequenceDiagramIds.includes(artifact.id));
    changed = true;
    return {
      ...artifact,
      ...(now === undefined ? {} : { updatedAt: now }),
      content: { ...artifact.content, classDiagramArtifactId: listing?.id },
    };
  });

  const sequencesByModel = new Map<string, string[]>();
  relinked.forEach((artifact) => {
    if (artifact.type !== 'sequence-diagram' || artifact.content.classDiagramArtifactId == null) return;
    const ids = sequencesByModel.get(artifact.content.classDiagramArtifactId) ?? [];
    ids.push(artifact.id);
    sequencesByModel.set(artifact.content.classDiagramArtifactId, ids);
  });

  const modelsById = new Map(models.map((model) => [model.id, model]));
  const result = relinked.map((artifact) => {
    if (artifact.type === 'sequence-diagram') {
      const model = artifact.content.classDiagramArtifactId == null
        ? undefined
        : modelsById.get(artifact.content.classDiagramArtifactId);
      const bound = model === undefined ? artifact.content : bindSequenceToModel(artifact.content, model.content);
      if (bound === artifact.content) return artifact;
      changed = true;
      return { ...artifact, content: bound };
    }
    if (!isSequenceModelArtifact(artifact)) return artifact;
    const linked = sequencesByModel.get(artifact.id) ?? [];
    const kept = artifact.content.linkedSequenceDiagramIds.filter((id) => linked.includes(id));
    const next = [...kept, ...linked.filter((id) => !kept.includes(id))];
    const current = artifact.content.linkedSequenceDiagramIds;
    if (next.length === current.length && next.every((id, index) => id === current[index])) return artifact;
    changed = true;
    return {
      ...artifact,
      ...(now === undefined ? {} : { updatedAt: now }),
      content: { ...artifact.content, linkedSequenceDiagramIds: next },
    };
  });

  return changed ? result : artifacts;
};

/**
 * Points the given sequences at `modelId` and reconciles. `null` unlinks them on
 * purpose; `undefined` leaves them as if they had never chosen.
 */
export const linkSequencesToModel = (
  artifacts: DesignArtifact[],
  sequenceIds: readonly string[],
  modelId: string | null | undefined,
  now?: string,
): DesignArtifact[] => reconcileSequenceModelLinks(artifacts.map((artifact) => {
  if (artifact.type !== 'sequence-diagram' || !sequenceIds.includes(artifact.id)) return artifact;
  if (artifact.content.classDiagramArtifactId === modelId) return artifact;
  return {
    ...artifact,
    ...(now === undefined ? {} : { updatedAt: now }),
    content: { ...artifact.content, classDiagramArtifactId: modelId },
  };
}), now);

/** Sequences without a "Clases de secuencias" model, including the ones unlinked on purpose (`null`). */
export const findUnlinkedSequences = (artifacts: DesignArtifact[]): SequenceDiagramArtifact[] =>
  artifacts.filter((artifact): artifact is SequenceDiagramArtifact =>
    artifact.type === 'sequence-diagram' && findSequenceModel(artifacts, artifact) === undefined);

/**
 * Sequences that never chose: no model and not unlinked on purpose. These are the
 * only ones automatic links (new model, converted diagram) may take.
 */
export const findNeverLinkedSequences = (artifacts: DesignArtifact[]): SequenceDiagramArtifact[] =>
  findUnlinkedSequences(artifacts).filter((sequence) => sequence.content.classDiagramArtifactId !== null);

/** Link a new sequence only when the project has an unambiguous sequence model. */
export const linkNewSequenceToOnlyModel = (artifacts: DesignArtifact[], sequence: SequenceDiagramArtifact): DesignArtifact[] => {
  if (sequence.content.classDiagramArtifactId !== undefined) return [...artifacts, sequence]; // an id or null is already a choice
  const models = artifacts.filter(isSequenceModelArtifact);
  if (models.length !== 1) return [...artifacts, sequence];
  return linkSequencesToModel([...artifacts, sequence], [sequence.id], models[0].id, sequence.updatedAt);
};
