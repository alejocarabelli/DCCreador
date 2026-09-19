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
  terminateLifeline?: boolean;
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
  interactionArtifactId?: string;
};

export type SequenceTimelineItem = SequenceMessage | SequenceFragment;

export type SequenceActivation = {
  id: string;
  participantId: string;
  startMessageId: string;
  endMessageId?: string;
  /** Boundary used when an activation is open only inside an alternative path. */
  endScope?: {
    fragmentId: string;
    operandId: string;
  };
  level: number;
  manual: boolean;
};

/**
 * A recoverable semantic issue found while reading a sequence timeline.
 * Items are deliberately kept in the document so an import never loses the
 * original authoring evidence; consumers can decide how to present or repair
 * the issue later.
 */
export type SequenceDiagramProblemCode =
  | 'normalization-repair'
  | 'missing-participant-reference'
  | 'message-before-create'
  | 'message-after-destroy'
  | 'conditional-participant-lifecycle'
  | 'duplicate-create'
  | 'create-after-destroy'
  | 'destroy-before-create'
  | 'duplicate-destroy'
  | 'unmatched-return'
  | 'ambiguous-activation'
  | 'ambiguous-lifecycle-marker'
  | 'invalid-manual-activation'
  | 'broken-interaction-reference'
  | 'unlinked-interaction-reference';

export type SequenceDiagramProblem = {
  id: string;
  code: SequenceDiagramProblemCode;
  severity: 'error' | 'warning';
  message: string;
  activationId?: string;
  messageId?: string;
  participantId?: string;
  fragmentId?: string;
  operandId?: string;
};

export type SequenceNoteAnchorKind = 'free' | 'message' | 'fragment' | 'participant';

export type SequenceNoteColor = 'yellow' | 'red' | 'green' | 'blue';

export type SequenceNoteColorScheme = {
  background: string;
  border: string;
  fold: string;
  text: string;
  connectionLine: string;
  dot: string;
  label: string;
};

export const SEQUENCE_NOTE_COLORS: Record<SequenceNoteColor, SequenceNoteColorScheme> = {
  yellow: {
    background: '#FFF9DB',
    border: '#E9D37A',
    fold: '#E5C95B',
    text: '#2F2A1D',
    connectionLine: '#D4B841',
    dot: '#F59F00',
    label: 'Amarillo',
  },
  red: {
    background: '#FFE3E3',
    border: '#FFA8A8',
    fold: '#F08C8C',
    text: '#491217',
    connectionLine: '#E03131',
    dot: '#E03131',
    label: 'Rojo',
  },
  green: {
    background: '#EBFBEE',
    border: '#8CE99A',
    fold: '#69DB7C',
    text: '#1B4323',
    connectionLine: '#2F9E44',
    dot: '#2F9E44',
    label: 'Verde',
  },
  blue: {
    background: '#E7F5FF',
    border: '#A5D8FF',
    fold: '#74C0FC',
    text: '#183B56',
    connectionLine: '#1C7ED6',
    dot: '#1971C2',
    label: 'Azul',
  },
};

export type SequenceNote = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  anchorKind: SequenceNoteAnchorKind;
  anchorId?: string;
  color?: SequenceNoteColor;
};

export type SequenceParticipantColorMode = 'automatic' | 'disabled';

export type SequenceDiagramContent = {
  version: 1;
  classDiagramArtifactId?: string;
  flowArtifactId?: string;
  numbering: SequenceNumberingMode;
  showActivations: boolean;
  participantColors?: SequenceParticipantColorMode;
  participants: SequenceParticipant[];
  items: SequenceTimelineItem[];
  activations: SequenceActivation[];
  problems: SequenceDiagramProblem[];
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
