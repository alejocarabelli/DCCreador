import type { DesignArtifact } from '../types/diagram';
import { normalizeArtifact } from './diagramNormalization';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRecordArray = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every(isRecord);

const hasDiagramShape = (content: Record<string, unknown>): boolean =>
  isRecordArray(content.nodes) && isRecordArray(content.edges)
  && content.nodes.every((node) => isRecord(node.data) && isRecord(node.position))
  && content.edges.every((edge) => typeof edge.source === 'string' && typeof edge.target === 'string');

const hasUniqueIds = (items: Record<string, unknown>[]): boolean =>
  items.every((item) => typeof item.id === 'string' && item.id.length > 0 && item.id === item.id.trim())
  && new Set(items.map((item) => item.id)).size === items.length;

const hasClassDiagramShape = (content: Record<string, unknown>): boolean => {
  if (!hasDiagramShape(content) || !isRecordArray(content.nodes) || !isRecordArray(content.edges)) return false;
  const nodeIds = new Set(content.nodes.map((node) => node.id));
  return hasUniqueIds(content.nodes) && hasUniqueIds(content.edges)
    && content.nodes.every((node) => {
      const data = node.data;
      const position = node.position;
      return isRecord(data) && typeof data.name === 'string' && isRecord(position)
        && typeof position.x === 'number' && Number.isFinite(position.x)
        && typeof position.y === 'number' && Number.isFinite(position.y)
        && isRecordArray(data.attributes) && isRecordArray(data.methods)
        && hasUniqueIds(data.attributes) && hasUniqueIds(data.methods)
        && data.attributes.every((attribute) => typeof attribute.name === 'string' && typeof attribute.type === 'string')
        && data.methods.every((method) => typeof method.name === 'string' && typeof method.parameters === 'string' && typeof method.returnType === 'string');
    })
    && content.edges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
};

const hasArtifactShape = (value: unknown): boolean => {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name.trim() || !isRecord(value.content)) return false;
  const content = value.content;
  switch (value.type) {
    case 'class-diagram':
    case 'class-sequence-diagram':
      return hasClassDiagramShape(content);
    case 'use-case-model':
      return hasDiagramShape(content);
    case 'sequence-diagram':
      return isRecordArray(content.participants) && isRecordArray(content.items);
    case 'use-case-flow':
      return isRecord(content.description) && isRecordArray(content.basicFlow)
        && isRecordArray(content.alternativeFlows)
        && content.alternativeFlows.every((flow) => isRecordArray(flow.steps));
    default:
      return false;
  }
};

/** A standalone artifact, or the artifacts in an exported project. Never infer a type from an arbitrary JSON. */
export const extractImportableArtifacts = (value: unknown): DesignArtifact[] | null => {
  const candidates = isRecord(value) && Array.isArray(value.artifacts) ? value.artifacts : [value];
  if (candidates.length === 0 || !candidates.every(hasArtifactShape)) return null;
  const now = new Date().toISOString();
  try {
    const artifacts = candidates.map((candidate) => normalizeArtifact(candidate, { createdAt: now, updatedAt: now }));
    return artifacts.every((artifact) => artifact !== null) ? artifacts : null;
  } catch {
    return null;
  }
};

export const serializeArtifact = (artifact: DesignArtifact): string =>
  JSON.stringify(normalizeArtifact(artifact, artifact), null, 2);

export const downloadTextFile = (text: string, filename: string, mimeType: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadArtifactFile = (artifact: DesignArtifact): void =>
  downloadTextFile(serializeArtifact(artifact), `${artifact.name.trim() || 'artefacto'}.json`, 'application/json');

export const ARTIFACT_IMPORT_INVALID_MESSAGE =
  'El archivo debe contener un artefacto con name, type y content válidos, o un proyecto exportado con artefactos. En clases, revisá los IDs únicos, las posiciones numéricas y los extremos de las relaciones.';
