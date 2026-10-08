import { useId, type KeyboardEvent } from 'react';
import { Trash2 } from 'lucide-react';
import type { NotebookBlock, SketchShape } from '../../types/diagram';
import { NotebookSketch } from './NotebookSketch';
import { NotebookTextField } from './NotebookTextField';

export type NotebookBlockViewProps = {
  block: NotebookBlock;
  notebookPoints: number;
  confirming: boolean;
  /** False for the lone empty text block: deleting it would change nothing. */
  canDelete: boolean;
  registerElement: (id: string, element: HTMLElement | SVGElement | null) => void;
  onTextChange: (block: NotebookBlock, value: string, caret: number) => void;
  onTextKeyDown: (block: NotebookBlock, event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onResolvedChange: (id: string, resolved: boolean) => void;
  /** Empty blocks go at once; the sheet asks for confirmation on the rest. */
  onRequestDelete: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: (id: string) => void;
  onSketchChange: (id: string, shapes: SketchShape[]) => void;
  onSketchHeight: (id: string, height: number, final: boolean) => void;
};

const CONFIRM_COPY: Record<NotebookBlock['kind'], string> = {
  text: '¿Borrar este texto?',
  question: '¿Borrar esta duda?',
  sketch: '¿Borrar este boceto?',
};

export function NotebookBlockView({
  block,
  notebookPoints,
  confirming,
  canDelete,
  registerElement,
  onTextChange,
  onTextKeyDown,
  onResolvedChange,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onSketchChange,
  onSketchHeight,
}: NotebookBlockViewProps) {
  const confirmId = useId();

  const deleteButton = (
    <button
      aria-label="Borrar bloque"
      className="notebook-block-delete"
      title="Borrar bloque"
      type="button"
      onClick={() => onRequestDelete(block.id)}
    >
      <Trash2 aria-hidden="true" size={14} />
    </button>
  );

  return (
    <div className={`notebook-block notebook-block-${block.kind}${block.kind === 'question' && block.resolved ? ' is-resolved' : ''}`} data-block-kind={block.kind}>
      {block.kind === 'sketch' ? (
        <NotebookSketch
          block={block}
          notebookPoints={notebookPoints}
          surfaceRef={(element) => registerElement(block.id, element)}
          onChange={(shapes) => onSketchChange(block.id, shapes)}
          onHeightChange={(height, final) => onSketchHeight(block.id, height, final)}
        />
      ) : (
        <div className="notebook-line">
          {block.kind === 'question' ? (
            <input
              aria-label="Duda resuelta"
              checked={block.resolved}
              className="notebook-check"
              type="checkbox"
              onChange={(event) => onResolvedChange(block.id, event.currentTarget.checked)}
            />
          ) : null}
          <NotebookTextField
            aria-label={block.kind === 'question' ? 'Duda' : 'Texto'}
            className="notebook-field"
            fieldRef={(element) => registerElement(block.id, element)}
            placeholder={block.kind === 'question' ? '¿Qué duda tenés?' : 'Escribí algo…'}
            value={block.text}
            onChange={(event) => onTextChange(block, event.currentTarget.value, event.currentTarget.selectionStart)}
            onKeyDown={(event) => onTextKeyDown(block, event)}
          />
        </div>
      )}
      {canDelete ? deleteButton : null}
      {confirming ? (
        <div
          aria-labelledby={confirmId}
          className="notebook-confirm"
          role="group"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            onCancelDelete(block.id);
          }}
        >
          <span id={confirmId}>{CONFIRM_COPY[block.kind]}</span>
          <button className="notebook-confirm-delete" type="button" onClick={() => onConfirmDelete(block.id)}>Borrar</button>
          <button autoFocus className="notebook-confirm-cancel" type="button" onClick={() => onCancelDelete(block.id)}>Cancelar</button>
        </div>
      ) : null}
    </div>
  );
}
