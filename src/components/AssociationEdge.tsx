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
  const alongOffset = 30;
  const sideOffset = 18;
  const perpendicularX = -outward.y * sideOffset;
  const perpendicularY = outward.x * sideOffset;

  return {
    x: endpoint.x + outward.x * alongOffset + perpendicularX,
    y: endpoint.y + outward.y * alongOffset + perpendicularY,
  };
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
  const sourceOutward = getOutwardUnit(effectiveSourcePosition, { x: unitX, y: unitY });
  const targetOutward = getOutwardUnit(effectiveTargetPosition, { x: -unitX, y: -unitY });
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
      ? sourceEndpoint.x + sourceOutward.x * lineInset
      : sourceEndpoint.x + sourceOutward.x * sourceNavigationInset;
  const adjustedSourceY =
    relationType !== 'association' && markerEndPosition === 'source'
      ? sourceEndpoint.y + sourceOutward.y * lineInset
      : sourceEndpoint.y + sourceOutward.y * sourceNavigationInset;
  const adjustedTargetX =
    relationType !== 'association' && markerEndPosition === 'target'
      ? targetEndpoint.x + targetOutward.x * lineInset
      : targetEndpoint.x + targetOutward.x * targetNavigationInset;
  const adjustedTargetY =
    relationType !== 'association' && markerEndPosition === 'target'
      ? targetEndpoint.y + targetOutward.y * lineInset
      : targetEndpoint.y + targetOutward.y * targetNavigationInset;
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

  const sourceLabelPosition = getEndpointLabelPosition(sourceEndpoint, sourceOutward);
  const targetLabelPosition = getEndpointLabelPosition(targetEndpoint, targetOutward);
  const markerX =
    markerEndPosition === 'target'
      ? targetEndpoint.x + targetOutward.x * markerOffset
      : sourceEndpoint.x + sourceOutward.x * markerOffset;
  const markerY =
    markerEndPosition === 'target'
      ? targetEndpoint.y + targetOutward.y * markerOffset
      : sourceEndpoint.y + sourceOutward.y * markerOffset;
  const markerOutward = markerEndPosition === 'target' ? targetOutward : sourceOutward;
  const markerAngle = Math.atan2(-markerOutward.y, -markerOutward.x);
  const renderNavigationArrow = (end: MultiplicityEnd) => {
    const isTarget = end === 'target';
    const endpoint = isTarget ? targetEndpoint : sourceEndpoint;
    const outward = isTarget ? targetOutward : sourceOutward;
    const x = endpoint.x + outward.x * 9;
    const y = endpoint.y + outward.y * 9;
    const angle = Math.atan2(-outward.y, -outward.x);

    return (
      <div
        className="association-navigation-arrow"
        style={{
          ...edgeLabelStyle,
          left: x,
          top: y,
          transform: `${edgeLabelStyle.transform} rotate(${angle}rad)`,
        }}
      >
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path
            d="M5 4 19 12 5 20"
            fill="none"
            stroke="var(--marker-stroke, #222222)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </div>
    );
  };
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
        {hasSourceNavigationArrow ? renderNavigationArrow('source') : null}
        {hasTargetNavigationArrow ? renderNavigationArrow('target') : null}
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
