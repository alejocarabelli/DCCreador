import { describe, expect, it } from 'vitest';
import { MAX_BLOCKS, MAX_TEXT_LENGTH, createNotebookBlock, normalizeArtifactNotebook } from './artifactNotebook';
import { changeText, toNotebook } from '../components/notebook/notebookBlocks';
import { normalizeDiagramProject } from './diagramNormalization';

const reload = (notebook: unknown) => {
  const project = normalizeDiagramProject({
    id: 'p', name: 'P', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    activeArtifactId: 'a',
    artifacts: [{
      id: 'a', type: 'use-case-model', name: 'Casos', createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z', content: { nodes: [], edges: [] }, notebook,
    }],
  } as never);
  return JSON.parse(JSON.stringify(project)) as typeof project;
};

describe('A1: apuntes con más de los límites', () => {
  it('un bloque de texto de 20.003 caracteres sobrevive a guardar y recargar', () => {
    const text = 'a'.repeat(MAX_TEXT_LENGTH + 3);
    const block = { ...createNotebookBlock('text'), id: 't1' };
    const edit = changeText([block], 't1', text, text.length);
    const stored = toNotebook(edit.blocks);

    const reloaded = normalizeArtifactNotebook(JSON.parse(JSON.stringify(stored)));
    const first = reloaded?.blocks[0];
    expect(first?.kind === 'text' ? first.text.length : -1).toBe(text.length);
  });

  it('501 bloques sobreviven a guardar y recargar', () => {
    const blocks = Array.from({ length: MAX_BLOCKS + 1 }, (_, i) => ({ ...createNotebookBlock('text'), id: `b${i}`, text: `nota ${i}` }));
    const stored = toNotebook(blocks);

    const reloaded = normalizeArtifactNotebook(JSON.parse(JSON.stringify(stored)));
    expect(reloaded?.blocks).toHaveLength(MAX_BLOCKS + 1);
  });

  it('control: un apunte dentro de los límites se conserva tal cual', () => {
    const block = { ...createNotebookBlock('text'), id: 't1' };
    const stored = toNotebook(changeText([block], 't1', 'hola', 4).blocks);
    const reloaded = normalizeArtifactNotebook(JSON.parse(JSON.stringify(stored)));
    expect(reloaded?.blocks[0]).toEqual({ id: 't1', kind: 'text', text: 'hola' });
    expect(reload(stored).artifacts[0].notebook).toEqual(stored);
  });
});
