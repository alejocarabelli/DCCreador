import type { DesignProject } from '../types/diagram';
import { normalizeDiagramProject } from './diagramNormalization';

/**
 * The one way to save a project as JSON. It writes the normalized project —
 * the same format the importer reads and the v1 app exports — so a file moves
 * between v1 and v2 in both directions.
 */
export const serializeProject = (project: DesignProject): string =>
  JSON.stringify(normalizeDiagramProject(project), null, 2);

export const projectFileName = (project: Pick<DesignProject, 'name'>): string =>
  `${project.name.trim() || 'proyecto'}.json`;

export const downloadProjectFile = (project: DesignProject): void => {
  const url = URL.createObjectURL(new Blob([serializeProject(project)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = projectFileName(project);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
