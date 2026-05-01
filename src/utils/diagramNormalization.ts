import type {
  ClassDiagramArtifact,
  ClassDiagramContent,
  ClassDiagramEdge,
  ClassDiagramNode,
  DesignArtifact,
  DiagramProject,
  LegacyDiagramProject,
  UseCaseEdgeData,
  UseCaseModelArtifact,
  UseCaseModelContent,
  UseCaseModelEdge,
  UseCaseModelNode,
} from '../types/diagram';
import { normalizeAssociationEdge } from './association';

const DEFAULT_CLASS_ARTIFACT_ID = 'default-class-diagram';
const DEFAULT_USE_CASE_ARTIFACT_ID = 'default-use-case-model';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const normalizeClassNode = (node: ClassDiagramNode): ClassDiagramNode => ({
  ...node,
  type: 'classNode',
  data: {
    ...node.data,
    name: node.data?.name ?? '',
    attributes: Array.isArray(node.data?.attributes) ? node.data.attributes : [],
    methods: Array.isArray(node.data?.methods) ? node.data.methods : [],
    hasParametricValuesNote: node.data?.hasParametricValuesNote ?? false,
    parametricValuesNoteHandle: node.data?.parametricValuesNoteHandle ?? 'bottom',
    parametricValuesNoteTargetHandle: node.data?.parametricValuesNoteTargetHandle ?? 'top',
    parametricValuesNotePosition: node.data?.parametricValuesNotePosition,
    parametricValues: Array.isArray(node.data?.parametricValues) ? node.data.parametricValues : [],
  },
});

export const normalizeDiagramContent = (
  content: Partial<ClassDiagramContent> | undefined,
): ClassDiagramContent => ({
  nodes: Array.isArray(content?.nodes) ? (content.nodes as ClassDiagramNode[]).map(normalizeClassNode) : [],
  edges: Array.isArray(content?.edges) ? (content.edges as ClassDiagramEdge[]).map(normalizeAssociationEdge) : [],
});

export const normalizeUseCaseNode = (node: UseCaseModelNode): UseCaseModelNode => {
  const kind = node.data?.kind ?? (node.type === 'useCaseActor' ? 'actor' : node.type === 'systemBoundary' ? 'system-boundary' : 'use-case');
  const type = kind === 'actor' ? 'useCaseActor' : kind === 'system-boundary' ? 'systemBoundary' : 'useCaseOval';

  return {
    ...node,
    type,
    data: {
      ...node.data,
      kind,
      name: node.data?.name ?? '',
    },
    style: {
      ...node.style,
      width: kind === 'system-boundary' ? node.style?.width ?? node.width ?? 420 : node.style?.width,
      height: kind === 'system-boundary' ? node.style?.height ?? node.height ?? 300 : node.style?.height,
    },
  };
};

export const normalizeUseCaseEdge = (edge: UseCaseModelEdge): UseCaseModelEdge => ({
  ...edge,
  type: 'useCaseRelation',
  data: {
    relationType: edge.data?.relationType ?? 'association',
    label: edge.data?.label ?? '',
  } satisfies UseCaseEdgeData,
});

export const normalizeUseCaseModelContent = (
  content: Partial<UseCaseModelContent> | undefined,
): UseCaseModelContent => ({
  nodes: Array.isArray(content?.nodes) ? (content.nodes as UseCaseModelNode[]).map(normalizeUseCaseNode) : [],
  edges: Array.isArray(content?.edges) ? (content.edges as UseCaseModelEdge[]).map(normalizeUseCaseEdge) : [],
});

const normalizeClassDiagramArtifact = (
  artifact: Partial<ClassDiagramArtifact> | undefined,
  fallbackDates: Pick<DiagramProject, 'createdAt' | 'updatedAt'>,
): ClassDiagramArtifact => ({
  id: typeof artifact?.id === 'string' && artifact.id.length > 0 ? artifact.id : DEFAULT_CLASS_ARTIFACT_ID,
  type: 'class-diagram',
  name: typeof artifact?.name === 'string' && artifact.name.length > 0 ? artifact.name : 'Diagrama de clases',
  createdAt: typeof artifact?.createdAt === 'string' ? artifact.createdAt : fallbackDates.createdAt,
  updatedAt: typeof artifact?.updatedAt === 'string' ? artifact.updatedAt : fallbackDates.updatedAt,
  content: normalizeDiagramContent(artifact?.content),
});

