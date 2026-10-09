/**
 * Geometry helpers for the sequence canvas viewport.
 *
 * Viewport state is intentionally kept outside SequenceDiagramContent. These
 * helpers make that boundary explicit and keep pan/zoom/edge expansion from
 * becoming document history entries.
 */

export type SequenceViewportTarget = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SequenceViewportScroll = {
  left: number;
  top: number;
};

export type SequenceViewportExpansion = {
  width: number;
  height: number;
  expanded: boolean;
};

export const centerSequenceViewportOnTarget = ({
  target,
  viewportWidth,
  viewportHeight,
  zoom,
  padding = 40,
}: {
  target: SequenceViewportTarget;
  viewportWidth: number;
  viewportHeight: number;
  zoom: number;
  padding?: number;
}): SequenceViewportScroll => {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const safeViewportWidth = Math.max(0, viewportWidth - padding * 2);
  const safeViewportHeight = Math.max(0, viewportHeight - padding * 2);
  const targetCenterX = (target.x + target.width / 2) * safeZoom;
  const targetCenterY = (target.y + target.height / 2) * safeZoom;
  return {
    left: Math.max(0, targetCenterX - safeViewportWidth / 2),
    top: Math.max(0, targetCenterY - safeViewportHeight / 2),
  };
};

export const sequenceMinZoom = 0.3;

/**
 * Zoom that makes the diagram bounds fit the view entirely: never above 100%
 * and never below the editor minimum. Returns 1 when it already fits.
 */
export const fitSequenceZoomToView = ({
  viewportWidth,
  viewportHeight,
  bounds,
  padding = 40,
}: {
  viewportWidth: number;
  viewportHeight: number;
  bounds: { width: number; height: number };
  padding?: number;
}): number => {
  const availableWidth = viewportWidth - padding;
  const availableHeight = viewportHeight - padding;
  const contentWidth = bounds.width + padding * 2;
  const contentHeight = bounds.height + padding * 2;
  if (availableWidth <= 0 || availableHeight <= 0 || contentWidth <= 0 || contentHeight <= 0) return 1;
  const fit = Math.min(availableWidth / contentWidth, availableHeight / contentHeight);
  return Math.max(sequenceMinZoom, Math.min(1, Math.floor(fit * 100) / 100));
};

export const expandSequenceViewportAtEdge = ({
  currentWidth,
  currentHeight,
  scrollWidth,
  scrollHeight,
  scrollLeft,
  scrollTop,
  clientWidth,
  clientHeight,
  threshold = 120,
  amount = 1200,
}: {
  currentWidth: number;
  currentHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  scrollLeft: number;
  scrollTop: number;
  clientWidth: number;
  clientHeight: number;
  threshold?: number;
  amount?: number;
}): SequenceViewportExpansion => {
  const nearRight = scrollWidth - scrollLeft - clientWidth < threshold;
  const nearBottom = scrollHeight - scrollTop - clientHeight < threshold;
  return {
    width: nearRight ? currentWidth + amount : currentWidth,
    height: nearBottom ? currentHeight + amount : currentHeight,
    expanded: nearRight || nearBottom,
  };
};
