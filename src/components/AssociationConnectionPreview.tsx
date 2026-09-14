import type { ConnectionLineComponentProps } from 'reactflow';
import { buildAssociationPath } from '../utils/associationRouting';

export function AssociationConnectionPreview({
  connectionLineStyle,
  fromPosition,
  fromX,
  fromY,
  toPosition,
  toX,
  toY,
}: ConnectionLineComponentProps) {
  const { path } = buildAssociationPath({
    sourceX: fromX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY,
    sourcePosition: fromPosition,
    targetPosition: toPosition,
    lineStyle: 'automatic',
  });

  return (
    <g className="association-connection-preview">
      <path className="association-connection-preview-halo" d={path} />
      <path d={path} style={connectionLineStyle} />
    </g>
  );
}
