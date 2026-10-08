import { getBoundsOfRects, type Rect } from 'reactflow';

type ExportViewport = Pick<HTMLElement, 'getBoundingClientRect' | 'querySelectorAll'>;

/** Include rendered labels and edge geometry, even outside the node bounds. */
export const getDiagramImageExportBounds = (viewport: ExportViewport, nodeBounds: Rect, zoom: number): Rect => {
  if (!Number.isFinite(zoom) || zoom <= 0) return nodeBounds;
  const origin = viewport.getBoundingClientRect();
  const elements = viewport.querySelectorAll(
    '.react-flow__node, .react-flow__edges path:not(.react-flow__edge-interaction):not(.association-edge-hit-area), '
    + '.react-flow__edges polygon, .association-label:not([data-empty="true"]), .use-case-edge-label',
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

/** Blank margin around the diagram in exported images and PDFs, in diagram pixels. */
const CAPTURE_PADDING = 40;
/** Enough for a sharp print; 3× of a typical diagram stays far below the cap. */
const TARGET_PIXEL_RATIO = 3;
/** WebKit refuses canvases much past this area, so very large diagrams get fewer pixels per point. */
const MAX_CAPTURE_PIXELS = 36_000_000;
const MAX_CAPTURE_EDGE = 16_384;

/** Acrobat refuses page sides past 200 inches; a larger diagram gets a page scaled down to fit. */
const MAX_PDF_PAGE_POINTS = 14_400;

export type DiagramCapturePlan = {
  /** Size of the captured area at zoom 1. */
  width: number;
  height: number;
  /** PDF page in points: the diagram's own size, unless that passes Acrobat's limit. */
  pageWidth: number;
  pageHeight: number;
  /** Translation that brings the diagram's top-left corner to the padding. */
  x: number;
  y: number;
  pixelRatio: number;
  imageWidth: number;
  imageHeight: number;
};

export const planDiagramCapture = (bounds: Rect): DiagramCapturePlan => {
  const width = Math.max(1, Math.ceil(bounds.width + CAPTURE_PADDING * 2));
  const height = Math.max(1, Math.ceil(bounds.height + CAPTURE_PADDING * 2));
  const pixelRatio = Math.min(
    TARGET_PIXEL_RATIO,
    Math.sqrt(MAX_CAPTURE_PIXELS / (width * height)),
    MAX_CAPTURE_EDGE / Math.max(width, height),
  );
  const pageScale = Math.min(1, MAX_PDF_PAGE_POINTS / Math.max(width, height));
  return {
    width,
    height,
    pageWidth: Math.round(width * pageScale),
    pageHeight: Math.round(height * pageScale),
    x: Math.round(CAPTURE_PADDING - bounds.x),
    y: Math.round(CAPTURE_PADDING - bounds.y),
    pixelRatio,
    imageWidth: Math.floor(width * pixelRatio),
    imageHeight: Math.floor(height * pixelRatio),
  };
};
