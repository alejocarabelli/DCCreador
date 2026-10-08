import { beforeEach, describe, expect, it, vi } from 'vitest';
import demo from '../../fixtures/demo-gestion-tramites.json';
import type { DesignArtifact, DiagramProject, UseCaseFlowArtifact, SequenceDiagramArtifact } from '../types/diagram';
import diagramImageExportSource from './diagramImageExport.ts?raw';
import flowDocumentSource from './flowDocument.ts?raw';
import flowExportDocxSource from './flowExportDocx.ts?raw';
import flowExportPdfSource from './flowExportPdf.ts?raw';
import pdfExportSource from './pdfExport.ts?raw';
import sequenceDiagramExportSource from './sequenceDiagramExport.ts?raw';
import { loadProjects, saveProjects } from '../storage/projectsStorage';
import { writeBackup } from '../storage/backup';
import { extractImportableArtifacts, serializeArtifact } from './artifactFile';
import { importArtifactIntoProjects, moveArtifactsBetweenProjects } from './artifactTransfer';
import { normalizeArtifact, normalizeDiagramProject } from './diagramNormalization';
import { buildFlowDocument } from './flowDocument';
import { buildFlowDocumentXml } from './flowExportDocx';
import { extractImportableProjects, isImportableProject } from './projectImport';
import { serializeProject } from './projectFile';
import { buildSequenceLayout } from './sequenceDiagramLayout';
import { buildSequencePdfPlan, getSequenceExportBounds } from './sequenceDiagramExport';
import { NOTEBOOK_SENTINEL, artifactsWithNotebook, sampleNotebook } from './notebookTestData';

const dates = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' };
const project = (id: string, artifacts: DesignArtifact[]): DiagramProject => ({ ...dates, id, name: id, activeArtifactId: artifacts[0].id, artifacts });
const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

describe('notebook normalization round trip', () => {
  it.each(artifactsWithNotebook().map((artifact) => [artifact.type, artifact] as const))('%s keeps its notebook through normalizeArtifact', (_, artifact) => {
    expect(normalizeArtifact(artifact, dates)).toEqual(artifact);
    expect(normalizeArtifact(roundTrip(artifact), dates)).toEqual(artifact);
    expect(normalizeArtifact(normalizeArtifact(artifact, dates), dates)).toEqual(artifact);
  });

  it('keeps every notebook through normalizeDiagramProject and a JSON cycle', () => {
    const original = project('p', artifactsWithNotebook());
    const normalized = normalizeDiagramProject(original);
    expect(normalized.artifacts.map((artifact) => artifact.notebook)).toEqual(original.artifacts.map(() => sampleNotebook()));
    expect(normalizeDiagramProject(roundTrip(normalized))).toEqual(normalized);
  });

  it('drops a broken notebook instead of failing the artifact', () => {
    const [artifact] = artifactsWithNotebook();
    const broken = { ...artifact, notebook: { version: 1, blocks: [{ kind: 'nope' }] } };
    const result = normalizeArtifact(broken, dates);
    expect(result).not.toBeNull();
    expect(result && 'notebook' in result).toBe(false);
  });

  it('leaves projects without notes exactly as they were', () => {
    const normalized = normalizeDiagramProject(demo as unknown as Parameters<typeof normalizeDiagramProject>[0]);
    for (const artifact of normalized.artifacts) {
      expect('notebook' in artifact).toBe(false);
      expect(Object.keys(artifact)).toEqual(['id', 'type', 'name', 'createdAt', 'updatedAt', 'content']);
    }
    expect(JSON.stringify(normalized)).not.toContain('notebook');
    expect(normalizeDiagramProject(roundTrip(normalized))).toEqual(normalized);
  });
});

describe('notebook in JSON files', () => {
  it('project file export/import keeps the notes', () => {
    const original = normalizeDiagramProject(project('p', artifactsWithNotebook()));
    const parsed = JSON.parse(serializeProject(original)) as unknown;
    expect(isImportableProject(parsed)).toBe(true);
    expect(extractImportableProjects(parsed)).toHaveLength(1);
    expect(normalizeDiagramProject(parsed as DiagramProject)).toEqual(original);
    expect(serializeProject(original)).toContain(NOTEBOOK_SENTINEL);
  });

  it.each(artifactsWithNotebook().map((artifact) => [artifact.type, artifact] as const))('artifact file export/import keeps the notes of %s', (_, artifact) => {
    const text = serializeArtifact(artifact);
    expect(text).toContain(NOTEBOOK_SENTINEL);
    const [imported] = extractImportableArtifacts(JSON.parse(text)) ?? [];
    expect(imported.notebook).toEqual(sampleNotebook());
  });

  it('importing an exported project artifact by artifact keeps the notes', () => {
    const exported = JSON.parse(serializeProject(normalizeDiagramProject(project('p', artifactsWithNotebook())))) as unknown;
    const imported = extractImportableArtifacts(exported) ?? [];
    expect(imported).toHaveLength(5);
    expect(imported.every((artifact) => artifact.notebook !== undefined)).toBe(true);
  });
});

