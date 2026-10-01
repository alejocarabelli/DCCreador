import { getBoundsOfRects, type Rect } from 'reactflow';

type ExportViewport = Pick<HTMLElement, 'getBoundingClientRect' | 'querySelectorAll'>;

/** Include rendered labels and edge geometry, even outside the node bounds. */
export const getDiagramImageExportBounds = (viewport: ExportViewport, nodeBounds: Rect, zoom: number): Rect => {
  if (!Number.isFinite(zoom) || zoom <= 0) return nodeBounds;
  const origin = viewport.getBoundingClientRect();
  const elements = viewport.querySelectorAll(
    '.react-flow__node, .react-flow__edges path:not(.react-flow__edge-interaction):not(.association-edge-hit-area), '
    + '.react-flow__edges polygon, .association-label:not([data-empty="true"])',
  );
  const bounds: Rect[] = [nodeBounds];
  elements.forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)
      || (rect.width === 0 && rect.height === 0)) return;
    bounds.push({
      x: (rect.left - origin.left) / zoom,
      y: (rect.top - origin.top) / zoom,
      width: rect.width / zoom,
      height: rect.height / zoom,
    });
  });
  return bounds.reduce((combined, rect) => getBoundsOfRects(combined, rect));
};
