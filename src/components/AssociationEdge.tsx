import { AssociationTextLabel } from './AssociationTextLabel';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  type EdgeProps,
} from 'reactflow';
import { useRef, useState, type MouseEvent } from 'react';
import type { AssociationConnectionSide, AssociationEdgeData } from '../types/diagram';
import { buildAssociationPath, getAssociationCenterLabelPosition } from '../utils/associationRouting';
import { MultiplicityInput } from './MultiplicityInput';

const edgeLabelStyle = {
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'all',
} as const;

type MultiplicityEnd = 'source' | 'target';

const sideToPosition: Record<Exclude<AssociationConnectionSide, 'automatic'>, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

const getOutwardUnit = (position: Position, fallback: { x: number; y: number }) => {
  if (position === Position.Top) {
    return { x: 0, y: -1 };
  }
  if (position === Position.Right) {
    return { x: 1, y: 0 };
  }
  if (position === Position.Bottom) {
    return { x: 0, y: 1 };
  }
  if (position === Position.Left) {
    return { x: -1, y: 0 };
  }
  return fallback;
};

const getEndpointLabelPosition = (
  endpoint: { x: number; y: number },
  outward: { x: number; y: number },
) => {
  const alongOffset = 23;
  const sideOffset = 20;
  const perpendicularX = -outward.y * sideOffset;
  const perpendicularY = outward.x * sideOffset;

  return {
    x: endpoint.x + outward.x * alongOffset + perpendicularX,
    y: endpoint.y + outward.y * alongOffset + perpendicularY,
  };
};

const getOpenChevronPath = (
  endpoint: { x: number; y: number },
  towardLine: { x: number; y: number },
  length = 14,
  halfWidth = 7,
): string => {
  const baseX = endpoint.x + towardLine.x * length;
  const baseY = endpoint.y + towardLine.y * length;
  const perpendicularX = -towardLine.y * halfWidth;
  const perpendicularY = towardLine.x * halfWidth;

  return `M ${baseX + perpendicularX} ${baseY + perpendicularY} L ${endpoint.x} ${endpoint.y} L ${baseX - perpendicularX} ${baseY - perpendicularY}`;
};

const getTrianglePoints = (
  endpoint: { x: number; y: number },
  towardLine: { x: number; y: number },
): string => {
  const baseX = endpoint.x + towardLine.x * 20;
  const baseY = endpoint.y + towardLine.y * 20;
  const perpendicularX = -towardLine.y * 9;
  const perpendicularY = towardLine.x * 9;
  return `${endpoint.x},${endpoint.y} ${baseX + perpendicularX},${baseY + perpendicularY} ${baseX - perpendicularX},${baseY - perpendicularY}`;
};

const getDiamondPoints = (
  endpoint: { x: number; y: number },
  towardLine: { x: number; y: number },
): string => {
  const middleX = endpoint.x + towardLine.x * 11;
  const middleY = endpoint.y + towardLine.y * 11;
  const farX = endpoint.x + towardLine.x * 22;
  const farY = endpoint.y + towardLine.y * 22;
  const perpendicularX = -towardLine.y * 7;
  const perpendicularY = towardLine.x * 7;
  return `${endpoint.x},${endpoint.y} ${middleX + perpendicularX},${middleY + perpendicularY} ${farX},${farY} ${middleX - perpendicularX},${middleY - perpendicularY}`;
};

