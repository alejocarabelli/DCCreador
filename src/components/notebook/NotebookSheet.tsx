import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Plus, X } from 'lucide-react';
import type { ArtifactNotebook, NotebookBlock, SketchShape } from '../../types/diagram';
import { countNotebookPoints, countResolvedQuestions } from '../../utils/artifactNotebook';
import { ToolButton } from '../ui/Toolbar';
import { NotebookBlockView } from './NotebookBlockView';
import {
  appendBlock,
  backspaceAtStart,
  changeText,
  enterInQuestion,
  focusSheetEnd,
  hasOnlyEmptyText,
  notebookKey,
  removeBlock,
  setResolved,
  setSketchHeight,
  setSketchShapes,
  toNotebook,
  type BlockEdit,
  type FocusTarget,
} from './notebookBlocks';

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

const MIN_WIDTH = 280;
const MAX_WIDTH = 520;
const WIDTH_KEY_STEP = 20;
const COMMIT_DELAY = 400;

const clampWidth = (value: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));

/** Empty space inside the body: not a block, control or text. */
const isEmptySpace = (target: EventTarget | null) =>
  target instanceof HTMLElement && target.closest('.notebook-block, button, input, textarea, label, a') === null;

export function NotebookSheet({
  artifactName,
  notebook,
  onCommit,
  onClose,
  onReturnFocus,
  width,
  onWidthChange,
  saveFailed,
  focusRequest,
}: NotebookSheetProps) {
  // The draft is the source of truth while mounted; the project only receives
  // `toNotebook(draft)` (trailing empty scaffolding is never stored).
  const [blocks, setBlocks] = useState<NotebookBlock[]>(() => notebook?.blocks ?? []);
  const [dirty, setDirty] = useState(false);
  const [seenNotebook, setSeenNotebook] = useState(notebook);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [hideResolved, setHideResolved] = useState(false);

  const blocksRef = useRef(blocks);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const committedKeyRef = useRef(notebookKey(notebook));
  const onCommitRef = useRef(onCommit);
  const elementsRef = useRef(new Map<string, HTMLElement | SVGElement>());
  const pendingFocusRef = useRef<FocusTarget | null>(null);
  const emptyPointerDownRef = useRef(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    onCommitRef.current = onCommit;
    blocksRef.current = blocks;
  });

  // What the project holds now, so an unchanged draft is never committed twice.
  useEffect(() => {
    committedKeyRef.current = notebookKey(notebook);
  }, [notebook]);

  // An import or another window replaced the notebook and nothing is pending:
  // adopt it. Our own commits come back equal and change nothing.
  if (notebook !== seenNotebook) {
    setSeenNotebook(notebook);
    if (!dirty && notebookKey(notebook) !== notebookKey(toNotebook(blocks))) {
      setBlocks(notebook?.blocks ?? []);
    }
  }

  const flush = useCallback(() => {
    window.clearTimeout(timerRef.current);
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setDirty(false);
    const next = toNotebook(blocksRef.current);
    const key = notebookKey(next);
    if (key === committedKeyRef.current) return;
    committedKeyRef.current = key;
    onCommitRef.current(next);
  }, []);

  useEffect(() => flush, [flush]);

  /** Applies an edit to the draft; `now` commits at once, otherwise ~400 ms later. */
  const apply = useCallback(
    (edit: BlockEdit | NotebookBlock[], mode: 'now' | 'later') => {
      const edited = Array.isArray(edit) ? { blocks: edit } : edit;
      blocksRef.current = edited.blocks;
      setBlocks(edited.blocks);
      if (edited.focus !== undefined) pendingFocusRef.current = edited.focus;
      dirtyRef.current = true;
      setDirty(true);
      window.clearTimeout(timerRef.current);
      if (mode === 'now') flush();
      else timerRef.current = window.setTimeout(flush, COMMIT_DELAY);
    },
    [flush],
  );

  // Moves focus once the block it targets is in the DOM.
  useLayoutEffect(() => {
    const target = pendingFocusRef.current;
    if (target === null) return;
    const element = elementsRef.current.get(target.id);
    if (element === undefined) return;
    pendingFocusRef.current = null;
    element.focus();
    if (element instanceof HTMLTextAreaElement) {
      const caret = target.caret === 'end' ? element.value.length : target.caret === 'start' ? 0 : target.caret;
      element.setSelectionRange(caret, caret);
    }
  });

  const registerElement = useCallback((id: string, element: HTMLElement | SVGElement | null) => {
    if (element === null) elementsRef.current.delete(id);
    else elementsRef.current.set(id, element);
  }, []);

  const focusEnd = useCallback(
    (reuseLastQuestion: boolean) => {
      const edit = focusSheetEnd(blocksRef.current, reuseLastQuestion);
      if (edit.blocks === blocksRef.current && edit.focus !== undefined) {
        const element = elementsRef.current.get(edit.focus.id);
        if (element instanceof HTMLTextAreaElement) {
          element.focus();
          element.setSelectionRange(element.value.length, element.value.length);
          return;
        }
      }
      // Appending scaffolding is not a change worth committing.
      blocksRef.current = edit.blocks;
      setBlocks(edit.blocks);
      pendingFocusRef.current = edit.focus ?? null;
    },
    [],
  );

  // Opened by shortcut or button: caret at the end of the notebook.
  const focusOnRequest = useEffectEvent(() => focusEnd(true));
  useEffect(() => {
    if (focusRequest > 0) focusOnRequest();
  }, [focusRequest]);

  const handleBlur = (event: ReactFocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) flush();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onReturnFocus();
  };

  const handleTextChange = (block: NotebookBlock, value: string, caret: number) => {
    const edit = changeText(blocksRef.current, block.id, value, caret);
    apply(edit, edit.focus !== undefined ? 'now' : 'later');
  };

  const handleTextKeyDown = (block: NotebookBlock, event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    const field = event.currentTarget;
    const plain = !event.altKey && !event.ctrlKey && !event.metaKey;

    if (block.kind === 'question' && event.key === 'Enter') {
      event.preventDefault();
      if (plain && !event.shiftKey) {
        apply(enterInQuestion(blocksRef.current, block.id, field.selectionStart, field.selectionEnd), 'now');
      }
      return;
    }

    if (event.key === 'Backspace' && plain && !event.shiftKey && field.selectionStart === 0 && field.selectionEnd === 0) {
      const edit = backspaceAtStart(blocksRef.current, block.id);
      if (edit !== null) {
        event.preventDefault();
        apply(edit, 'now');
      }
    }
  };

  const handleResolvedChange = (id: string, resolved: boolean) => {
    const next = setResolved(blocksRef.current, id, resolved);
    let focus: FocusTarget | undefined;
    if (hideResolved && resolved) {
      // The checked doubt disappears: keep the caret where the user is working.
      const index = next.findIndex((block) => block.id === id);
      const around = [...next.slice(index + 1), ...next.slice(0, index).reverse()].find(
        (block) => !(block.kind === 'question' && block.resolved),
      );
      if (around !== undefined) focus = { id: around.id, caret: 'end' };
    }
    apply({ blocks: next, focus }, 'now');
  };

  const handleRequestDelete = (id: string) => {
    const block = blocksRef.current.find((entry) => entry.id === id);
    if (block === undefined) return;
    const empty = block.kind === 'sketch' ? block.shapes.length === 0 : block.text.trim().length === 0;
    if (empty) apply(removeBlock(blocksRef.current, id), 'now');
    else setConfirmId(id);
  };

  const handleConfirmDelete = (id: string) => {
    setConfirmId(null);
    apply(removeBlock(blocksRef.current, id), 'now');
  };

  const handleCancelDelete = (id: string) => {
    setConfirmId(null);
    pendingFocusRef.current = { id, caret: 'end' };
  };

  const handleSketchChange = (id: string, shapes: SketchShape[]) =>
    apply(setSketchShapes(blocksRef.current, id, shapes), 'later');

  const handleSketchHeight = (id: string, height: number, final: boolean) =>
    apply(setSketchHeight(blocksRef.current, id, height), final ? 'now' : 'later');

  const addBlock = (kind: 'question' | 'sketch') => apply(appendBlock(blocksRef.current, kind), 'now');

  const handleBodyPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    emptyPointerDownRef.current = isEmptySpace(event.target);
  };

  const handleBodyClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!emptyPointerDownRef.current || !isEmptySpace(event.target)) return;
    emptyPointerDownRef.current = false;
    focusEnd(false);
  };

  const handleResizeDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: width };
  };

  const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === null) return;
    // The sheet sits at the right: dragging its left edge leftwards widens it.
    const next = clampWidth(drag.startWidth + (drag.startX - event.clientX));
    if (next !== width) onWidthChange(next);
  };

  const handleResizeKey = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = width + WIDTH_KEY_STEP;
    else if (event.key === 'ArrowRight') next = width - WIDTH_KEY_STEP;
    else if (event.key === 'Home') next = MIN_WIDTH;
    else if (event.key === 'End') next = MAX_WIDTH;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    onWidthChange(clampWidth(next));
  };

  const resolvedCount = countResolvedQuestions({ version: 1, blocks });
  const hiding = hideResolved && resolvedCount > 0;
  const visibleBlocks = hiding ? blocks.filter((block) => !(block.kind === 'question' && block.resolved)) : blocks;
  const notebookPoints = countNotebookPoints({ version: 1, blocks });
  const showHint = hasOnlyEmptyText(blocks);

  return (
    <aside
      aria-label={`Apuntes de ${artifactName}`}
      className="notebook-sheet"
      data-notebook=""
      role="complementary"
      style={{ width }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <div
        aria-label="Ancho de los apuntes"
        aria-orientation="vertical"
        aria-valuemax={MAX_WIDTH}
        aria-valuemin={MIN_WIDTH}
        aria-valuenow={width}
        className="notebook-resize"
        role="separator"
        tabIndex={0}
        onKeyDown={handleResizeKey}
        onPointerCancel={() => { dragRef.current = null; }}
        onPointerDown={handleResizeDown}
        onPointerMove={handleResizeMove}
        onPointerUp={() => { dragRef.current = null; }}
      />
      <header className="notebook-header">
        <div className="notebook-heading">
          <h2 className="notebook-title">Apuntes</h2>
          <p className="notebook-artifact" title={artifactName}>{artifactName}</p>
        </div>
        {resolvedCount > 0 ? (
          <label className="notebook-hide-resolved">
            <input
              checked={hideResolved}
              className="notebook-check is-small"
              type="checkbox"
              onChange={(event) => setHideResolved(event.currentTarget.checked)}
            />
            <span>Ocultar resueltas</span>
          </label>
        ) : null}
        <ToolButton className="notebook-close" icon={X} label="Cerrar apuntes" onClick={onClose} />
      </header>

      <div
        className="notebook-body"
        tabIndex={-1}
        onClick={handleBodyClick}
        onPointerDown={handleBodyPointerDown}
      >
        <div className="notebook-blocks">
          {visibleBlocks.map((block) => (
            <NotebookBlockView
              block={block}
              canDelete={!(blocks.length === 1 && showHint)}
              confirming={confirmId === block.id}
              key={block.id}
              notebookPoints={notebookPoints}
              registerElement={registerElement}
              onCancelDelete={handleCancelDelete}
              onConfirmDelete={handleConfirmDelete}
              onRequestDelete={handleRequestDelete}
              onResolvedChange={handleResolvedChange}
              onSketchChange={handleSketchChange}
              onSketchHeight={handleSketchHeight}
              onTextChange={handleTextChange}
              onTextKeyDown={handleTextKeyDown}
            />
          ))}
        </div>
        {showHint ? <p className="notebook-empty-hint">Anotá dudas, ideas y bocetos mientras armás este diagrama.</p> : null}
        <div className="notebook-add" role="group" aria-label="Agregar a los apuntes">
          <button
            aria-label="Agregar duda"
            className="v2-tool has-label notebook-add-button"
            type="button"
            onClick={() => addBlock('question')}
          >
            <Plus aria-hidden="true" size={14} />
            <span className="v2-tool-label">Duda</span>
          </button>
          <button
            aria-label="Agregar boceto"
            className="v2-tool has-label notebook-add-button"
            type="button"
            onClick={() => addBlock('sketch')}
          >
            <Plus aria-hidden="true" size={14} />
            <span className="v2-tool-label">Boceto</span>
          </button>
        </div>
        <div className="notebook-tail" />
      </div>

      <footer className="notebook-footer">
        <p>Solo para vos: no se exporta.</p>
        <p className="notebook-footer-error" role="status">{saveFailed ? 'No se pudo guardar. Revisá el aviso de arriba.' : null}</p>
      </footer>
    </aside>
  );
}
