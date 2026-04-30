import type { EdgeMarker } from 'reactflow';
import type { AssociationEdgeData, AssociationNavigability, AssociationRelationType, ClassDiagramEdge } from '../types/diagram';

export const DEFAULT_ASSOCIATION_DATA: AssociationEdgeData = {
  name: '',
  sourceMultiplicity: '',
  targetMultiplicity: '',
  sourceRole: '',
  targetRole: '',
  navigability: 'none',
  relationType: 'association',
  diamondEnd: 'source',
  lineStyle: 'straight',
  sourceSide: 'automatic',
  targetSide: 'automatic',
  waypoints: [],
};

export const normalizeAssociationData = (data: Partial<AssociationEdgeData> | undefined): AssociationEdgeData => ({
  ...DEFAULT_ASSOCIATION_DATA,
  ...data,
  navigability: data?.navigability ?? DEFAULT_ASSOCIATION_DATA.navigability,
  relationType: data?.relationType ?? DEFAULT_ASSOCIATION_DATA.relationType,
  diamondEnd: data?.diamondEnd ?? DEFAULT_ASSOCIATION_DATA.diamondEnd,
  lineStyle: data?.lineStyle ?? DEFAULT_ASSOCIATION_DATA.lineStyle,
  sourceSide: data?.sourceSide ?? DEFAULT_ASSOCIATION_DATA.sourceSide,
  targetSide: data?.targetSide ?? DEFAULT_ASSOCIATION_DATA.targetSide,
  waypoints: Array.isArray(data?.waypoints) ? data.waypoints : [],
});

export const normalizeAssociationEdge = (edge: ClassDiagramEdge): ClassDiagramEdge => {
  const data = normalizeAssociationData(edge.data);

  return {
    ...edge,
    type: 'association',
    sourceHandle: data.sourceSide === 'automatic' ? edge.sourceHandle : data.sourceSide,
    targetHandle: data.targetSide === 'automatic' ? edge.targetHandle : data.targetSide,
    data,
    markerStart: getAssociationMarker(data.navigability, 'source', data.relationType),
    markerEnd: getAssociationMarker(data.navigability, 'target', data.relationType),
  };
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
