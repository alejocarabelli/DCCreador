import type { ArtifactNotebook, DesignArtifact } from '../types/diagram';
import { createEmptySequenceDiagramContent, normalizeSequenceDiagramContent } from './sequenceDiagram';
import { normalizeUseCaseFlowContent } from './diagramNormalization';

/** Sentinel that must never leak into an export that is not the JSON file. */
export const NOTEBOOK_SENTINEL = 'SENTINELA-APUNTE-PRIVADO';

export const sampleNotebook = (): ArtifactNotebook => ({
  version: 1,
  blocks: [
    { id: 'b-text', kind: 'text', text: `Idea suelta ${NOTEBOOK_SENTINEL}\nsegunda línea` },
    { id: 'b-open', kind: 'question', text: '¿Falta la clase Pedido?', resolved: false },
    { id: 'b-done', kind: 'question', text: '¿El actor es Cliente?', resolved: true },
    {
      id: 'b-sketch',
      kind: 'sketch',
      height: 900,
      shapes: [
        { id: 's-pen', kind: 'pen', color: 'ink', points: [10, 10, 50, 40, 120, 40] },
        { id: 's-arrow', kind: 'arrow', color: 'accent', x1: 100, y1: 100, x2: 300, y2: 200 },
        { id: 's-rect', kind: 'rect', color: 'red', x: 20, y: 30, w: 200, h: 120 },
        { id: 's-text', kind: 'text', color: 'accent', x: 400, y: 80, text: 'revisar' },
        { id: 's-pen-red', kind: 'pen', color: 'red', points: [500, 500] },
        { id: 's-arrow-ink', kind: 'arrow', color: 'ink', x1: 0, y1: 0, x2: 10, y2: 10 },
        { id: 's-rect-ink', kind: 'rect', color: 'ink', x: 5, y: 5, w: 15, h: 25 },
        { id: 's-text-red', kind: 'text', color: 'red', x: 1, y: 2, text: 'ojo' },
      ],
    },
  ],
});

const dates = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' };

/** One artifact per type, each carrying its own copy of the sample notebook. */
export const artifactsWithNotebook = (): DesignArtifact[] => [
  { ...dates, id: 'cd', type: 'class-diagram', name: 'Clases', notebook: sampleNotebook(), content: { nodes: [], edges: [] } },
  {
    ...dates, id: 'cs', type: 'class-sequence-diagram', name: 'Clases de secuencias', notebook: sampleNotebook(),
    content: { nodes: [], edges: [], version: 1, linkedSequenceDiagramIds: [] },
  },
  { ...dates, id: 'um', type: 'use-case-model', name: 'Casos de uso', notebook: sampleNotebook(), content: { nodes: [], edges: [] } },
  {
    ...dates, id: 'uf', type: 'use-case-flow', name: 'Flujo', notebook: sampleNotebook(),
    content: normalizeUseCaseFlowContent(undefined),
  },
  {
    ...dates, id: 'sd', type: 'sequence-diagram', name: 'Secuencia', notebook: sampleNotebook(),
    content: normalizeSequenceDiagramContent(createEmptySequenceDiagramContent()),
  },
];
