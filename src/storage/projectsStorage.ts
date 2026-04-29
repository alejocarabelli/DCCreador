import type { DiagramProject } from '../types/diagram';
import { normalizeDiagramProject } from '../utils/diagramNormalization';

const STORAGE_KEY = 'class-diagram-projects:v1';

export const loadProjects = (): DiagramProject[] => {
  const rawProjects = localStorage.getItem(STORAGE_KEY);

  if (rawProjects === null) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawProjects);
    return Array.isArray(parsed) ? (parsed as DiagramProject[]).map(normalizeDiagramProject) : [];
  } catch {
    return [];
  }
};

export const saveProjects = (projects: DiagramProject[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
};
