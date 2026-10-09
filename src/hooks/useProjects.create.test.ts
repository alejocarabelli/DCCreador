import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARTIFACT_TYPES } from '../constants/artifactTypes';
import { createMemoryStorage, runtime, stubBrowser } from './testHookHarness';
import { normalizeDiagramProject } from '../utils/diagramNormalization';
import { createEmptySequenceDiagramContent } from '../utils/sequenceDiagram';
import type { ClassSequenceDiagramArtifact, DesignArtifact, DiagramProject, SequenceDiagramArtifact } from '../types/diagram';

vi.mock('react', async () => (await import('./testHookHarness')).runtime.api);
const { buildProject, useProjects } = await import('./useProjects');
const hookUnderTest = useProjects;
const renderHook = () => { runtime.begin(); return hookUnderTest(); };

beforeEach(() => {
  vi.useFakeTimers();
  runtime.reset();
  stubBrowser();
  vi.stubGlobal('localStorage', createMemoryStorage());
});
afterEach(() => { runtime.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const expectInitialArtifact = (project: DiagramProject, type: DesignArtifact['type'], name: string) => {
  expect(project.artifacts).toHaveLength(1);
  const artifact = project.artifacts[0];
  expect(artifact).toMatchObject({ type, name });
  expect(project.activeArtifactId).toBe(artifact.id);
  expect(normalizeDiagramProject(project).artifacts).toHaveLength(1);
  if (artifact.type === 'use-case-flow') {
    expect(artifact.content).toMatchObject({
      description: { useCaseNumber: '', useCaseName: '', actor: '', priority: 'A' },
      basicFlow: [], alternativeFlows: [],
    });
    expect(artifact.content.classDiagramArtifactId).toBeUndefined();
  } else if (artifact.type === 'sequence-diagram') {
    expect(artifact.content).toEqual(createEmptySequenceDiagramContent());
  } else if (artifact.type === 'class-sequence-diagram') {
    expect(artifact.content).toMatchObject({ version: 1, nodes: [], edges: [], linkedSequenceDiagramIds: [] });
    expect(artifact.content.sourceClassDiagramArtifactId).toBeUndefined();
  } else {
    expect(artifact.content).toEqual({ nodes: [], edges: [] });
  }
};

describe('primer artefacto del proyecto', () => {
  it.each(ARTIFACT_TYPES)('buildProject empieza con $label', ({ id, label }) => {
    const project = buildProject('Sistema de turnos', id);
    expect(project.name).toBe('Sistema de turnos');
    expectInitialArtifact(project, id, label);
  });

  it.each(ARTIFACT_TYPES)('createProject crea y abre $label', ({ id, label }) => {
    renderHook().createProject('  Sistema de turnos  ', id);
    const hook = renderHook();
    expect(hook.projects).toHaveLength(1);
    expect(hook.activeProject).toBe(hook.projects[0]);
    expect(hook.activeProjectId).toBe(hook.projects[0].id);
    expect(hook.activeProject?.name).toBe('Sistema de turnos');
    expectInitialArtifact(hook.projects[0], id, label);
  });

  it('empieza con casos de uso por defecto y conserva el nombre de respaldo', () => {
    expect(buildProject('Proyecto').artifacts[0].type).toBe('use-case-model');
    renderHook().createProject('   ');
    expect(renderHook().activeProject?.name).toBe('Nuevo proyecto');
    expect(renderHook().activeProject?.artifacts[0].type).toBe('use-case-model');
  });

  it.each(['sequence-diagram', 'class-sequence-diagram'] as const)(
    'conserva los vínculos al empezar con %s y agregar el otro artefacto', (firstType) => {
      renderHook().createProject('Proyecto', firstType);
      const id = renderHook().activeProjectId!;
      if (firstType === 'sequence-diagram') renderHook().createClassSequenceDiagramArtifact(id, 'Clases');
      else renderHook().createSequenceDiagramArtifact(id, 'Secuencia');
      const project = renderHook().activeProject!;
      const sequence = project.artifacts.find((a) => a.type === 'sequence-diagram') as SequenceDiagramArtifact;
      const model = project.artifacts.find((a) => a.type === 'class-sequence-diagram') as ClassSequenceDiagramArtifact;
      expect(sequence.content.classDiagramArtifactId).toBe(model.id);
      expect(model.content.linkedSequenceDiagramIds).toEqual([sequence.id]);
      expect(project.activeArtifactId).toBe(project.artifacts[1].id);

      renderHook().createClassSequenceDiagramArtifact(id, 'Otro modelo');
      const after = renderHook().activeProject!;
      expect((after.artifacts[2] as ClassSequenceDiagramArtifact).content.linkedSequenceDiagramIds).toEqual([]);
      expect((after.artifacts.find((a) => a.id === sequence.id) as SequenceDiagramArtifact).content.classDiagramArtifactId).toBe(model.id);
    },
  );

  it('conserva el contenido inicial al crear una secuencia desde una plantilla', () => {
    renderHook().createProject('Proyecto');
    const initialContent = { ...createEmptySequenceDiagramContent(), showActivations: false };
    renderHook().createSequenceDiagramArtifact(renderHook().activeProjectId!, 'Consulta', initialContent);
    const sequence = renderHook().activeProject!.artifacts[1] as SequenceDiagramArtifact;
    expect(sequence.name).toBe('Consulta');
    expect(sequence.content.showActivations).toBe(false);
  });
});
