import type { DiagramProject } from '../types/diagram';
import { normalizeDiagramProject } from '../utils/diagramNormalization';

const LEGACY_STORAGE_KEY = 'class-diagram-projects:v1';
const STORAGE_KEY = 'design-projects:v2';

type StoredProjectsEnvelope = {
  version: 2;
  projects: DiagramProject[];
};

export type LoadProjectsResult = {
  projects: DiagramProject[];
  skipInitialSave: boolean;
  warning: string | null;
  recoveryRaw: string | null;
};

export type SaveProjectsResult = {
  ok: boolean;
  error: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const collectionSize = (value: unknown): number =>
  Array.isArray(value) ? value.length : isRecord(value) ? Object.keys(value).length : 0;

const messageCount = (value: unknown): number => {
  if (Array.isArray(value)) return value.reduce((total, item) => total + messageCount(item), 0);
  if (!isRecord(value)) return 0;
  return (value.kind === 'message' ? 1 : 0) + Object.values(value).reduce<number>((total, item) => total + messageCount(item), 0);
};

const contentLost = (raw: unknown, normalized: unknown): boolean => {
  if (!isRecord(raw)) return false;
  const clean = isRecord(normalized) ? normalized : {};
  return ['nodes', 'edges', 'messages', 'participants'].some((key) => collectionSize(raw[key]) > collectionSize(clean[key]))
    || messageCount(raw.items) > messageCount(clean.items);
};

const projectLost = (raw: unknown, normalized: DiagramProject): boolean => {
  if (!isRecord(raw)) return true;
  if (!Array.isArray(raw.artifacts)) return contentLost(raw.content, normalized.artifacts[0]?.content);
  if (raw.artifacts.length > normalized.artifacts.length) return true;
  return raw.artifacts.some((artifact, index) => {
    if (!isRecord(artifact)) return true;
    const clean = normalized.artifacts.find((candidate) => candidate.id === artifact.id)
      ?? normalized.artifacts[index];
    return clean === undefined || clean.type !== artifact.type || contentLost(artifact.content, clean.content);
  });
};

const parseStoredProjects = (rawProjects: string): { projects: DiagramProject[]; loss: boolean } => {
  const parsed: unknown = JSON.parse(rawProjects);
  const raw = Array.isArray(parsed) ? parsed
    : isRecord(parsed) && parsed.version === 2 && Array.isArray(parsed.projects) ? parsed.projects : null;
  if (raw === null) throw new Error('Unrecognized storage format.');
  const readable = raw.flatMap((project) => {
    try {
      return [{ raw: project, project: normalizeDiagramProject(project) }];
    } catch {
      return [];
    }
  });
  const projects = readable.map((item) => item.project);
  return { projects, loss: projects.length < raw.length || readable.some((item) => projectLost(item.raw, item.project)) };
};

const RECOVERY_WARNING = 'No se pudo leer todo el trabajo guardado. El guardado está en pausa para proteger el original. Descargá una copia de seguridad antes de seguir.';

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
      recoveryRaw: null,
      warning: 'El almacenamiento local no está disponible. Los cambios de esta sesión no se guardarán.',
    };
  }

  const rawProjects = currentProjects ?? legacyProjects;

  if (rawProjects === null) {
    return { projects: [], skipInitialSave: false, warning: null, recoveryRaw: null };
  }

  try {
    const { projects, loss } = parseStoredProjects(rawProjects);
    return {
      projects,
      skipInitialSave: loss,
      warning: loss ? RECOVERY_WARNING : null,
      recoveryRaw: loss ? rawProjects : null,
    };
  } catch {
    return {
      projects: [],
      skipInitialSave: true,
      warning: RECOVERY_WARNING,
      recoveryRaw: rawProjects,
    };
  }
};

export const saveProjects = (projects: DiagramProject[]): SaveProjectsResult => {
  const payload: StoredProjectsEnvelope = { version: 2, projects };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return { ok: true, error: null };
  } catch {
    return {
      ok: false,
      error: 'No se pudieron guardar los cambios en este dispositivo. Exportá tu proyecto para conservar el trabajo.',
    };
  }
};
