import { useEffect, type RefObject } from 'react';
import type { ReactFlowInstance } from 'reactflow';

// Each Ctrl + wheel event zooms by at most this power of two (~23 %).
const MAX_STEP = 0.3;
const SENSITIVITY = 0.02;

/**
 * With `panOnScroll`, React Flow zooms on Ctrl + wheel with the same strength
 * it uses for trackpad pinches, so one notch of a mouse wheel doubles or
 * halves the zoom. This takes over Ctrl + wheel and caps each step: pinches
 * (small deltas) feel the same, mouse notches become gentle.
 */
export function useGentleWheelZoom(
  containerRef: RefObject<HTMLElement | null>,
  instance: ReactFlowInstance | null,
  minZoom = 0.5,
  maxZoom = 2,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (container === null || instance === null) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const flow = event.target instanceof Element ? event.target.closest('.react-flow') : null;
      if (flow === null) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaMode === 1 ? event.deltaY * 40 : event.deltaY;
      const exponent = Math.max(-MAX_STEP, Math.min(MAX_STEP, -delta * SENSITIVITY));
      const { x, y, zoom } = instance.getViewport();
      const nextZoom = Math.max(minZoom, Math.min(maxZoom, zoom * 2 ** exponent));
      if (nextZoom === zoom) return;
      const bounds = flow.getBoundingClientRect();
      const pointerX = event.clientX - bounds.left;
      const pointerY = event.clientY - bounds.top;
      const ratio = nextZoom / zoom;
      void instance.setViewport({
        x: pointerX - (pointerX - x) * ratio,
        y: pointerY - (pointerY - y) * ratio,
        zoom: nextZoom,
      });
    };
    container.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => container.removeEventListener('wheel', handleWheel, { capture: true });
  }, [containerRef, instance, minZoom, maxZoom]);
}
