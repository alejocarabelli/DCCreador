import { useCallback } from 'react';
import { BaseEdge, EdgeLabelRenderer, useStore, type EdgeProps, type ReactFlowState } from 'reactflow';
import type { UseCaseEdgeData, UseCaseNodeData } from '../types/diagram';
import { floatingEndpoints, type Box } from '../utils/useCaseGeometry';

const nodeBox = (state: ReactFlowState, id: string): { kind: UseCaseNodeData['kind'] | undefined; box: Box } | null => {
  const node = state.nodeInternals.get(id);
  if (!node?.width || !node.height) return null;
  const position = node.positionAbsolute ?? node.position;
  return {
    kind: (node.data as UseCaseNodeData | undefined)?.kind,
    box: { x: position.x, y: position.y, width: node.width, height: node.height },
  };
};

/**
 * A relation of the use case model. It floats: it runs between the centres
 * of the two shapes and is cut at their outlines (the ellipse, or the actor's
 * stick figure), so several relations of one actor fan out instead of leaving
 * from one fixed handle, and moving a node re-aims its lines.
 */
export function UseCaseRelationEdge({
  data,
  id,
  selected,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps<UseCaseEdgeData>) {
  const sourceNode = useStore(useCallback((state: ReactFlowState) => nodeBox(state, source), [source]));
  const targetNode = useStore(useCallback((state: ReactFlowState) => nodeBox(state, target), [target]));
  const ends = sourceNode && targetNode
    ? floatingEndpoints(sourceNode, targetNode)
    : { source: { x: sourceX, y: sourceY }, target: { x: targetX, y: targetY } };

  const relationType = data?.relationType ?? 'association';
  const edgePath = `M ${ends.source.x},${ends.source.y} L ${ends.target.x},${ends.target.y}`;
  const labelX = (ends.source.x + ends.target.x) / 2;
  const labelY = (ends.source.y + ends.target.y) / 2;
  const rawLabelAngle = (Math.atan2(ends.target.y - ends.source.y, ends.target.x - ends.source.x) * 180) / Math.PI;
  const readableLabelAngle = rawLabelAngle > 90 || rawLabelAngle < -90 ? rawLabelAngle + 180 : rawLabelAngle;
  const isDashed = relationType === 'include' || relationType === 'extend';
  const markerId = `${id}-${relationType}-marker`;
  const relationshipLabel =
    relationType === 'include' ? '«include»' : relationType === 'extend' ? '«extend»' : data?.label?.trim() ?? '';
  const edgeStyle = {
    stroke: selected ? 'var(--accent)' : 'var(--association-stroke, #222222)',
    strokeDasharray: isDashed ? '8 6' : undefined,
    strokeWidth: selected
      ? 'calc(var(--association-stroke-width, 1.6) + 0.8px)'
      : 'var(--association-stroke-width, 1.6)',
  };

  return (
    <>
      <defs>
        {relationType === 'generalization' ? (
          <marker id={markerId} markerHeight="14" markerWidth="16" orient="auto" refX="15" refY="7" viewBox="0 0 16 14">
            <path className="use-case-marker-fill" d="M1 1 15 7 1 13Z" />
          </marker>
        ) : null}
        {isDashed ? (
          <marker id={markerId} markerHeight="10" markerWidth="10" orient="auto" refX="9.5" refY="5" viewBox="0 0 10 10">
            <path className="use-case-marker-open" d="M1 1 9 5 1 9" />
          </marker>
        ) : null}
      </defs>
      <BaseEdge
        id={id}
        interactionWidth={18}
        markerEnd={relationType === 'association' ? undefined : `url(#${markerId})`}
        path={edgePath}
        style={edgeStyle}
      />
      {relationshipLabel.length > 0 ? (
        <EdgeLabelRenderer>
          <div
            className={`use-case-edge-label nodrag nopan ${selected ? 'is-selected' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) rotate(${readableLabelAngle}deg)` }}
          >
            {relationshipLabel}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
