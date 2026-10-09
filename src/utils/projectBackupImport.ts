import type { DiagramProject } from '../types/diagram';
import { extractImportableProjects, isImportableProject } from './projectImport';
import type { ProjectImportCounts } from './projectRecovery';

export type BackupImportResult = ProjectImportCounts & { unreadable: number };

export const importProjectFiles = async (
  files: Pick<File, 'text'>[],
  importProject: (project: DiagramProject) => void,
  importProjects: (projects: DiagramProject[]) => ProjectImportCounts,
): Promise<BackupImportResult> => {
  const found: DiagramProject[] = [];
  let singleProject = false;
  let unreadable = 0;
  for (const file of files) {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const projects = extractImportableProjects(parsed);
      if (projects === null) unreadable += 1;
      else {
        found.push(...projects);
        singleProject = files.length === 1 && isImportableProject(parsed);
      }
    } catch {
      unreadable += 1;
    }
  }
  if (singleProject && found.length === 1) {
    importProject(found[0]);
    return { imported: 1, recovered: 0, skipped: 0, unreadable };
  }
  const counts = found.length > 0 ? importProjects(found) : { imported: 0, recovered: 0, skipped: 0 };
  return { ...counts, unreadable };
};

export const projectImportFeedback = ({ imported, recovered, skipped, unreadable }: BackupImportResult): { tone: 'success' | 'error'; message: string } => ({
  tone: unreadable > 0 ? 'error' : 'success',
  message: [
    `${imported} ${imported === 1 ? 'proyecto importado' : 'proyectos importados'}`,
    `${recovered} ${recovered === 1 ? 'recuperado como copia' : 'recuperados como copia'}`,
    `${skipped} ${skipped === 1 ? 'omitido por ser idéntico' : 'omitidos por ser idénticos'}`,
    `${unreadable} ${unreadable === 1 ? 'archivo ilegible' : 'archivos ilegibles'}`,
  ].join('; ') + '.',
});
