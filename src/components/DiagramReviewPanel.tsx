type ReviewIssue = { id: string; kind: 'error' | 'review'; message: string };

type Props<Issue extends ReviewIssue> = {
  helper?: string;
  issues: Issue[];
  onClose: () => void;
  onFocus: (issue: Issue) => void;
  title?: string;
};

export function DiagramReviewPanel<Issue extends ReviewIssue>({
  helper = 'Comprueba nombres, multiplicidades y ciclos de herencia. No reemplaza la revisión del diseño.',
  issues,
  onFocus,
  onClose,
  title = 'Revisión del diagrama',
}: Props<Issue>) {
  return (
    <section className="diagram-review-panel" aria-label={title}>
      <div className="diagram-review-heading"><strong>{title}</strong><button type="button" onClick={onClose} aria-label="Cerrar revisión">×</button></div>
      <p className="helper-text">{helper}</p>
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
