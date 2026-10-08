/**
 * Layout contract 2 (DESIGN.md): the canvas is never a residual column. The
 * Apuntes sheet pushes the editor only while the editor stays at least as wide
 * as it already is in the narrowest supported window (900px minus the 240px
 * sidebar): every editor and its inspector or review panel already work there.
 * Narrower than that, the sheet floats over the editor instead.
 */
export const MIN_PUSHED_EDITOR_WIDTH = 900 - 240;

/** True when pushing the editor by `sheetWidth` would leave it narrower than it ever gets today. */
export const shouldOverlayNotebook = (workspaceWidth: number, sheetWidth: number): boolean =>
  workspaceWidth - sheetWidth < MIN_PUSHED_EDITOR_WIDTH;
