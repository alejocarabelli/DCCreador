import demoFixture from '../../fixtures/demo-gestion-tramites.json';
import type { DiagramProject } from '../types/diagram';
import { normalizeDiagramProject } from './diagramNormalization';
import { isImportableProject } from './projectImport';
import { copyProject } from './projectRecovery';

/** Name of the example copy in the project list; Inicio also uses it to find that copy again. */
export const EXAMPLE_PROJECT_NAME = 'Ejemplo: Gestión de Trámites';

/**
 * A new, independent copy of the example: fresh project and artifact ids, with the
 * links between its five artifacts remapped to them. Importing the fixture as-is
 * would keep its ids, so a second copy would collide with the first.
 */
export const createExampleProject = (): DiagramProject => {
  if (!isImportableProject(demoFixture)) throw new Error('El proyecto de ejemplo no tiene la estructura de un proyecto.');
  return copyProject(normalizeDiagramProject(demoFixture), EXAMPLE_PROJECT_NAME);
};

export const findExampleProject = (projects: DiagramProject[]): DiagramProject | undefined =>
  projects.find((project) => project.name === EXAMPLE_PROJECT_NAME);
