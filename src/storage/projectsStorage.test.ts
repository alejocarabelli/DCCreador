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

  it('distinguishes inaccessible storage from data waiting for preservation', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('unavailable'); });
    const loaded = loadProjects();
    expect(loaded.storageUnavailable).toBe(true);
    expect(loaded.recoveryRaw).toBeNull();
    expect(loaded.warning).toBe('No se pudo abrir el almacenamiento de la app. Tus cambios de esta sesión se guardan solo en los respaldos de Documentos.');
  });

  it('preserves corrupt data and prevents the initial empty overwrite', () => {
    localStorage.setItem('design-projects:v2', '{not valid json');

    const loaded = loadProjects();

    expect(loaded.projects).toEqual([]);
    expect(loaded.skipInitialSave).toBe(true);
    expect(loaded.warning).toContain('original');
    expect(loaded.recoveryRaw).toBe('{not valid json');
    expect([...Array(localStorage.length).keys()].map((index) => localStorage.key(index)))
      .toEqual(['design-projects:v2']);
  });
});