export function AssociationEdge({
  data,
  id,
  selected,
  sourcePosition,
  sourceX,
  sourceY,
  targetPosition,
  targetX,
  targetY,
}: EdgeProps<AssociationEdgeData>) {
  const [editingMultiplicity, setEditingMultiplicity] = useState<MultiplicityEnd | null>(null);
  const originalMultiplicityRef = useRef('');
  const edgeData = data ?? {
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
  };
  const relationType = edgeData.relationType ?? 'association';
  const supportsEndpoints = relationType === 'association'
    || relationType === 'aggregation'
    || relationType === 'composition';
  const lineStyle = edgeData.lineStyle ?? 'automatic';
  const effectiveSourcePosition =
    edgeData.sourceSide !== undefined && edgeData.sourceSide !== 'automatic'
      ? sideToPosition[edgeData.sourceSide]
      : sourcePosition;
  const effectiveTargetPosition =
    edgeData.targetSide !== undefined && edgeData.targetSide !== 'automatic'
      ? sideToPosition[edgeData.targetSide]
      : targetPosition;
  const markerEndPosition =
    relationType === 'generalization' || relationType === 'realization' || relationType === 'dependency'
      ? 'target'
      : edgeData.diamondEnd === 'target'
        ? 'target'
        : 'source';
  const sourceEndpoint = { x: sourceX, y: sourceY };
  const targetEndpoint = { x: targetX, y: targetY };
  const deltaX = targetEndpoint.x - sourceEndpoint.x;
  const deltaY = targetEndpoint.y - sourceEndpoint.y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const unitX = deltaX / length;
  const unitY = deltaY / length;
  const sourceOutward = getOutwardUnit(effectiveSourcePosition, { x: unitX, y: unitY });
  const targetOutward = getOutwardUnit(effectiveTargetPosition, { x: -unitX, y: -unitY });
  const preliminaryPath = buildAssociationPath({
    sourcePosition: effectiveSourcePosition,
    sourceX,
    sourceY,
    targetPosition: effectiveTargetPosition,
    targetX,
    targetY,
    lineStyle,
    obstacles: edgeData.routingObstacles,
  });
  const sourcePathOutward = preliminaryPath.style === 'straight' ? { x: unitX, y: unitY } : sourceOutward;
  const targetPathOutward = preliminaryPath.style === 'straight' ? { x: -unitX, y: -unitY } : targetOutward;
  const lineInset = relationType === 'association' ? 0 : 24;
  const hasSourceNavigationArrow =
    relationType === 'association' &&
    (edgeData.navigability === 'target-to-source' || edgeData.navigability === 'bidirectional');
  const hasTargetNavigationArrow =
    relationType === 'association' &&
    (edgeData.navigability === 'source-to-target' || edgeData.navigability === 'bidirectional');
  const hasDependencyArrow = relationType === 'dependency';
  const adjustedSourceX =
    relationType !== 'association' && markerEndPosition === 'source'
      ? sourceEndpoint.x + sourcePathOutward.x * lineInset
      : sourceEndpoint.x;
  const adjustedSourceY =
    relationType !== 'association' && markerEndPosition === 'source'
      ? sourceEndpoint.y + sourcePathOutward.y * lineInset
      : sourceEndpoint.y;
  const adjustedTargetX =
    relationType !== 'association' && markerEndPosition === 'target'
      ? targetEndpoint.x + targetPathOutward.x * lineInset
      : targetEndpoint.x;
  const adjustedTargetY =
    relationType !== 'association' && markerEndPosition === 'target'
      ? targetEndpoint.y + targetPathOutward.y * lineInset
      : targetEndpoint.y;
  const { path: edgePath, labelX, labelY } = buildAssociationPath({
    sourcePosition: effectiveSourcePosition,
    sourceX: adjustedSourceX,
    sourceY: adjustedSourceY,
    targetPosition: effectiveTargetPosition,
    targetX: adjustedTargetX,
    targetY: adjustedTargetY,
    lineStyle,
    obstacles: edgeData.routingObstacles,
  });
  const centerLabelPosition = getAssociationCenterLabelPosition(
    labelX,
    labelY,
    adjustedSourceX,
    adjustedSourceY,
    adjustedTargetX,
    adjustedTargetY,
  );

  const sourceLabelPosition = getEndpointLabelPosition(sourceEndpoint, sourceOutward);
  const targetLabelPosition = getEndpointLabelPosition(targetEndpoint, targetOutward);
  const markerEndpoint = markerEndPosition === 'target' ? targetEndpoint : sourceEndpoint;
  const markerOutward = markerEndPosition === 'target' ? targetPathOutward : sourcePathOutward;
  const startMultiplicityEditing = (end: MultiplicityEnd, event: MouseEvent<HTMLElement>): void => {
    event.stopPropagation();
    originalMultiplicityRef.current = end === 'source' ? edgeData.sourceMultiplicity : edgeData.targetMultiplicity;
    setEditingMultiplicity(end);
  };

  const updateMultiplicity = (end: MultiplicityEnd, value: string): void => {
    edgeData.onUpdateMultiplicity?.(id, end, value);
  };

  const cancelMultiplicityEditing = (): void => {
    if (editingMultiplicity !== null) {
      updateMultiplicity(editingMultiplicity, originalMultiplicityRef.current);
    }

    setEditingMultiplicity(null);
  };

  const renderMultiplicity = (end: MultiplicityEnd, value: string, x: number, y: number) => {
    const isEditing = editingMultiplicity === end;

    if (!value && !isEditing && !selected) {
      return null;
    }

    return (
      <div
        className="association-label association-label-end nodrag nopan"
        data-empty={!value}
        style={{ ...edgeLabelStyle, left: x, top: y }}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
        onDoubleClick={(event) => startMultiplicityEditing(end, event)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {isEditing ? (
          <MultiplicityInput
            ariaLabel={end === 'source' ? 'Multiplicidad origen' : 'Multiplicidad destino'}
            autoFocus
            compact
            value={value}
            onCancel={cancelMultiplicityEditing}
            onChange={(nextValue) => updateMultiplicity(end, nextValue)}
            onConfirm={() => setEditingMultiplicity(null)}
          />
        ) : (
          value || '…'
        )}
      </div>
    );
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? 'var(--association-stroke-selected)' : 'var(--association-stroke)',
          strokeWidth: selected ? 'calc(var(--association-stroke-width) + 0.9)' : 'var(--association-stroke-width)',
          strokeDasharray: relationType === 'dependency' || relationType === 'realization' ? '8 6' : undefined,
        }}
      />
      <path
        className="association-edge-hit-area"
        d={edgePath}
      />
      {hasSourceNavigationArrow ? (
        <path
          className="association-navigation-chevron"
          d={getOpenChevronPath(sourceEndpoint, sourcePathOutward)}
        />
      ) : null}
      {hasTargetNavigationArrow ? (
        <path
          className="association-navigation-chevron"
          d={getOpenChevronPath(targetEndpoint, targetPathOutward)}
        />
      ) : null}
      {hasDependencyArrow ? (
        <path
          className="association-navigation-chevron"
          d={getOpenChevronPath(targetEndpoint, targetPathOutward)}
        />
      ) : null}
      {relationType === 'generalization' ? (
        <polygon
          className="association-uml-marker association-uml-marker-open"
          points={getTrianglePoints(markerEndpoint, markerOutward)}
        />
      ) : null}
      {relationType === 'realization' ? (
        <polygon
          className="association-uml-marker association-uml-marker-open"
          points={getTrianglePoints(markerEndpoint, markerOutward)}
        />
      ) : null}
      {relationType === 'aggregation' || relationType === 'composition' ? (
        <polygon
          className={`association-uml-marker ${
            relationType === 'composition' ? 'association-uml-marker-filled' : 'association-uml-marker-open'
          }`}
          points={getDiamondPoints(markerEndpoint, markerOutward)}
        />
      ) : null}
      <EdgeLabelRenderer>
      {relationType !== 'generalization' ? <>
          <AssociationTextLabel value={edgeData.name} placeholder="Nombre de relación"
            x={centerLabelPosition.x} y={centerLabelPosition.y} offset={edgeData.labelOffset}
            className="association-label-center association-relation-label"
            onCommit={name => edgeData.onUpdateLabel?.(id, { name })}
            onMove={labelOffset => edgeData.onUpdateLabel?.(id, { labelOffset })} />
          {supportsEndpoints ? <>
            <AssociationTextLabel value={edgeData.sourceRole} placeholder="Rol de origen"
              x={sourceLabelPosition.x} y={sourceLabelPosition.y + 26} className="association-role-label"
              onCommit={sourceRole => edgeData.onUpdateLabel?.(id, { sourceRole })} />
            <AssociationTextLabel value={edgeData.targetRole} placeholder="Rol de destino"
              x={targetLabelPosition.x} y={targetLabelPosition.y + 26} className="association-role-label"
              onCommit={targetRole => edgeData.onUpdateLabel?.(id, { targetRole })} />
          </> : null}
        </> : null}
        {supportsEndpoints
          ? renderMultiplicity('source', edgeData.sourceMultiplicity, sourceLabelPosition.x, sourceLabelPosition.y)
          : null}
        {supportsEndpoints
          ? renderMultiplicity('target', edgeData.targetMultiplicity, targetLabelPosition.x, targetLabelPosition.y)
          : null}
      </EdgeLabelRenderer>
    </>
  );
}
