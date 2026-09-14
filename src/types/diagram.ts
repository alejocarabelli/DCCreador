import type { ClassGroupColor } from '../constants/classGroupColors';
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
export type ParametricValuesNoteConnectionMode = 'automatic' | 'manual';

export type ClassNodeData = {
  groupColor?: ClassGroupColor;
  hideAttributes?: boolean;
  hideMethods?: boolean;
  name: string;
  description?: string;
  attributes: ClassAttribute[];
  methods: ClassMethod[];
  hasParametricValuesNote?: boolean;
  parametricValuesNoteConnectionMode?: ParametricValuesNoteConnectionMode;
  parametricValuesNoteHandle?: ParametricValuesNoteHandle;
  parametricValuesNoteTargetHandle?: ParametricValuesNoteHandle;
  parametricValuesNotePosition?: XYPosition;
  parametricValues?: ParametricValue[];
  shouldStartNameEditing?: boolean;
  shouldStartAttributeEditing?: string;
  shouldStartMethodEditing?: string;
  isConnectionInProgress?: boolean;
  isConnectionSource?: boolean;
  onCreateAttribute?: (nodeId: string, attribute: ClassAttribute) => void;
  onCreateMethod?: (nodeId: string, method: ClassMethod) => void;
  onDeleteAttribute?: (nodeId: string, attributeId: string) => void;
  onDeleteAttributeAndCreateMethod?: (nodeId: string, attributeId: string, method: ClassMethod) => void;
  onDeleteMethod?: (nodeId: string, methodId: string) => void;
  onAttributeEditingStarted?: (nodeId: string) => void;
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
  labelOffset?: XYPosition;
  routingObstacles?: Array<{ x: number; y: number; width: number; height: number }>;
  onUpdateLabel?: (edgeId: string, values: Partial<AssociationEdgeData>) => void;
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

export type UseCaseFlowPriority = 'A' | 'B' | 'C';

export type UseCaseFlowDescription = {
  useCaseName: string;
  actor: string;
  description: string;
  priority: UseCaseFlowPriority;
  inputParameters: string;
  precondition: string;
  postcondition: string;
  initialState: string;
  finalState: string;
};

export type UseCaseFlowStep = {
  id: string;
  actor: string;
  system: string;
  ref: string;
};

export type AlternativeUseCaseFlow = {
  id: string;
  code: string;
  name: string;
  steps: UseCaseFlowStep[];
};

export type UseCaseFlowContent = {
  classDiagramArtifactId?: string;
  description: UseCaseFlowDescription;
  basicFlow: UseCaseFlowStep[];
  alternativeFlows: AlternativeUseCaseFlow[];
};

export type SequenceParticipantKind = 'actor' | 'boundary' | 'control' | 'entity' | 'object';
export type SequenceMessageType = 'synchronous' | 'asynchronous' | 'return' | 'create' | 'destroy';
export type SequenceFragmentOperator = 'alt' | 'loop' | 'opt' | 'par' | 'break' | 'critical' | 'ref';
export type SequenceNumberingMode = 'sequential' | 'hierarchical' | 'none';

export type SequenceParticipant = {
  id: string;
  kind: SequenceParticipantKind;
  name: string;
  classifierName: string;
  classifierNodeId?: string;
  x: number;
  createdByMessageId?: string;
  destroyedByMessageId?: string;
};

export type SequenceMessage = {
  id: string;
  kind: 'message';
  type: SequenceMessageType;
  sourceId: string;
  targetId: string;
  name: string;
  arguments: string;
  parameterValues: string;
  returnType: string;
  operationMethodId?: string;
  replyToMessageId?: string;
  flowReference: string;
};

export type SequenceFragmentOperand = {
  id: string;
  guard: string;
  items: SequenceTimelineItem[];
};

export type SequenceFragment = {
  id: string;
  kind: 'fragment';
  operator: SequenceFragmentOperator;
  name: string;
  startParticipantId?: string;
  endParticipantId?: string;
  operands: SequenceFragmentOperand[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type SequenceTimelineItem = SequenceMessage | SequenceFragment;

export type SequenceActivation = {
  id: string;
  participantId: string;
  startMessageId: string;
  endMessageId?: string;
  level: number;
  manual: boolean;
};

export type SequenceNoteAnchorKind = 'free' | 'message' | 'fragment' | 'participant';

export type SequenceNote = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  anchorKind: SequenceNoteAnchorKind;
  anchorId?: string;
};

export type SequenceDiagramContent = {
  version: 1;
  classDiagramArtifactId?: string;
  flowArtifactId?: string;
  numbering: SequenceNumberingMode;
  showActivations: boolean;
  participants: SequenceParticipant[];
  items: SequenceTimelineItem[];
  activations: SequenceActivation[];
  notes: SequenceNote[];
  canvas: {
    width: number;
    height: number;
  };
};

export type DiagramContent = ClassDiagramContent | UseCaseModelContent;
export type ArtifactContent = DiagramContent | UseCaseFlowContent | SequenceDiagramContent;

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

export type UseCaseFlowArtifact = {
  id: string;
  type: 'use-case-flow';
  name: string;
  createdAt: string;
  updatedAt: string;
  content: UseCaseFlowContent;
};

export type SequenceDiagramArtifact = {
  id: string;
  type: 'sequence-diagram';
  name: string;
  createdAt: string;
  updatedAt: string;
  content: SequenceDiagramContent;
};

export type DesignArtifact =
  | ClassDiagramArtifact
  | UseCaseModelArtifact
  | UseCaseFlowArtifact
  | SequenceDiagramArtifact;

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
