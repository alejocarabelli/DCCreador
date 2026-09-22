import type { DiagramProject } from '../types/diagram';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Shape gate for any JSON a user hands us. This lived in four copies with three
 * slightly different definitions, and the sequence editor had none at all — it
 * cast raw parsed JSON straight into the project state. One definition now.
 *
 * A project is importable when it is named and carries either the multi-artifact
 * envelope or a single legacy `content` body. `normalizeDiagramProject` fills in
 * everything else, so this only has to reject files that are not projects.
 */
export const isImportableProject = (value: unknown): value is DiagramProject => {
  if (!isRecord(value) || typeof value.name !== 'string') {
    return false;
  }

  if (Array.isArray(value.artifacts)) {
    return value.artifacts.every((artifact) => isRecord(artifact) && 'content' in artifact);
  }

  return isRecord(value.content);
};

export const IMPORT_INVALID_MESSAGE = 'El archivo no tiene la estructura de un proyecto del modelador.';
export const IMPORT_UNREADABLE_MESSAGE = 'No se pudo leer el archivo. Revisá que sea un JSON exportado desde el modelador.';
