import type { DesignArtifact, DiagramProject, SequenceTimelineItem } from '../types/diagram';
import { normalizeArtifact } from './diagramNormalization';
import { createId } from './id';
import { reconcileSequenceModelLinks } from './sequenceModelLink';

const interactionIds = (items: SequenceTimelineItem[]): string[] => items.flatMap((item) => item.kind === 'fragment'
  ? [...(item.interactionArtifactId ? [item.interactionArtifactId] : []), ...item.operands.flatMap((operand) => interactionIds(operand.items))]
  : []);

const flowClassModelId = (artifact: Extract<DesignArtifact, { type: 'use-case-flow' }>, artifacts: DesignArtifact[]): string | undefined => {
  const models = artifacts.filter((candidate) => candidate.type === 'class-diagram');
  return models.some((candidate) => candidate.id === artifact.content.classDiagramArtifactId)
    ? artifact.content.classDiagramArtifactId
    : models.length === 1 ? models[0].id : undefined;
};

const artifactReferences = (artifact: DesignArtifact, artifacts: DesignArtifact[]): string[] => {
  switch (artifact.type) {
    case 'class-sequence-diagram':
      return artifact.content.linkedSequenceDiagramIds;
    case 'use-case-flow': {
      const modelId = flowClassModelId(artifact, artifacts);
      return modelId ? [modelId] : [];
    }
    case 'sequence-diagram': {
      const modelId = artifact.content.classDiagramArtifactId;
      return [...(modelId ? [modelId] : []), ...(artifact.content.flowArtifactId ? [artifact.content.flowArtifactId] : []), ...interactionIds(artifact.content.items)];
    }
    default:
      return [];
  }
};

/** Include both outgoing and incoming links so a model and its consumers stay together. */
export const getLinkedArtifacts = (project: DiagramProject, artifactId: string): DesignArtifact[] => {
  const ids = new Set([artifactId]);
  let changed = true;
  while (changed) {
    changed = false;
    project.artifacts.forEach((artifact) => {
      const references = artifactReferences(artifact, project.artifacts);
      if (!ids.has(artifact.id) && !references.some((id) => ids.has(id))) return;
      [artifact.id, ...references].forEach((id) => {
        if (!ids.has(id)) { ids.add(id); changed = true; }
      });
    });
  }
  return project.artifacts.filter((artifact) => ids.has(artifact.id));
};

/** Keep only references that resolve in this project and remap ids transferred as a group. */
export const relinkArtifactForProject = (
  artifact: DesignArtifact,
  artifacts: DesignArtifact[],
  idMap: ReadonlyMap<string, string> = new Map(),
  originalArtifacts: DesignArtifact[] = artifacts,
): DesignArtifact => {
  const resolve = (id: string | undefined, types: DesignArtifact['type'][]): string | undefined => {
    if (!id) return undefined;
    const mapped = idMap.get(id) ?? id;
    return artifacts.some((candidate) => candidate.id === mapped && types.includes(candidate.type)) ? mapped : undefined;
  };
  if (artifact.type === 'class-sequence-diagram') {
    return { ...artifact, content: {
      ...artifact.content,
      sourceClassDiagramArtifactId: resolve(artifact.content.sourceClassDiagramArtifactId, ['class-diagram']),
      linkedSequenceDiagramIds: artifact.content.linkedSequenceDiagramIds
        .map((id) => resolve(id, ['sequence-diagram'])).filter((id): id is string => id !== undefined),
    } };
  }
  if (artifact.type === 'use-case-flow') {
    return { ...artifact, content: { ...artifact.content, classDiagramArtifactId: resolve(flowClassModelId(artifact, originalArtifacts), ['class-diagram']) } };
  }
  if (artifact.type !== 'sequence-diagram') return artifact;
  // A sequence draws only on a "Clases de secuencias" model.
  const classDiagramArtifactId = resolve(artifact.content.classDiagramArtifactId, ['class-sequence-diagram']);
  const model = artifacts.find((candidate) => candidate.id === classDiagramArtifactId);
  const classNodes = model?.type === 'class-diagram' || model?.type === 'class-sequence-diagram' ? model.content.nodes : [];
  const nodeIds = new Set(classNodes.map((node) => node.id));
  const methodIds = new Set(classNodes.flatMap((node) => node.data.methods.map((method) => method.id)));
  const relinkItems = (items: SequenceTimelineItem[]): SequenceTimelineItem[] => items.map((item) => item.kind === 'fragment'
    ? { ...item, interactionArtifactId: resolve(item.interactionArtifactId, ['sequence-diagram']), operands: item.operands.map((operand) => ({ ...operand, items: relinkItems(operand.items) })) }
    : { ...item, operationMethodId: item.operationMethodId && methodIds.has(item.operationMethodId) ? item.operationMethodId : undefined });
  return { ...artifact, content: {
    ...artifact.content,
    classDiagramArtifactId,
    flowArtifactId: resolve(artifact.content.flowArtifactId, ['use-case-flow']),
    participants: artifact.content.participants.map((participant) => ({
      ...participant,
      classifierNodeId: participant.classifierNodeId && nodeIds.has(participant.classifierNodeId) ? participant.classifierNodeId : undefined,
    })),
    items: relinkItems(artifact.content.items),
  } };
};

