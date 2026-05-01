import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Position,
  type EdgeProps,
} from 'reactflow';
import { useRef, useState, type MouseEvent } from 'react';
import type { AssociationConnectionSide, AssociationEdgeData } from '../types/diagram';
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

const NAVIGATION_ARROW_INSET = 7;

const getEndpointLabelPosition = (
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  end: MultiplicityEnd,
) => {
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const unitX = deltaX / length;
  const unitY = deltaY / length;
  const alongOffset = 30;
  const sideOffset = 18;
  const offsetX = unitX * alongOffset;
  const offsetY = unitY * alongOffset;
  const perpendicularX = -unitY * sideOffset;
  const perpendicularY = unitX * sideOffset;

  if (end === 'source') {
    return { x: sourceX + offsetX + perpendicularX, y: sourceY + offsetY + perpendicularY };
  }

  return { x: targetX - offsetX + perpendicularX, y: targetY - offsetY + perpendicularY };
};

export function AssociationEdge({
  data,
  id,
  markerEnd,
  markerStart,
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
    lineStyle: 'straight',
    sourceSide: 'automatic',
    targetSide: 'automatic',
  };
  const relationType = edgeData.relationType ?? 'association';
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
    relationType === 'generalization'
      ? edgeData.diamondEnd ?? 'target'
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
  const markerOffset = relationType === 'generalization' ? 18 : 16;
  const lineInset = relationType === 'association' ? 0 : 28;
  const hasSourceNavigationArrow =
    relationType === 'association' &&
    (edgeData.navigability === 'target-to-source' || edgeData.navigability === 'bidirectional');
  const hasTargetNavigationArrow =
    relationType === 'association' &&
    (edgeData.navigability === 'source-to-target' || edgeData.navigability === 'bidirectional');
  const sourceNavigationInset = hasSourceNavigationArrow ? NAVIGATION_ARROW_INSET : 0;
  const targetNavigationInset = hasTargetNavigationArrow ? NAVIGATION_ARROW_INSET : 0;
  const adjustedSourceX =
    relationType !== 'association' && markerEndPosition === 'source'
      ? sourceEndpoint.x + unitX * lineInset
      : sourceEndpoint.x + unitX * sourceNavigationInset;
  const adjustedSourceY =
    relationType !== 'association' && markerEndPosition === 'source'
      ? sourceEndpoint.y + unitY * lineInset
      : sourceEndpoint.y + unitY * sourceNavigationInset;
  const adjustedTargetX =
    relationType !== 'association' && markerEndPosition === 'target'
      ? targetEndpoint.x - unitX * lineInset
      : targetEndpoint.x - unitX * targetNavigationInset;
  const adjustedTargetY =
    relationType !== 'association' && markerEndPosition === 'target'
      ? targetEndpoint.y - unitY * lineInset
      : targetEndpoint.y - unitY * targetNavigationInset;
  const pathParams = {
    sourcePosition: effectiveSourcePosition,
    sourceX: adjustedSourceX,
    sourceY: adjustedSourceY,
    targetPosition: effectiveTargetPosition,
    targetX: adjustedTargetX,
    targetY: adjustedTargetY,
  };
  const [edgePath] =
    lineStyle === 'straight'
      ? getStraightPath(pathParams)
      : lineStyle === 'orthogonal'
        ? getSmoothStepPath(pathParams)
        : getBezierPath(pathParams);

  const sourceLabelPosition = getEndpointLabelPosition(
    sourceEndpoint.x,
    sourceEndpoint.y,
    targetEndpoint.x,
    targetEndpoint.y,
    'source',
  );
  const targetLabelPosition = getEndpointLabelPosition(
    sourceEndpoint.x,
    sourceEndpoint.y,
    targetEndpoint.x,
    targetEndpoint.y,
    'target',
  );
  const markerX =
    markerEndPosition === 'target'
      ? targetEndpoint.x - unitX * markerOffset
      : sourceEndpoint.x + unitX * markerOffset;
  const markerY =
    markerEndPosition === 'target'
      ? targetEndpoint.y - unitY * markerOffset
      : sourceEndpoint.y + unitY * markerOffset;
  const markerAngle =
    Math.atan2(targetEndpoint.y - sourceEndpoint.y, targetEndpoint.x - sourceEndpoint.x) +
    (markerEndPosition === 'source' ? Math.PI : 0);
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

    if (!value && !isEditing) {
      return null;
    }

    return (
      <div
        className="association-label association-label-end"
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
          value
        )}
      </div>
    );
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{
          stroke: selected ? 'var(--association-stroke-selected)' : 'var(--association-stroke)',
          strokeWidth: selected ? 'calc(var(--association-stroke-width) + 0.9)' : 'var(--association-stroke-width)',
        }}
      />
      <path
        className="association-edge-hit-area"
        d={edgePath}
      />
      <EdgeLabelRenderer>
        {relationType !== 'association' ? (
          <div
            className="relation-marker"
            style={{
              ...edgeLabelStyle,
              left: markerX,
              top: markerY,
              transform: `${edgeLabelStyle.transform} rotate(${markerAngle}rad)`,
            }}
          >
            {relationType === 'generalization' ? (
              <svg aria-hidden="true" className="relation-marker-svg" viewBox="0 0 24 24">
                <polygon className="relation-marker-open" points="21,12 4,3 4,21" />
              </svg>
            ) : (
              <svg aria-hidden="true" className="relation-marker-svg" viewBox="0 0 24 24">
                <polygon
                  className={relationType === 'composition' ? 'relation-marker-filled' : 'relation-marker-open'}
                  points="21,12 12,4 3,12 12,20"
                />
              </svg>
            )}
          </div>
        ) : null}
        {relationType === 'association'
          ? renderMultiplicity('source', edgeData.sourceMultiplicity, sourceLabelPosition.x, sourceLabelPosition.y)
          : null}
        {relationType === 'association'
          ? renderMultiplicity('target', edgeData.targetMultiplicity, targetLabelPosition.x, targetLabelPosition.y)
          : null}
      </EdgeLabelRenderer>
    </>
  );
}
