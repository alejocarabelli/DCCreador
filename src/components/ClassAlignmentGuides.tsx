import { useStore } from 'reactflow';

export function ClassAlignmentGuides({ movingIds }: { movingIds: string[] }) {
  const nodeInternals = useStore(state => state.nodeInternals);
  const transform = useStore(state => state.transform);
  if (movingIds.length === 0) return null;
  const selected = new Set(movingIds);
  const nodes = [...nodeInternals.values()].filter(node => node.type === 'classNode');
  const moving = nodes.filter(node => selected.has(node.id));
  const stationary = nodes.filter(node => !selected.has(node.id));
  const [tx, ty, zoom] = transform;
  const vertical = new Set<number>();
  const horizontal = new Set<number>();
  for (const node of moving) for (const other of stationary) {
    const anchors = (position: number, size: number) => [position, position + size / 2, position + size];
    const xs = anchors(node.position.x, node.width ?? 220);
    const ys = anchors(node.position.y, node.height ?? 100);
    for (const x of anchors(other.position.x, other.width ?? 220)) if (xs.some(value => Math.abs(value - x) * zoom <= 4)) vertical.add(x);
    for (const y of anchors(other.position.y, other.height ?? 100)) if (ys.some(value => Math.abs(value - y) * zoom <= 4)) horizontal.add(y);
  }
  return <svg className="class-alignment-guides" aria-hidden="true">
    {[...vertical].map(x => <line key={`x:${x}`} x1={x * zoom + tx} x2={x * zoom + tx} y1="0" y2="100%" />)}
    {[...horizontal].map(y => <line key={`y:${y}`} y1={y * zoom + ty} y2={y * zoom + ty} x1="0" x2="100%" />)}
  </svg>;
}
