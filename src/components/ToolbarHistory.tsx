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
 * Whether the work is safe, and the way back. It sits right after the
 * breadcrumb in every editor so the hand learns it once.
 */
export function ToolbarHistory({ canRedo, canUndo, saveStatus, onRedo, onUndo, onBeforeAction }: ToolbarHistoryProps) {
  return (
    <div className="v2-history">
      <div
        aria-live="polite"
        className={`v2-save-status is-${saveStatus}`}
        data-testid="sequence-save-status"
        role="status"
        title={saveStatus === 'error' ? 'No se pudo guardar el último cambio' : saveStatus === 'saving' ? 'Guardando…' : 'Todos los cambios están guardados'}
      >
        {saveStatus === 'saving' ? (
          <><span className="v2-save-spinner" aria-hidden="true" /><span className="v2-save-label">Guardando…</span></>
        ) : saveStatus === 'error' ? (
          <><AlertCircle size={13} aria-hidden="true" /><span className="v2-save-label">No se pudo guardar</span></>
        ) : (
          <><Check size={13} aria-hidden="true" /><span className="v2-save-label">Guardado</span></>
        )}
      </div>
      <button
        aria-label="Deshacer"
        className="v2-tool"
        disabled={!canUndo}
        type="button"
        title="Deshacer (⌘Z)"
        onClick={() => { onBeforeAction?.(); onUndo(); }}
      >
        <Undo2 size={16} aria-hidden="true" />
      </button>
      <button
        aria-label="Rehacer"
        className="v2-tool"
        disabled={!canRedo}
        type="button"
        title="Rehacer (⇧⌘Z)"
        onClick={() => { onBeforeAction?.(); onRedo(); }}
      >
        <Redo2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
