import type { DiagramProject } from '../types/diagram';
import { normalizeDiagramProject } from '../utils/diagramNormalization';

const LEGACY_STORAGE_KEY = 'class-diagram-projects:v1';
const STORAGE_KEY = 'design-projects:v2';
const CORRUPT_BACKUP_PREFIX = 'design-projects:recovery:';

type StoredProjectsEnvelope = {
  version: 2;
  projects: DiagramProject[];
};

export type LoadProjectsResult = {
  projects: DiagramProject[];
  skipInitialSave: boolean;
  warning: string | null;
};

export type SaveProjectsResult = {
  ok: boolean;
  error: string | null;
};

const parseStoredProjects = (rawProjects: string): DiagramProject[] => {
  const parsed = JSON.parse(rawProjects) as unknown;

  if (Array.isArray(parsed)) {
    return (parsed as DiagramProject[]).map(normalizeDiagramProject);
  }

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'version' in parsed &&
    parsed.version === 2 &&
    'projects' in parsed &&
    Array.isArray(parsed.projects)
  ) {
    return (parsed.projects as DiagramProject[]).map(normalizeDiagramProject);
  }

  throw new Error('Formato de almacenamiento no reconocido.');
};

const preserveCorruptData = (sourceKey: string, rawProjects: string): string | null => {
  const recoveryKey = `${CORRUPT_BACKUP_PREFIX}${Date.now()}`;

  try {
    localStorage.setItem(recoveryKey, JSON.stringify({ sourceKey, rawProjects }));
    return recoveryKey;
  } catch {
    return null;
  }
};

export const loadProjects = (): LoadProjectsResult => {
  let currentProjects: string | null;
  let legacyProjects: string | null;

  try {
    currentProjects = localStorage.getItem(STORAGE_KEY);
    legacyProjects = localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return {
      projects: [],
      skipInitialSave: true,
      warning: 'El almacenamiento local no está disponible. Los cambios de esta sesión no se guardarán.',
    };
  }

  const sourceKey = currentProjects === null ? LEGACY_STORAGE_KEY : STORAGE_KEY;
  const rawProjects = currentProjects ?? legacyProjects;

  if (rawProjects === null) {
    return { projects: [], skipInitialSave: false, warning: null };
  }

  try {
    return {
      projects: parseStoredProjects(rawProjects),
      skipInitialSave: false,
      warning: null,
    };
  } catch {
    const recoveryKey = preserveCorruptData(sourceKey, rawProjects);
    const recoveryMessage = recoveryKey === null
      ? 'No se pudieron leer los proyectos guardados. Exportá los proyectos antes de seguir trabajando.'
      : `No se pudieron leer los proyectos guardados. Se preservó una copia de recuperación (${recoveryKey}).`;

    return {
      projects: [],
      skipInitialSave: true,
      warning: recoveryMessage,
    };
  }
};

export const saveProjects = (projects: DiagramProject[]): SaveProjectsResult => {
  const payload: StoredProjectsEnvelope = { version: 2, projects };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return { ok: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return {
      ok: false,
      error: `No se pudieron guardar los cambios en este dispositivo: ${message}`,
    };
  }
};
