import type { DesignProject } from '../types/diagram';
import { normalizeDiagramProject } from './diagramNormalization';
import { reportSaveFailure, saveBlob, type SaveOutcome } from './saveFile';

/**
 * The one way to save a project as JSON. It writes the normalized project —
 * the same format the importer reads and the v1 app exports — so a file moves
 * between v1 and v2 in both directions.
 */
export const serializeProject = (project: DesignProject): string =>
  JSON.stringify(normalizeDiagramProject(project), null, 2);

export const projectFileName = (project: Pick<DesignProject, 'name'>): string =>
  `${project.name.trim() || 'proyecto'}.json`;

export const downloadProjectFile = async (project: DesignProject): Promise<SaveOutcome> =>
  reportSaveFailure(await saveBlob(new Blob([serializeProject(project)], { type: 'application/json' }), projectFileName(project)));
