import { AssociationTextLabel } from './AssociationTextLabel';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  useStore,
  type EdgeProps,
} from 'reactflow';
import { useRef, useState, type MouseEvent } from 'react';
import type { AssociationConnectionSide, AssociationEdgeData } from '../types/diagram';
import { buildAssociationPath, getAssociationCenterLabelPosition } from '../utils/associationRouting';
import { MultiplicityInput } from './MultiplicityInput';
import { DEFAULT_ASSOCIATION_DATA } from '../utils/association';
import { AssociationLineStyleToolbar, AssociationMultiplicityChips } from './AssociationQuickControls';

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
  rowOffset = 0,
) => {
  const alongOffset = 23;
  const sideOffset = 20;
  const perpendicularX = -outward.y * sideOffset;
  const perpendicularY = outward.x * sideOffset;
  // Extend role rows away from the anchor on every side, including left/top.
  const rowDirection = outward.x < 0 || outward.y < 0 ? -1 : 1;

  return {
    x: endpoint.x + outward.x * alongOffset + perpendicularX,
    y: endpoint.y + outward.y * alongOffset + perpendicularY + rowDirection * rowOffset,
  };
};

const getMultiplicityChipsStyle = (
  label: { x: number; y: number },
  outward: { x: number; y: number },
  bounds: { left: number; right: number } | null,
) => {
  const width = 156;
  let alignEnd = outward.x < 0 || outward.y > 0;
  let left = label.x + outward.x * 14;
  let transform = outward.x > 0 ? 'translateY(-50%)'
    : outward.x < 0 ? 'translate(-100%, -50%)'
      : outward.y > 0 ? 'translate(-100%, 0)'
        : 'translateY(-100%)';

  if (bounds !== null) {
    // On vertical lines, switch sides before clamping so chips stay clear of the line.
    if (outward.y > 0 && left - width < bounds.left) {
      left = label.x + 40;
      alignEnd = false;
      transform = 'none';
    } else if (outward.y < 0 && left + width > bounds.right) {
      left = label.x - 40;
      alignEnd = true;
      transform = 'translate(-100%, -100%)';
    }
    left = Math.max(bounds.left + (alignEnd ? width : 0), Math.min(left, bounds.right - (alignEnd ? 0 : width)));
  }

  return { ...edgeLabelStyle, left, top: label.y + outward.y * 54 + outward.x * 62, transform, width };
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

// Marker depths along the line. The line stops exactly at the marker's base,
// so a hollow triangle or diamond closes against it with no gap.
const TRIANGLE_LENGTH = 20;
const DIAMOND_LENGTH = 22;

const getTrianglePoints = (
  endpoint: { x: number; y: number },
  towardLine: { x: number; y: number },
): string => {
  const baseX = endpoint.x + towardLine.x * TRIANGLE_LENGTH;
  const baseY = endpoint.y + towardLine.y * TRIANGLE_LENGTH;
  const perpendicularX = -towardLine.y * 9;
  const perpendicularY = towardLine.x * 9;
  return `${endpoint.x},${endpoint.y} ${baseX + perpendicularX},${baseY + perpendicularY} ${baseX - perpendicularX},${baseY - perpendicularY}`;
};

const getDiamondPoints = (
  endpoint: { x: number; y: number },
  towardLine: { x: number; y: number },
): string => {
  const middleX = endpoint.x + towardLine.x * (DIAMOND_LENGTH / 2);
  const middleY = endpoint.y + towardLine.y * (DIAMOND_LENGTH / 2);
  const farX = endpoint.x + towardLine.x * DIAMOND_LENGTH;
  const farY = endpoint.y + towardLine.y * DIAMOND_LENGTH;
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
  const [editingRole, setEditingRole] = useState<MultiplicityEnd | null>(null);
  const originalMultiplicityRef = useRef('');
  const viewportTransform = useStore(state => selected ? state.transform : null);
  const canvasWidth = useStore(state => selected ? state.width : 0);
  const chipsBounds = viewportTransform !== null && canvasWidth > 0 ? {
    left: (8 - viewportTransform[0]) / viewportTransform[2],
    right: (canvasWidth - 8 - viewportTransform[0]) / viewportTransform[2],
  } : null;
  const edgeData = data ?? DEFAULT_ASSOCIATION_DATA;
  const relationType = edgeData.relationType ?? 'association';
  const supportsEndpoints = relationType === 'association'
    || relationType === 'aggregation'
    || relationType === 'composition';
  const lineStyle = edgeData.lineStyle ?? 'orthogonal';
  const effectiveSourcePosition =
    edgeData.sourceSide !== undefined && edgeData.sourceSide !== 'automatic'
      ? sideToPosition[edgeData.sourceSide]
      : sourcePosition;
  const effectiveTargetPosition =
    edgeData.targetSide !== undefined && edgeData.targetSide !== 'automatic'
      ? sideToPosition[edgeData.targetSide]
      : targetPosition;
  const markerEndPosition =
    relationType === 'realization' || relationType === 'dependency'
      ? 'target'
      : relationType === 'generalization'
        ? edgeData.triangleEnd ?? 'target'
        : edgeData.diamondEnd === 'target'
        ? 'target'
        : 'source';
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
  const sourceEndpoint = preliminaryPath.source;
  const targetEndpoint = preliminaryPath.target;
  const deltaX = targetEndpoint.x - sourceEndpoint.x;
  const deltaY = targetEndpoint.y - sourceEndpoint.y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const unitX = deltaX / length;
  const unitY = deltaY / length;
  const sourceOutward = getOutwardUnit(effectiveSourcePosition, { x: unitX, y: unitY });
  const targetOutward = getOutwardUnit(effectiveTargetPosition, { x: -unitX, y: -unitY });
  const sourcePathOutward = preliminaryPath.style === 'straight' ? { x: unitX, y: unitY } : sourceOutward;
  const targetPathOutward = preliminaryPath.style === 'straight' ? { x: -unitX, y: -unitY } : targetOutward;
  // Open arrows (association, dependency) end at the tip; triangles and diamonds at their base.
  const lineInset =
    relationType === 'generalization' || relationType === 'realization'
      ? TRIANGLE_LENGTH
      : relationType === 'aggregation' || relationType === 'composition'
        ? DIAMOND_LENGTH
        : 0;
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
  const horizontal = Math.abs(deltaX) >= Math.abs(deltaY);
  const centerLabelOffset = relationType === 'generalization' ? undefined : edgeData.labelOffset;
  const toolbarPosition = {
    x: centerLabelPosition.x + (centerLabelOffset?.x ?? 0),
    y: centerLabelPosition.y + (centerLabelOffset?.y ?? 0),
  };

  const sourceLabelPosition = getEndpointLabelPosition(sourceEndpoint, sourceOutward);
  const targetLabelPosition = getEndpointLabelPosition(targetEndpoint, targetOutward);
  const sourceRolePosition = getEndpointLabelPosition(sourceEndpoint, sourceOutward, 26);
  const targetRolePosition = getEndpointLabelPosition(targetEndpoint, targetOutward, 26);
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
      <>
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
            <button
              type="button"
              className="association-multiplicity-value"
              aria-label={`Editar multiplicidad de ${end === 'source' ? 'origen' : 'destino'}`}
              title="Doble clic para editar un valor libre"
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  originalMultiplicityRef.current = value;
                  setEditingMultiplicity(end);
                }
              }}
            >
              {value || '…'}
            </button>
          )}
        </div>
        {selected && !isEditing && editingRole === null ? (
          <AssociationMultiplicityChips
            end={end}
            value={value}
            style={getMultiplicityChipsStyle({ x, y }, end === 'source' ? sourceOutward : targetOutward, chipsBounds)}
            onChange={(nextValue) => updateMultiplicity(end, nextValue)}
          />
        ) : null}
      </>
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
          className={`association-navigation-chevron${selected ? ' is-selected' : ''}`}
          d={getOpenChevronPath(sourceEndpoint, sourcePathOutward)}
        />
      ) : null}
      {hasTargetNavigationArrow ? (
        <path
          className={`association-navigation-chevron${selected ? ' is-selected' : ''}`}
          d={getOpenChevronPath(targetEndpoint, targetPathOutward)}
        />
      ) : null}
      {hasDependencyArrow ? (
        <path
          className={`association-navigation-chevron${selected ? ' is-selected' : ''}`}
          d={getOpenChevronPath(targetEndpoint, targetPathOutward)}
        />
      ) : null}
      {relationType === 'generalization' ? (
        <polygon
          className={`association-uml-marker association-uml-marker-open${selected ? ' is-selected' : ''}`}
          points={getTrianglePoints(markerEndpoint, markerOutward)}
        />
      ) : null}
      {relationType === 'realization' ? (
        <polygon
          className={`association-uml-marker association-uml-marker-open${selected ? ' is-selected' : ''}`}
          points={getTrianglePoints(markerEndpoint, markerOutward)}
        />
      ) : null}
      {relationType === 'aggregation' || relationType === 'composition' ? (
        <polygon
          className={`association-uml-marker ${
            relationType === 'composition' ? 'association-uml-marker-filled' : 'association-uml-marker-open'
          }${selected ? ' is-selected' : ''}`}
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
              x={sourceRolePosition.x} y={sourceRolePosition.y} className="association-role-label"
              onEditingChange={editing => setEditingRole(editing ? 'source' : null)}
              onCommit={sourceRole => edgeData.onUpdateLabel?.(id, { sourceRole })} />
            <AssociationTextLabel value={edgeData.targetRole} placeholder="Rol de destino"
              x={targetRolePosition.x} y={targetRolePosition.y} className="association-role-label"
              onEditingChange={editing => setEditingRole(editing ? 'target' : null)}
              onCommit={targetRole => edgeData.onUpdateLabel?.(id, { targetRole })} />
          </> : null}
        </> : null}
        {supportsEndpoints
          ? renderMultiplicity('source', edgeData.sourceMultiplicity, sourceLabelPosition.x, sourceLabelPosition.y)
          : null}
        {supportsEndpoints
          ? renderMultiplicity('target', edgeData.targetMultiplicity, targetLabelPosition.x, targetLabelPosition.y)
          : null}
        {selected ? (
          <AssociationLineStyleToolbar
            edgeId={id}
            lineStyle={lineStyle}
            style={{
              ...edgeLabelStyle,
              left: toolbarPosition.x + (horizontal ? 0 : 18),
              top: toolbarPosition.y - 18,
              transform: horizontal ? 'translate(-50%, -100%)' : 'translateY(-100%)',
            }}
            onUpdateAssociation={edgeData.onUpdateAssociation}
          />
        ) : null}
      </EdgeLabelRenderer>
    </>
  );
}
