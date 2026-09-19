export type SequencePointerPosition = {
  clientX: number;
  clientY: number;
};

export type SequencePointerViewport = {
  left: number;
  top: number;
};

/**
 * Converts a browser pointer position to diagram coordinates.  The current
 * SVG rect already includes scroll displacement; dividing by the active zoom
 * keeps the same gesture in the same canvas position at every supported zoom.
 */
export const sequencePointerToCanvas = (
  pointer: SequencePointerPosition,
  viewport: SequencePointerViewport,
  zoom: number,
): { x: number; y: number } => {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return {
    x: (pointer.clientX - viewport.left) / safeZoom,
    y: (pointer.clientY - viewport.top) / safeZoom,
  };
};