describe('notebook when artifacts move between projects', () => {
  const [model, , , flow, sequence] = artifactsWithNotebook();
  const source = project('source', [model, flow, sequence]);
  const destination = project('destination', [{ ...model, id: 'other', notebook: undefined }]);

  it('importing an artifact into a project keeps the notes', () => {
    const [result] = importArtifactIntoProjects([destination], destination.id, flow);
    expect(result.artifacts.at(-1)?.notebook).toEqual(sampleNotebook());
  });

  it('moving artifacts, linked or not, keeps the notes', () => {
    const single = moveArtifactsBetweenProjects([source, destination], 'source', 'destination', model.id, false);
    expect(single.projects[1].artifacts.find((artifact) => artifact.id === model.id)?.notebook).toEqual(sampleNotebook());

    const linked = moveArtifactsBetweenProjects([source, destination], 'source', 'destination', sequence.id, true);
    const moved = linked.projects[1].artifacts.filter((artifact) => artifact.id !== 'other');
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.every((artifact) => artifact.notebook !== undefined)).toBe(true);
  });

  it('keeps the notes of the artifacts that stay behind', () => {
    const { projects } = moveArtifactsBetweenProjects([source, destination], 'source', 'destination', model.id, false);
    expect(projects[0].artifacts.every((artifact) => artifact.notebook !== undefined)).toBe(true);
  });
});

describe('notebook in storage and backups', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  it('survives saveProjects and loadProjects', () => {
    const projects = [normalizeDiagramProject(project('p', artifactsWithNotebook()))];
    expect(saveProjects(projects).ok).toBe(true);
    const loaded = loadProjects();
    expect(loaded.warning).toBeNull();
    expect(loaded.projects).toEqual(projects);
    expect(loaded.projects[0].artifacts.map((artifact) => artifact.notebook)).toEqual(projects[0].artifacts.map(() => sampleNotebook()));
  });

  it('is part of the automatic backup payload', async () => {
    const postMessage = vi.fn().mockResolvedValue({ path: '/tmp/respaldo.json', directory: '/tmp' });
    vi.stubGlobal('window', { __modeladorNativeBackup: true, __modeladorBridges: { backup: { postMessage } } });
    const projects = [normalizeDiagramProject(project('p', artifactsWithNotebook()))];
    const result = await writeBackup(projects);
    vi.unstubAllGlobals();
    expect(result.error).toBeNull();
    const payload = JSON.parse((postMessage.mock.calls[0][0] as { payload: string }).payload) as { projects: DiagramProject[] };
    expect(payload.projects).toEqual(projects);
    expect(extractImportableProjects(payload)).toHaveLength(1);
  });
});

describe('notebook stays out of every non-JSON export', () => {
  it('does not reach the Word/PDF flow document', () => {
    const flow = artifactsWithNotebook().find((artifact): artifact is UseCaseFlowArtifact => artifact.type === 'use-case-flow');
    expect(flow?.notebook).toBeDefined();
    const withoutNotes = { ...flow! };
    delete withoutNotes.notebook;
    const document = buildFlowDocument(flow!.content, flow!.name, { classes: [] });
    expect(JSON.stringify(document)).not.toContain(NOTEBOOK_SENTINEL);
    expect(buildFlowDocumentXml(document)).not.toContain(NOTEBOOK_SENTINEL);
    expect(document).toEqual(buildFlowDocument(withoutNotes.content, withoutNotes.name, { classes: [] }));
  });

  it('does not reach the sequence diagram layout or PDF plan', () => {
    const sequence = artifactsWithNotebook().find((artifact): artifact is SequenceDiagramArtifact => artifact.type === 'sequence-diagram')!;
    const layout = buildSequenceLayout(sequence.content);
    const plan = buildSequencePdfPlan(sequence.content, layout);
    expect(JSON.stringify({ layout, plan, bounds: getSequenceExportBounds(layout) })).not.toContain(NOTEBOOK_SENTINEL);
  });

  it('is not referenced by any export module', () => {
    const modules = { diagramImageExportSource, flowDocumentSource, flowExportDocxSource, flowExportPdfSource, pdfExportSource, sequenceDiagramExportSource };
    for (const [name, source] of Object.entries(modules)) {
      expect(source, name).not.toMatch(/notebook/i);
    }
  });
});
