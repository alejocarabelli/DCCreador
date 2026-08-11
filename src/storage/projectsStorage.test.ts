import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadProjects, saveProjects } from './projectsStorage';

const createMemoryStorage = () => {
  const values = new Map<string, string>();

  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage;
};

describe('projects storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  it('loads legacy project arrays and saves the versioned envelope', () => {
    localStorage.setItem('class-diagram-projects:v1', JSON.stringify([{
      id: 'legacy', name: 'Anterior', createdAt: '', updatedAt: '', content: { nodes: [], edges: [] },
    }]));

    const loaded = loadProjects();
    expect(loaded.warning).toBeNull();
    expect(loaded.projects[0].artifacts[0].type).toBe('class-diagram');

    expect(saveProjects(loaded.projects).ok).toBe(true);
    expect(JSON.parse(localStorage.getItem('design-projects:v2') ?? '{}').version).toBe(2);
  });

  it('preserves corrupt data and prevents the initial empty overwrite', () => {
    localStorage.setItem('design-projects:v2', '{not valid json');

    const loaded = loadProjects();

    expect(loaded.projects).toEqual([]);
    expect(loaded.skipInitialSave).toBe(true);
    expect(loaded.warning).toContain('recuperación');
    expect([...Array(localStorage.length).keys()].map((index) => localStorage.key(index)))
      .toContainEqual(expect.stringContaining('design-projects:recovery:'));
  });
});