const normalizeUseCaseModelArtifact = (
  artifact: Partial<UseCaseModelArtifact> | undefined,
  fallbackDates: Pick<DiagramProject, 'createdAt' | 'updatedAt'>,
): UseCaseModelArtifact => ({
  id: typeof artifact?.id === 'string' && artifact.id.length > 0 ? artifact.id : DEFAULT_USE_CASE_ARTIFACT_ID,
  type: 'use-case-model',
  name: typeof artifact?.name === 'string' && artifact.name.length > 0 ? artifact.name : 'Modelo de casos de uso',
  createdAt: typeof artifact?.createdAt === 'string' ? artifact.createdAt : fallbackDates.createdAt,
  updatedAt: typeof artifact?.updatedAt === 'string' ? artifact.updatedAt : fallbackDates.updatedAt,
  content: normalizeUseCaseModelContent(artifact?.content),
});

const normalizeArtifact = (
  artifact: unknown,
  fallbackDates: Pick<DiagramProject, 'createdAt' | 'updatedAt'>,
): DesignArtifact | null => {
  if (!isRecord(artifact)) {
    return null;
  }

  if (artifact.type === 'class-diagram') {
    return normalizeClassDiagramArtifact(artifact as Partial<ClassDiagramArtifact>, fallbackDates);
  }

  if (artifact.type === 'use-case-model') {
    return normalizeUseCaseModelArtifact(artifact as Partial<UseCaseModelArtifact>, fallbackDates);
  }

  return null;
};

const isLegacyProject = (project: unknown): project is Partial<LegacyDiagramProject> =>
  isRecord(project) && isRecord(project.content) && !Array.isArray(project.artifacts);

export const normalizeDiagramProject = (project: Partial<DiagramProject> | Partial<LegacyDiagramProject>): DiagramProject => {
  const now = new Date().toISOString();
  const id = typeof project.id === 'string' && project.id.length > 0 ? project.id : '';
  const name = typeof project.name === 'string' && project.name.length > 0 ? project.name : 'Nuevo diagrama';
  const createdAt = typeof project.createdAt === 'string' ? project.createdAt : now;
  const updatedAt = typeof project.updatedAt === 'string' ? project.updatedAt : now;

  if (isLegacyProject(project)) {
    const artifact = normalizeClassDiagramArtifact(
      {
        id: DEFAULT_CLASS_ARTIFACT_ID,
        type: 'class-diagram',
        name: 'Diagrama de clases',
        createdAt,
        updatedAt,
        content: project.content,
      },
      { createdAt, updatedAt },
    );

    return {
      id,
      name,
      createdAt,
      updatedAt,
      activeArtifactId: artifact.id,
      artifacts: [artifact],
    };
  }

  const normalizedArtifacts = Array.isArray(project.artifacts)
    ? project.artifacts
        .map((artifact) => normalizeArtifact(artifact, { createdAt, updatedAt }))
        .filter((artifact): artifact is DesignArtifact => artifact !== null)
    : [];

  const artifacts =
    normalizedArtifacts.length > 0
      ? normalizedArtifacts
      : [normalizeClassDiagramArtifact(undefined, { createdAt, updatedAt })];
  const requestedActiveArtifactId =
    typeof project.activeArtifactId === 'string' ? project.activeArtifactId : undefined;
  const activeArtifactId = artifacts.some((artifact) => artifact.id === requestedActiveArtifactId)
    ? requestedActiveArtifactId
    : artifacts[0].id;

  return {
    id,
    name,
    createdAt,
    updatedAt,
    activeArtifactId,
    artifacts,
  };
};

export const getActiveClassDiagramArtifact = (project: DiagramProject): ClassDiagramArtifact => {
  const activeArtifact = project.artifacts.find(
    (artifact): artifact is ClassDiagramArtifact =>
      artifact.id === project.activeArtifactId && artifact.type === 'class-diagram',
  );

  if (activeArtifact !== undefined) {
    return activeArtifact;
  }

  const firstClassDiagram = project.artifacts.find(
    (artifact): artifact is ClassDiagramArtifact => artifact.type === 'class-diagram',
  );

  if (firstClassDiagram !== undefined) {
    return firstClassDiagram;
  }

  return normalizeClassDiagramArtifact(undefined, {
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  });
};

export const getActiveArtifact = (project: DiagramProject): DesignArtifact => {
  const activeArtifact = project.artifacts.find((artifact) => artifact.id === project.activeArtifactId);

  return activeArtifact ?? project.artifacts[0];
};