const uniqueId = (used: Set<string>): string => {
  let id = createId();
  while (used.has(id)) id = createId();
  used.add(id);
  return id;
};

export const importArtifactIntoProjects = (projects: DiagramProject[], projectId: string, artifact: DesignArtifact): DiagramProject[] => {
  if (!projects.some((project) => project.id === projectId)) return projects;
  const used = new Set(projects.flatMap((project) => project.artifacts.map((candidate) => candidate.id)));
  const now = new Date().toISOString();
  const imported = { ...artifact, id: uniqueId(used), updatedAt: now };
  return projects.map((project) => {
    if (project.id !== projectId) return project;
    // A standalone file cannot carry links into a different project, even when ids happen to match.
    const detached = relinkArtifactForProject(imported, [imported], new Map([[artifact.id, imported.id]]));
    return { ...project, artifacts: [...project.artifacts, detached], activeArtifactId: detached.id, updatedAt: now };
  });
};

export type ArtifactMoveResult = { projects: DiagramProject[]; idMap: Map<string, string> };

export const moveArtifactsBetweenProjects = (
  projects: DiagramProject[], sourceProjectId: string, targetProjectId: string, artifactId: string, includeLinked: boolean,
): ArtifactMoveResult => {
  const source = projects.find((project) => project.id === sourceProjectId);
  const target = projects.find((project) => project.id === targetProjectId);
  const artifact = source?.artifacts.find((candidate) => candidate.id === artifactId);
  const idMap = new Map<string, string>();
  if (!source || !target || !artifact || source === target) return { projects, idMap };
  const moving = includeLinked ? getLinkedArtifacts(source, artifactId) : [artifact];
  const movingIds = new Set(moving.map((candidate) => candidate.id));
  const used = new Set(projects.flatMap((project) => project.artifacts.map((candidate) => candidate.id)));
  moving.forEach((candidate) => idMap.set(candidate.id, target.artifacts.some((existing) => existing.id === candidate.id) ? uniqueId(used) : candidate.id));
  const now = new Date().toISOString();
  const moved = moving.map((candidate) => ({ ...candidate, id: idMap.get(candidate.id)!, updatedAt: now }));
  // Resolve transferred links only against the transferred group, never an unrelated destination artifact with the same id.
  const targetArtifacts = reconcileSequenceModelLinks([...target.artifacts, ...moved.map((candidate) => relinkArtifactForProject(candidate, moved, idMap, source.artifacts))]);
  let remaining = source.artifacts.filter((candidate) => !movingIds.has(candidate.id));
  if (remaining.length === 0) {
    const empty = normalizeArtifact({ id: uniqueId(used), type: 'class-diagram', name: 'Diagrama de clases', content: { nodes: [], edges: [] } }, { createdAt: now, updatedAt: now });
    if (empty) remaining = [empty];
  }
  const sourceArtifacts = reconcileSequenceModelLinks(remaining.map((candidate) => artifactReferences(candidate, source.artifacts).some((id) => movingIds.has(id))
    ? relinkArtifactForProject(candidate, remaining, undefined, source.artifacts)
    : candidate));
  return { idMap, projects: projects.map((project) => {
    if (project.id === sourceProjectId) return { ...project, artifacts: sourceArtifacts, activeArtifactId: sourceArtifacts.some((candidate) => candidate.id === project.activeArtifactId) ? project.activeArtifactId : sourceArtifacts[0].id, updatedAt: now };
    if (project.id === targetProjectId) return { ...project, artifacts: targetArtifacts, activeArtifactId: idMap.get(artifactId), updatedAt: now };
    return project;
  }) };
};
