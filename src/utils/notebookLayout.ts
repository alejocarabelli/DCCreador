/**
 * Layout contract 2 (DESIGN.md): the canvas is never a residual column. The
 * Apuntes sheet pushes the editor only while the editor keeps its canvas plus
 * its own side panels; otherwise it overlays.
 */
const MIN_CANVAS_WIDTH = 480;

type ArtifactKind = 'class-diagram' | 'class-sequence-diagram' | 'use-case-model' | 'use-case-flow' | 'sequence-diagram';

/**
 * Narrowest editor width that still gives the canvas MIN_CANVAS_WIDTH next to
 * the panels the editor can show at the same time:
 * - class / use-case model: 480 + 304 inspector.
 * - use-case flow: 480 document + 340 review column.
 * - sequence: 224 outline + 480 canvas + 320 inspector (its default width).
 */
export const EDITOR_MIN_WIDTH: Record<ArtifactKind, number> = {
  'class-diagram': MIN_CANVAS_WIDTH + 304,
  'class-sequence-diagram': MIN_CANVAS_WIDTH + 304,
  'use-case-model': MIN_CANVAS_WIDTH + 304,
  'use-case-flow': MIN_CANVAS_WIDTH + 340,
  'sequence-diagram': 224 + MIN_CANVAS_WIDTH + 320,
};

/** True when pushing the editor by `sheetWidth` would leave it under its minimum. */
export const shouldOverlayNotebook = (workspaceWidth: number, sheetWidth: number, editorMinWidth: number): boolean =>
  workspaceWidth - sheetWidth < editorMinWidth;
