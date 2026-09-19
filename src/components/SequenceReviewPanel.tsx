import React, { useMemo } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import type { SequenceDiagramProblem } from '../types/diagram';

export type SequenceReviewPanelProps = {
  problems: SequenceDiagramProblem[];
  onSelectProblemTarget: (target: { kind: 'message' | 'participant' | 'fragment'; id: string }) => void;
  onClose: () => void;
};

export const SequenceReviewPanel: React.FC<SequenceReviewPanelProps> = ({
  problems,
  onSelectProblemTarget,
  onClose,
}) => {
  const { errors, warnings } = useMemo(() => {
    const errs: SequenceDiagramProblem[] = [];
    const warns: SequenceDiagramProblem[] = [];
    problems.forEach((p) => {
      if (p.severity === 'error') {
        errs.push(p);
      } else {
        warns.push(p);
      }
    });
    return { errors: errs, warnings: warns };
  }, [problems]);

  const handleFocus = (problem: SequenceDiagramProblem) => {
    if (problem.messageId) {
      onSelectProblemTarget({ kind: 'message', id: problem.messageId });
    } else if (problem.fragmentId) {
      onSelectProblemTarget({ kind: 'fragment', id: problem.fragmentId });
    } else if (problem.participantId) {
      onSelectProblemTarget({ kind: 'participant', id: problem.participantId });
    }
  };

  return (
    <aside
      className="sequence-review-panel"
      data-testid="sequence-review-panel"
      aria-label="Panel de revisión de diagrama de secuencia"
    >
      <div className="sequence-review-header">
        <div className="sequence-review-title">
          <h3>Revisar diagrama</h3>
          <span className="sequence-review-badges">
            <span className={`badge-pill badge-error ${errors.length > 0 ? 'active' : ''}`}>
              {`${errors.length} ${errors.length === 1 ? 'error' : 'errores'}`}
            </span>
            <span className={`badge-pill badge-warning ${warnings.length > 0 ? 'active' : ''}`}>
              {`${warnings.length} ${warnings.length === 1 ? 'advertencia' : 'advertencias'}`}
            </span>
          </span>
        </div>
        <button
          type="button"
          className="btn-icon"
          aria-label="Cerrar panel de revisión"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>

      <div className="sequence-review-content">
        {problems.length === 0 ? (
          <div className="sequence-review-empty">
            <CheckCircle2 size={36} className="text-success" />
            <p className="sequence-review-empty-title">Diagrama válido</p>
            <p className="sequence-review-empty-subtitle">
              No se detectaron errores de ciclo de vida ni referencias rotas.
            </p>
          </div>
        ) : (
          <>
            {errors.length > 0 && (
              <div className="sequence-review-section">
                <h4 className="sequence-review-section-title error-title">
                  <AlertCircle size={16} /> {`Errores (${errors.length})`}
                </h4>
                <div className="sequence-review-list">
                  {errors.map((err) => {
                    const hasTarget = Boolean(err.messageId || err.fragmentId || err.participantId);
                    return (
                      <div
                        key={err.id}
                        className={`sequence-review-item item-error ${hasTarget ? 'clickable' : ''}`}
                        onClick={() => hasTarget && handleFocus(err)}
                        role={hasTarget ? 'button' : undefined}
                        tabIndex={hasTarget ? 0 : undefined}
                        onKeyDown={(e) => {
                          if (hasTarget && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            handleFocus(err);
                          }
                        }}
                      >
                        <div className="sequence-review-item-main">
                          <span className="sequence-review-code">{err.code}</span>
                          <p className="sequence-review-message">{err.message}</p>
                        </div>
                        {hasTarget && (
                          <span className="sequence-review-focus-hint">Enfocar elemento</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="sequence-review-section">
                <h4 className="sequence-review-section-title warning-title">
                  <AlertTriangle size={16} /> {`Advertencias (${warnings.length})`}
                </h4>
                <div className="sequence-review-list">
                  {warnings.map((warn) => {
                    const hasTarget = Boolean(warn.messageId || warn.fragmentId || warn.participantId);
                    return (
                      <div
                        key={warn.id}
                        className={`sequence-review-item item-warning ${hasTarget ? 'clickable' : ''}`}
                        onClick={() => hasTarget && handleFocus(warn)}
                        role={hasTarget ? 'button' : undefined}
                        tabIndex={hasTarget ? 0 : undefined}
                        onKeyDown={(e) => {
                          if (hasTarget && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            handleFocus(warn);
                          }
                        }}
                      >
                        <div className="sequence-review-item-main">
                          <span className="sequence-review-code">{warn.code}</span>
                          <p className="sequence-review-message">{warn.message}</p>
                        </div>
                        {hasTarget && (
                          <span className="sequence-review-focus-hint">Enfocar elemento</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
