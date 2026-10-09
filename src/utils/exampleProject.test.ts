import { describe, expect, it } from 'vitest';
import demo from '../../fixtures/demo-gestion-tramites.json';
import type { DesignArtifact, DiagramProject } from '../types/diagram';
import { EXAMPLE_PROJECT_NAME, createExampleProject, findExampleProject } from './exampleProject';

const artifactOfType = <T extends DesignArtifact['type']>(project: DiagramProject, type: T) =>
  project.artifacts.find((artifact): artifact is Extract<DesignArtifact, { type: T }> => artifact.type === type)!;

describe('createExampleProject', () => {
  it('copies the five artifacts of the fixture under the example name', () => {
    const project = createExampleProject();

    expect(project.name).toBe(EXAMPLE_PROJECT_NAME);
    expect(project.artifacts.map((artifact) => artifact.type).sort())
      .toEqual(demo.artifacts.map((artifact) => artifact.type).sort());
  });

  it('gives the project and every artifact new ids, not the fixture ids', () => {
    const project = createExampleProject();
    const fixtureIds = new Set([demo.id, ...demo.artifacts.map((artifact) => artifact.id)]);

    expect(fixtureIds.has(project.id)).toBe(false);
    project.artifacts.forEach((artifact) => expect(fixtureIds.has(artifact.id)).toBe(false));
    expect(new Set(project.artifacts.map((artifact) => artifact.id)).size).toBe(5);
    expect(project.artifacts.map((artifact) => artifact.id)).toContain(project.activeArtifactId);
  });

  it('creates a different copy each time', () => {
    const first = createExampleProject();
    const second = createExampleProject();

    expect(second.id).not.toBe(first.id);
    expect(second.artifacts.some((artifact) => first.artifacts.some((other) => other.id === artifact.id))).toBe(false);
  });

  it('points the links between artifacts at the copied artifacts', () => {
    const project = createExampleProject();
    const classDiagram = artifactOfType(project, 'class-diagram');
    const classSequence = artifactOfType(project, 'class-sequence-diagram');
    const flow = artifactOfType(project, 'use-case-flow');
    const sequence = artifactOfType(project, 'sequence-diagram');

    expect(flow.content.classDiagramArtifactId).toBe(classDiagram.id);
    expect(classSequence.content.sourceClassDiagramArtifactId).toBe(classDiagram.id);
    expect(classSequence.content.linkedSequenceDiagramIds).toEqual([sequence.id]);
    // The fixture stores the sequence's model link as "cd"; it is normalized to the sequence model.
    expect(sequence.content.classDiagramArtifactId).toBe(classSequence.id);
    expect(sequence.content.flowArtifactId).toBe(flow.id);
  });
});

describe('findExampleProject', () => {
  it('finds the example copy by name and ignores other projects', () => {
    const example = createExampleProject();
    const other = { ...createExampleProject(), name: 'Otro proyecto' };

    expect(findExampleProject([other, example])).toBe(example);
    expect(findExampleProject([other])).toBeUndefined();
  });
});
