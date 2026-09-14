import type { DiagramIssue } from '../utils/classDiagramReview';

type Props = { issues: DiagramIssue[]; onFocus: (issue: DiagramIssue) => void; onClose: () => void };

export function DiagramReviewPanel({ issues, onFocus, onClose }: Props) {
  return (
    <section className="diagram-review-panel" aria-label="Revisión del diagrama">
      <div className="diagram-review-heading"><strong>Revisión del diagrama</strong><button type="button" onClick={onClose} aria-label="Cerrar revisión">×</button></div>
      <p className="helper-text">Comprueba nombres, multiplicidades y ciclos de herencia. No reemplaza la revisión del diseño.</p>
      {issues.length === 0 ? <p>No se detectaron problemas en estas comprobaciones.</p> : (
        <ul>{issues.map(issue => <li key={issue.id}>
          <button type="button" onClick={() => onFocus(issue)}>
            <strong>{issue.kind === 'error' ? 'Error' : 'Revisar'}</strong><span>{issue.message}</span>
          </button>
        </li>)}</ul>
      )}
    </section>
  );
}
