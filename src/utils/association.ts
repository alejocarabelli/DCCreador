import type { EdgeMarker } from 'reactflow';
import type {
  AssociationConnectionSide,
  AssociationDiamondEnd,
  AssociationEdgeData,
  AssociationLineStyle,
  AssociationNavigability,
  AssociationRelationType,
  ClassDiagramEdge,
} from '../types/diagram';

export const DEFAULT_ASSOCIATION_DATA: AssociationEdgeData = {
  name: '',
  sourceMultiplicity: '',
  targetMultiplicity: '',
  sourceRole: '',
  targetRole: '',
  navigability: 'none',
  relationType: 'association',
  diamondEnd: 'source',
  lineStyle: 'automatic',
  sourceSide: 'automatic',
  targetSide: 'automatic',
  waypoints: [],
};

export type ResolvedAssociationLineStyle = Exclude<AssociationLineStyle, 'automatic'>;

export const resolveAssociationLineStyle = (
  lineStyle: AssociationLineStyle | undefined,
  deltaX: number,
  deltaY: number,
): ResolvedAssociationLineStyle => {
  const normalizedStyle: AssociationLineStyle = lineStyle ?? DEFAULT_ASSOCIATION_DATA.lineStyle ?? 'automatic';

  if (normalizedStyle !== 'automatic') {
    return normalizedStyle;
  }

  const alignmentTolerance = 12;
  return Math.abs(deltaX) <= alignmentTolerance || Math.abs(deltaY) <= alignmentTolerance
    ? 'straight'
    : 'orthogonal';
};

const normalizeString = (value: unknown): string => (typeof value === 'string' ? value : '');
const isOneOf = <T extends string>(value: unknown, options: readonly T[]): value is T =>
  typeof value === 'string' && options.some((option) => option === value);

const navigabilities: readonly AssociationNavigability[] = [
  'none',
  'source-to-target',
  'target-to-source',
  'bidirectional',
];
const relationTypes: readonly AssociationRelationType[] = [
  'association',
  'generalization',
  'aggregation',
  'composition',
];
const diamondEnds: readonly AssociationDiamondEnd[] = ['source', 'target'];
const lineStyles: readonly AssociationLineStyle[] = ['automatic', 'straight', 'orthogonal'];
const connectionSides: readonly AssociationConnectionSide[] = ['automatic', 'top', 'right', 'bottom', 'left'];

export const normalizeAssociationData = (data: Partial<AssociationEdgeData> | undefined): AssociationEdgeData => ({
  name: normalizeString(data?.name),
  ...(Number.isFinite(data?.labelOffset?.x) && Number.isFinite(data?.labelOffset?.y)
    ? { labelOffset: { x: data!.labelOffset!.x, y: data!.labelOffset!.y } } : {}),
  sourceMultiplicity: normalizeString(data?.sourceMultiplicity),
  targetMultiplicity: normalizeString(data?.targetMultiplicity),
  sourceRole: normalizeString(data?.sourceRole),
  targetRole: normalizeString(data?.targetRole),
  navigability: isOneOf(data?.navigability, navigabilities)
    ? data.navigability
    : DEFAULT_ASSOCIATION_DATA.navigability,
  relationType: isOneOf(data?.relationType, relationTypes)
    ? data.relationType
    : DEFAULT_ASSOCIATION_DATA.relationType,
  diamondEnd: isOneOf(data?.diamondEnd, diamondEnds) ? data.diamondEnd : DEFAULT_ASSOCIATION_DATA.diamondEnd,
  lineStyle: isOneOf(data?.lineStyle, lineStyles) ? data.lineStyle : DEFAULT_ASSOCIATION_DATA.lineStyle,
  sourceSide: isOneOf(data?.sourceSide, connectionSides) ? data.sourceSide : DEFAULT_ASSOCIATION_DATA.sourceSide,
  targetSide: isOneOf(data?.targetSide, connectionSides) ? data.targetSide : DEFAULT_ASSOCIATION_DATA.targetSide,
  waypoints: Array.isArray(data?.waypoints)
    ? data.waypoints
        .filter((point) => typeof point?.x === 'number' && Number.isFinite(point.x) && typeof point?.y === 'number' && Number.isFinite(point.y))
        .map((point) => ({ x: point.x, y: point.y }))
    : [],
});

export const normalizeAssociationEdge = (edge: ClassDiagramEdge): ClassDiagramEdge => {
  const data = normalizeAssociationData(edge.data);

  const normalizedEdge: ClassDiagramEdge = {
    ...edge,
    id: normalizeString(edge?.id),
    source: normalizeString(edge?.source),
    target: normalizeString(edge?.target),
    type: 'association',
    sourceHandle: data.sourceSide === 'automatic' ? edge.sourceHandle : data.sourceSide,
    targetHandle: data.targetSide === 'automatic' ? edge.targetHandle : data.targetSide,
    data,
    markerStart: getAssociationMarker(data.navigability, 'source', data.relationType),
    markerEnd: getAssociationMarker(data.navigability, 'target', data.relationType),
  };

  delete normalizedEdge.selected;

  return normalizedEdge;
};

export const getAssociationMarker = (
  navigability: AssociationNavigability | undefined,
  end: 'source' | 'target',
  relationType: AssociationRelationType | undefined = 'association',
): EdgeMarker | undefined => {
  if (relationType !== 'association') {
    return undefined;
  }

  if (navigability === 'bidirectional') {
    return { type: 'arrow' as EdgeMarker['type'], width: 24, height: 24, color: 'var(--marker-stroke)' };
  }

  if (navigability === 'source-to-target' && end === 'target') {
    return { type: 'arrow' as EdgeMarker['type'], width: 24, height: 24, color: 'var(--marker-stroke)' };
  }

  if (navigability === 'target-to-source' && end === 'source') {
    return { type: 'arrow' as EdgeMarker['type'], width: 24, height: 24, color: 'var(--marker-stroke)' };
  }

  return undefined;
};
