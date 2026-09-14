import { routeAroundObstacles, segmentCrossesObstacle, type RoutingObstacle } from './obstacleRouting';
import {
  getSmoothStepPath,
  getStraightPath,
  Position,
  type Node,
  type XYPosition,
} from 'reactflow';
import type {
  AssociationConnectionSide,
  AssociationLineStyle,
  ClassDiagramEdge,
  ConnectionSide,
  ParametricValuesNoteHandle,
} from '../types/diagram';
import { resolveAssociationLineStyle, type ResolvedAssociationLineStyle } from './association';

type NodeGeometry = Pick<Node, 'position' | 'width' | 'height'>;

export type AssociationHandleResolution = {
  sourceHandle: string;
  sourceSide: ConnectionSide;
  targetHandle: string;
  targetSide: ConnectionSide;
};

export type AssociationPathInput = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  lineStyle?: AssociationLineStyle;
  obstacles?: RoutingObstacle[];
};

export type AssociationPathResolution = {
  path: string;
  style: ResolvedAssociationLineStyle;
  labelX: number;
  labelY: number;
};

export type AssociationLabelPosition = {
  x: number;
  y: number;
};

const SIDE_TO_POSITION: Record<ConnectionSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

const OPPOSITE_SIDE: Record<ConnectionSide, ConnectionSide> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
};

const getDimensions = (node: NodeGeometry): { width: number; height: number } => ({
  width: typeof node.width === 'number' && node.width > 0 ? node.width : 220,
  height: typeof node.height === 'number' && node.height > 0 ? node.height : 100,
});

export const getNodeCenter = (node: NodeGeometry): XYPosition => {
  const { width, height } = getDimensions(node);
  return { x: node.position.x + width / 2, y: node.position.y + height / 2 };
};

const getAutomaticSides = (
  source: NodeGeometry,
  target: NodeGeometry,
): { sourceSide: ConnectionSide; targetSide: ConnectionSide } => {
  const sourceCenter = getNodeCenter(source);
  const targetCenter = getNodeCenter(target);
  const deltaX = targetCenter.x - sourceCenter.x;
  const deltaY = targetCenter.y - sourceCenter.y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    const sourceSide: ConnectionSide = deltaX >= 0 ? 'right' : 'left';
    return { sourceSide, targetSide: OPPOSITE_SIDE[sourceSide] };
  }

  const sourceSide: ConnectionSide = deltaY >= 0 ? 'bottom' : 'top';
  return { sourceSide, targetSide: OPPOSITE_SIDE[sourceSide] };
};

const getHandleSlot = (
  side: ConnectionSide,
  node: NodeGeometry,
  oppositeCenter: XYPosition,
): 'start' | 'center' | 'end' => {
  const center = getNodeCenter(node);
  const { width, height } = getDimensions(node);
  const isHorizontalSide = side === 'top' || side === 'bottom';
  const delta = isHorizontalSide ? oppositeCenter.x - center.x : oppositeCenter.y - center.y;
  const threshold = (isHorizontalSide ? width : height) * 0.18;

  if (delta < -threshold) {
    return 'start';
  }

  if (delta > threshold) {
    return 'end';
  }

  return 'center';
};

const toHandleId = (side: ConnectionSide, slot: 'start' | 'center' | 'end'): string =>
  slot === 'center' ? side : `${side}-${slot}`;

const normalizeManualSide = (side: AssociationConnectionSide | undefined): ConnectionSide | null =>
  side !== undefined && side !== 'automatic' ? side : null;

export const resolveAssociationHandles = (
  edge: ClassDiagramEdge,
  source: NodeGeometry,
  target: NodeGeometry,
): AssociationHandleResolution => {
  const sourceManualSide = normalizeManualSide(edge.data?.sourceSide);
  const targetManualSide = normalizeManualSide(edge.data?.targetSide);
  const automaticSides = getAutomaticSides(source, target);
  const sourceSide =
    sourceManualSide ?? (targetManualSide !== null ? OPPOSITE_SIDE[targetManualSide] : automaticSides.sourceSide);
  const targetSide =
    targetManualSide ?? (sourceManualSide !== null ? OPPOSITE_SIDE[sourceManualSide] : automaticSides.targetSide);
  const sourceSlot = sourceManualSide === null
    ? getHandleSlot(sourceSide, source, getNodeCenter(target))
    : 'center';
  const targetSlot = targetManualSide === null
    ? getHandleSlot(targetSide, target, getNodeCenter(source))
    : 'center';

  return {
    sourceHandle: toHandleId(sourceSide, sourceSlot),
    sourceSide,
    targetHandle: toHandleId(targetSide, targetSlot),
    targetSide,
  };
};

export const resolveAutomaticNoteHandles = (
  classNode: NodeGeometry,
  noteNode: NodeGeometry,
): { sourceHandle: ParametricValuesNoteHandle; targetHandle: ParametricValuesNoteHandle } => {
  const { sourceSide, targetSide } = getAutomaticSides(classNode, noteNode);
  return { sourceHandle: sourceSide, targetHandle: targetSide };
};

export const getConnectionSideFromHandle = (handleId: string | null | undefined): ConnectionSide | null => {
  const side = handleId?.split('-')[0];
  return side === 'top' || side === 'right' || side === 'bottom' || side === 'left' ? side : null;
};

export const getPositionForConnectionSide = (side: ConnectionSide): Position => SIDE_TO_POSITION[side];

export const buildAssociationPath = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  lineStyle,
  obstacles = [],
}: AssociationPathInput): AssociationPathResolution => {
  const style = resolveAssociationLineStyle(lineStyle, targetX - sourceX, targetY - sourceY);
  const pathParams = {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  };
  const [path, labelX, labelY] = style === 'straight'
    ? getStraightPath(pathParams)
    : getSmoothStepPath({ ...pathParams, borderRadius: 0, offset: 24 });

  if (lineStyle !== 'straight' && obstacles.length > 0) {
    const source = { x: sourceX, y: sourceY };
    const target = { x: targetX, y: targetY };
    const direction = (position: Position): XYPosition => ({
      x: position === Position.Right ? 1 : position === Position.Left ? -1 : 0,
      y: position === Position.Bottom ? 1 : position === Position.Top ? -1 : 0,
    });
    if (style !== 'straight' || obstacles.some(rect => segmentCrossesObstacle(source, target, rect))) {
      const points = routeAroundObstacles(source, target, direction(sourcePosition), direction(targetPosition), obstacles);
      if (points !== null) {
        let longest = 0;
        let center = { x: labelX, y: labelY };
        for (let index = 1; index < points.length; index += 1) {
          const a = points[index - 1];
          const b = points[index];
          const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
          if (length > longest) { longest = length; center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
        }
        return {
          path: points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' '),
          style: 'orthogonal', labelX: center.x, labelY: center.y,
        };
      }
    }
  }
  return { path, style, labelX, labelY };
};

export const getAssociationCenterLabelPosition = (
  labelX: number,
  labelY: number,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  offset = 14,
): AssociationLabelPosition => {
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return { x: labelX, y: labelY - offset };
  }

  return { x: labelX + offset, y: labelY };
};

export const oppositeConnectionSide = (side: ConnectionSide): ConnectionSide => OPPOSITE_SIDE[side];
