import { BaseEdge, EdgeLabelRenderer, getStraightPath, type EdgeProps } from 'reactflow';
import type { UseCaseEdgeData } from '../types/diagram';

export function UseCaseRelationEdge({
  data,
  id,
  markerEnd,
  selected,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps<UseCaseEdgeData>) {
  const relationType = data?.relationType ?? 'association';
  const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const rawLabelAngle = (Math.atan2(targetY - sourceY, targetX - sourceX) * 180) / Math.PI;
  const readableLabelAngle =
    rawLabelAngle > 90 || rawLabelAngle < -90 ? rawLabelAngle + 180 : rawLabelAngle;
  const isDashed = relationType === 'include' || relationType === 'extend';
  const markerId = `${id}-${relationType}-marker`;
  const relationshipLabel =
    relationType === 'include' ? '«include»' : relationType === 'extend' ? '«extend»' : data?.label?.trim() ?? '';
  const customMarkerEnd =
    relationType === 'association'
      ? markerEnd
      : relationType === 'generalization'
        ? `url(#${markerId})`
        : `url(#${markerId})`;
  const edgeStyle = {
    stroke: selected ? 'var(--association-stroke-selected, #000000)' : 'var(--association-stroke, #222222)',
    strokeDasharray: isDashed ? '10 8' : undefined,
    strokeWidth: selected
      ? 'calc(var(--association-stroke-width, 1.6) + 0.6px)'
      : 'var(--association-stroke-width, 1.6)',
  };

  return (
    <>
      <defs>
        {relationType === 'generalization' ? (
          <marker
            id={markerId}
            markerHeight="14"
            markerWidth="16"
            orient="auto"
            refX="14"
            refY="7"
            viewBox="0 0 16 14"
          >
            <path className="use-case-marker-fill" d="M1 1 15 7 1 13Z" />
          </marker>
        ) : null}
        {relationType === 'include' || relationType === 'extend' ? (
          <marker
            id={markerId}
            markerHeight="10"
            markerWidth="10"
            orient="auto"
            refX="9"
            refY="5"
            viewBox="0 0 10 10"
          >
            <path className="use-case-marker-open" d="M1 1 9 5 1 9" />
          </marker>
        ) : null}
      </defs>
      <BaseEdge
        id={id}
        markerEnd={customMarkerEnd}
        path={edgePath}
        style={edgeStyle}
      />
      {relationshipLabel.length > 0 ? (
        <EdgeLabelRenderer>
          <div
            className="use-case-edge-label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) rotate(${readableLabelAngle}deg) translateY(-10px)`,
            }}
          >
            {relationshipLabel}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
