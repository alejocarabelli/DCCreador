import { describe, expect, it } from 'vitest';
import demo from '../../fixtures/demo-gestion-tramites.json';
import { extractImportableProjects } from './projectImport';

describe('extractImportableProjects', () => {
  const second = { ...demo, id: 'otro-proyecto', name: 'Otro proyecto' };

  it('reads a single exported project', () => {
    expect(extractImportableProjects(demo)).toHaveLength(1);
  });

  it('reads every project of a backup of the first version', () => {
    const backup = { version: 2, projects: [demo, second] };
    expect(extractImportableProjects(backup)?.map((project) => project.name)).toEqual([demo.name, 'Otro proyecto']);
  });

  it('reads a plain array of projects and ignores entries that are not projects', () => {
    expect(extractImportableProjects([demo, { nope: true }, second])).toHaveLength(2);
  });

  it('returns null when a file holds no project', () => {
    expect(extractImportableProjects({ version: 2, projects: [] })).toBeNull();
    expect(extractImportableProjects({ hello: 'world' })).toBeNull();
    expect(extractImportableProjects('texto')).toBeNull();
  });
});
