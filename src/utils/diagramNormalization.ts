import type { ClassDiagramEdge, ClassDiagramNode, DiagramContent, DiagramProject } from '../types/diagram';
import { normalizeAssociationEdge } from './association';

export const normalizeClassNode = (node: ClassDiagramNode): ClassDiagramNode => ({
  ...node,
  type: 'classNode',
  data: {
    ...node.data,
    name: node.data?.name ?? '',
    attributes: Array.isArray(node.data?.attributes) ? node.data.attributes : [],
    hasParametricValuesNote: node.data?.hasParametricValuesNote ?? false,
    parametricValuesNoteHandle: node.data?.parametricValuesNoteHandle ?? 'bottom',
    parametricValuesNoteTargetHandle: node.data?.parametricValuesNoteTargetHandle ?? 'top',
    parametricValuesNotePosition: node.data?.parametricValuesNotePosition,
    parametricValues: Array.isArray(node.data?.parametricValues) ? node.data.parametricValues : [],
  },
});

export const normalizeDiagramContent = (content: Partial<DiagramContent> | undefined): DiagramContent => ({
  nodes: Array.isArray(content?.nodes) ? (content.nodes as ClassDiagramNode[]).map(normalizeClassNode) : [],
  edges: Array.isArray(content?.edges) ? (content.edges as ClassDiagramEdge[]).map(normalizeAssociationEdge) : [],
});

export const normalizeDiagramProject = (project: DiagramProject): DiagramProject => ({
  ...project,
  content: normalizeDiagramContent(project.content),
});
