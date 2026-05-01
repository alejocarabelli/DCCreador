import type { Edge, Node, XYPosition } from 'reactflow';
import type { MouseEvent } from 'react';

export type ClassAttribute = {
  id: string;
  name: string;
  type: string;
};

export type ClassMethod = {
  id: string;
  visibility: '+' | '-' | '#' | '';
  name: string;
  parameters: string;
  returnType: string;
};

export type ParametricValue = {
  id: string;
  value: string;
};

export type ParametricValuesNoteHandle = 'top' | 'right' | 'bottom' | 'left';

export type ClassNodeData = {
  name: string;
  attributes: ClassAttribute[];
  methods: ClassMethod[];
  hasParametricValuesNote?: boolean;
  parametricValuesNoteHandle?: ParametricValuesNoteHandle;
  parametricValuesNoteTargetHandle?: ParametricValuesNoteHandle;
  parametricValuesNotePosition?: XYPosition;
  parametricValues?: ParametricValue[];
  shouldStartNameEditing?: boolean;
  shouldStartMethodEditing?: string;
  onCreateAttribute?: (nodeId: string, attribute: ClassAttribute) => void;
  onCreateMethod?: (nodeId: string, method: ClassMethod) => void;
  onDeleteAttribute?: (nodeId: string, attributeId: string) => void;
  onDeleteAttributeAndCreateMethod?: (nodeId: string, attributeId: string, method: ClassMethod) => void;
  onDeleteMethod?: (nodeId: string, methodId: string) => void;
  onMethodEditingStarted?: (nodeId: string) => void;
  onNameEditingStarted?: (nodeId: string) => void;
  onOpenContextMenu?: (nodeId: string, event: MouseEvent<HTMLElement>) => void;
  onRenameClass?: (nodeId: string, name: string) => void;
  onRenameClassAndCreateAttribute?: (nodeId: string, name: string, attribute: ClassAttribute) => void;
  onSetParametricValuesNote?: (nodeId: string, enabled: boolean) => void;
  onUpdateAttribute?: (nodeId: string, attributeId: string, field: keyof Omit<ClassAttribute, 'id'>, value: string) => void;
  onUpdateAttributeFields?: (
    nodeId: string,
    attributeId: string,
    values: Pick<ClassAttribute, 'name' | 'type'>,
  ) => void;
  onUpdateAttributeFieldsAndCreateAttribute?: (
    nodeId: string,
    attributeId: string,
    values: Pick<ClassAttribute, 'name' | 'type'>,
    nextAttribute: ClassAttribute,
  ) => void;
  onUpdateMethodFields?: (
    nodeId: string,
    methodId: string,
    values: Omit<ClassMethod, 'id'>,
  ) => void;
  onUpdateMethodFieldsAndCreateMethod?: (
    nodeId: string,
    methodId: string,
    values: Omit<ClassMethod, 'id'>,
    nextMethod: ClassMethod,
  ) => void;
  onUpdateParametricValues?: (nodeId: string, values: ParametricValue[]) => void;
};

export type ClassDiagramNode = Node<ClassNodeData, 'classNode'>;

export type ConnectionSide = 'top' | 'right' | 'bottom' | 'left';
export type AssociationNavigability = 'none' | 'source-to-target' | 'target-to-source' | 'bidirectional';
export type AssociationRelationType = 'association' | 'generalization' | 'aggregation' | 'composition';
export type AssociationDiamondEnd = 'source' | 'target';
export type AssociationLineStyle = 'automatic' | 'straight' | 'orthogonal';
export type AssociationConnectionSide = 'automatic' | ConnectionSide;

export type AssociationEdgeData = {
  name: string;
  sourceMultiplicity: string;
  targetMultiplicity: string;
  sourceRole: string;
  targetRole: string;
  navigability: AssociationNavigability;
  relationType?: AssociationRelationType;
  diamondEnd?: AssociationDiamondEnd;
  lineStyle?: AssociationLineStyle;
  sourceSide?: AssociationConnectionSide;
  targetSide?: AssociationConnectionSide;
  waypoints?: XYPosition[];
  onUpdateMultiplicity?: (edgeId: string, end: 'source' | 'target', value: string) => void;
};

export type ClassDiagramEdge = Edge<AssociationEdgeData>;

export type ClassDiagramContent = {
  nodes: ClassDiagramNode[];
  edges: ClassDiagramEdge[];
};

export type UseCaseNodeKind = 'actor' | 'use-case' | 'system-boundary';
export type UseCaseRelationType = 'association' | 'include' | 'extend' | 'generalization';

export type UseCaseNodeData = {
  kind: UseCaseNodeKind;
  name: string;
  onOpenContextMenu?: (nodeId: string, event: MouseEvent<HTMLElement>) => void;
  onRename?: (nodeId: string, name: string) => void;
};

export type UseCaseModelNode = Node<UseCaseNodeData, 'useCaseActor' | 'useCaseOval' | 'systemBoundary'>;

export type UseCaseEdgeData = {
  relationType: UseCaseRelationType;
  label?: string;
};

export type UseCaseModelEdge = Edge<UseCaseEdgeData>;

export type UseCaseModelContent = {
  nodes: UseCaseModelNode[];
  edges: UseCaseModelEdge[];
};

export type DiagramContent = ClassDiagramContent | UseCaseModelContent;

export type ClassDiagramArtifact = {
  id: string;
  type: 'class-diagram';
  name: string;
  createdAt: string;
  updatedAt: string;
  content: ClassDiagramContent;
};

export type UseCaseModelArtifact = {
  id: string;
  type: 'use-case-model';
  name: string;
  createdAt: string;
  updatedAt: string;
  content: UseCaseModelContent;
};

export type DesignArtifact = ClassDiagramArtifact | UseCaseModelArtifact;

export type DesignProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  activeArtifactId?: string;
  artifacts: DesignArtifact[];
};

export type DiagramProject = DesignProject;

export type LegacyDiagramProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  content: ClassDiagramContent;
};
