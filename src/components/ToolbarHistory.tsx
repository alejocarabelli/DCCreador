import { AlertCircle, Check, Redo2, Undo2 } from 'lucide-react';
import type { DiagramSaveStatus } from '../hooks/useProjects';

type ToolbarHistoryProps = {
  canRedo: boolean;
  canUndo: boolean;
  saveStatus: DiagramSaveStatus;
  onRedo: () => void;
  onUndo: () => void;
  /** Lets an editor close its open toolbar menus before the history changes. */
  onBeforeAction?: () => void;
};

/**
 * First group of every editor toolbar: whether the work is safe, and the way
 * back. It sits in the same place in all four editors so the hand learns it once.
 */
export function ToolbarHistory({ canRedo, canUndo, saveStatus, onRedo, onUndo, onBeforeAction }: ToolbarHistoryProps) {
  return (
    <div className="toolbar-group toolbar-history-group">
      <div
        aria-live="polite"
        className={`toolbar-save-status sequence-save-status sequence-save-${saveStatus}`}
        data-testid="sequence-save-status"
        role="status"
        title={saveStatus === 'error' ? 'No se pudo guardar el último cambio' : saveStatus === 'saving' ? 'Guardando…' : 'Todos los cambios están guardados'}
      >
        {saveStatus === 'saving' ? (
          <><span className="save-spinner" /> <span className="toolbar-label">Guardando…</span></>
        ) : saveStatus === 'error' ? (
          <><AlertCircle size={14} /> <span className="toolbar-label">Error al guardar</span></>
        ) : (
          <><Check size={14} /> <span className="toolbar-label">Guardado</span></>
        )}
      </div>
      <button
        aria-label="Deshacer"
        className="toolbar-icon-action"
        disabled={!canUndo}
        type="button"
        title="Deshacer (⌘Z)"
        onClick={() => { onBeforeAction?.(); onUndo(); }}
      >
        <Undo2 size={16} />
      </button>
      <button
        aria-label="Rehacer"
        className="toolbar-icon-action"
        disabled={!canRedo}
        type="button"
        title="Rehacer (⇧⌘Z)"
        onClick={() => { onBeforeAction?.(); onRedo(); }}
      >
        <Redo2 size={16} />
      </button>
    </div>
  );
}
