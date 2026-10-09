import { useEffect } from 'react';
import { X } from 'lucide-react';
import { isModalOpen } from '../utils/editorShortcutGuards';
import { isNotebookEvent } from '../utils/notebookKeyboard';

type ReviewIssue = { id: string; kind: 'error' | 'review'; message: string };

type Props<Issue extends ReviewIssue> = {
  helper?: string;
  issues: Issue[];
  /** True when the artifact has nothing to check yet: says so instead of "no problems". */
  isEmpty?: boolean;
  onClose: () => void;
  onFocus: (issue: Issue) => void;
  title?: string;
};

export const REVIEW_CLEAN_TEXT = 'Sin problemas en las comprobaciones automáticas.';
export const REVIEW_NOTHING_TEXT = 'Todavía no hay nada para revisar.';

const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** Esc closes the panel and nothing else: captured before the editor's own shortcuts see it. */
function useCloseOnEscape(onClose: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || isNotebookEvent(event) || isTextField(event.target) || isModalOpen(document)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);
}

export function DiagramReviewPanel<Issue extends ReviewIssue>({
  helper = 'Comprueba nombres, multiplicidades y ciclos de herencia. No reemplaza la revisión del diseño.',
  issues,
  isEmpty = false,
  onFocus,
  onClose,
  title = 'Revisión del diagrama',
}: Props<Issue>) {
  useCloseOnEscape(onClose);
  const errorCount = issues.filter(issue => issue.kind === 'error').length;
  const reviewCount = issues.length - errorCount;
  return (
    <section className="diagram-review-panel" aria-label={title}>
      <div className="diagram-review-heading"><strong>{title}</strong><button className="v2-tool" type="button" onClick={onClose} aria-label="Cerrar revisión"><X size={16} aria-hidden="true" /></button></div>
      {issues.length > 0 ? (
        <p className="diagram-review-counts">
          {errorCount > 0 ? <span>{errorCount} {errorCount === 1 ? 'error' : 'errores'}</span> : null}
          {reviewCount > 0 ? <span>{reviewCount} {reviewCount === 1 ? 'aviso' : 'avisos'}</span> : null}
        </p>
      ) : null}
      <p className="helper-text">{helper}</p>
      {issues.length === 0 ? <p>{isEmpty ? REVIEW_NOTHING_TEXT : REVIEW_CLEAN_TEXT}</p> : (
        <ul>{issues.map(issue => <li key={issue.id}>
          <button type="button" onClick={() => onFocus(issue)}>
            <strong>{issue.kind === 'error' ? 'Error' : 'Revisar'}</strong><span>{issue.message}</span>
          </button>
        </li>)}</ul>
      )}
    </section>
  );
}
