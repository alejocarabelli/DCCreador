import type { Edge, Node, XYPosition } from 'reactflow';
import type { MouseEvent } from 'react';

export type ClassAttribute = {
  id: string;
  name: string;
  type: string;
};

export type ParametricValue = {
  id: string;
  value: string;
};

export type ParametricValuesNoteHandle = 'top' | 'right' | 'bottom' | 'left';

export type ClassNodeData = {
  name: string;
  attributes: ClassAttribute[];
  hasParametricValuesNote?: boolean;
  parametricValuesNoteHandle?: ParametricValuesNoteHandle;
  parametricValuesNoteTargetHandle?: ParametricValuesNoteHandle;
  parametricValuesNotePosition?: XYPosition;
  parametricValues?: ParametricValue[];
  shouldStartNameEditing?: boolean;
  onCreateAttribute?: (nodeId: string, attribute: ClassAttribute) => void;
  onDeleteAttribute?: (nodeId: string, attributeId: string) => void;
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

export type DiagramContent = {
  nodes: ClassDiagramNode[];
  edges: ClassDiagramEdge[];
};

export type DiagramProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  content: DiagramContent;
};
