import type { ArtifactNotebook } from '../../types/diagram';

export type NotebookSheetProps = {
  /** Shown small under the title. */
  artifactName: string;
  notebook: ArtifactNotebook | undefined;
  /**
   * Hands the latest notebook to the project. Text and strokes are batched
   * (~400 ms); checkboxes and added or removed blocks commit at once; any
   * pending draft is flushed on blur and on unmount (the sheet is keyed by
   * artifact, so switching tabs flushes).
   */
  onCommit: (notebook: ArtifactNotebook | undefined) => void;
  onClose: () => void;
  /** Esc inside the sheet: focus goes back to the editor canvas, the sheet stays open. */
  onReturnFocus: () => void;
  /** CSS px. The sheet reports drags of its left edge; the owner clamps (280–520) and persists. */
  width: number;
  onWidthChange: (width: number) => void;
  /** The last save to localStorage failed: say so in the footer. */
  saveFailed: boolean;
  /** Increments whenever the sheet should take focus at its end (opened by shortcut or button). */
  focusRequest: number;
};

// Placeholder: replaced by the real sheet.
export function NotebookSheet({ artifactName, width }: NotebookSheetProps) {
  return (
    <aside aria-label={`Apuntes de ${artifactName}`} className="notebook-sheet" data-notebook="" role="complementary" style={{ width }} />
  );
}
