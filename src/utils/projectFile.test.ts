import { describe, expect, it } from 'vitest';
import demo from '../../fixtures/demo-gestion-tramites.json';
import { normalizeDiagramProject } from './diagramNormalization';
import { isImportableProject } from './projectImport';
import { projectFileName, serializeProject } from './projectFile';

/**
 * v1 and v2 exchange projects as JSON files. v1 wrote
 * `JSON.stringify(normalizeDiagramProject(project), null, 2)` and imported with
 * `isImportableProject` + `normalizeDiagramProject`; these tests pin v2 to the
 * same contract in both directions.
 */
describe('project file', () => {
  const project = normalizeDiagramProject(demo as unknown as Parameters<typeof normalizeDiagramProject>[0]);

  it('writes exactly what v1 wrote', () => {
    expect(serializeProject(project)).toBe(JSON.stringify(normalizeDiagramProject(project), null, 2));
  });

  it('reads back what it writes, without losing anything', () => {
    const parsed = JSON.parse(serializeProject(project)) as unknown;
    expect(isImportableProject(parsed)).toBe(true);
    expect(normalizeDiagramProject(parsed as typeof project)).toEqual(project);
  });

  it('is stable across repeated round trips', () => {
    const once = serializeProject(project);
    const twice = serializeProject(normalizeDiagramProject(JSON.parse(once) as typeof project));
    expect(twice).toBe(once);
  });

  it('keeps every artifact type of the demo project', () => {
    const types = new Set(project.artifacts.map((artifact) => artifact.type));
    expect(types).toEqual(new Set(['use-case-model', 'use-case-flow', 'sequence-diagram', 'class-diagram', 'class-sequence-diagram']));
  });

  it('names the file after the project', () => {
    expect(projectFileName({ name: '  ' })).toBe('proyecto.json');
    expect(projectFileName({ name: 'Gestión de trámites' })).toBe('Gestión de trámites.json');
  });
});
