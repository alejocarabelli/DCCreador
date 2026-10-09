import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { ARTIFACT_TYPES } from '../constants/artifactTypes';
import type { DesignArtifact } from '../types/diagram';
import { ArtifactTypeIcon } from './ArtifactTypeIcon';

type ProjectNameDialogProps = {
  initialName: string;
  title: string;
  description: string;
  confirmLabel: string;
  chooseInitialArtifact?: boolean;
  onCancel: () => void;
  onConfirm: (name: string, artifactType?: DesignArtifact['type']) => void;
};

export function ProjectNameDialog({ initialName, title, description, confirmLabel, chooseInitialArtifact = false, onCancel, onConfirm }: ProjectNameDialogProps) {
  const [name, setName] = useState(initialName);
  const [artifactType, setArtifactType] = useState<DesignArtifact['type']>('use-case-model');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLFormElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  useFocusTrap(dialogRef, true, onCancel);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length === 0) {
      setError('Escribí un nombre para continuar.');
      inputRef.current?.focus();
      return;
    }

    setError(null);
    if (chooseInitialArtifact) onConfirm(cleanName, artifactType);
    else onConfirm(cleanName);
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        ref={dialogRef}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`project-dialog${chooseInitialArtifact ? ' project-create-dialog' : ''}`}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        role="dialog"
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        <p className="dialog-description" id={descriptionId}>
          {description}
        </p>
        <label className="field" htmlFor={`${titleId}-name`}>
          Nombre
          <input
            ref={inputRef}
            id={`${titleId}-name`}
            aria-describedby={error === null ? undefined : errorId}
            aria-invalid={error !== null}
            maxLength={120}
            required
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error !== null) setError(null);
            }}
          />
        </label>
        {error !== null ? <p className="dialog-error" id={errorId} role="alert">{error}</p> : null}
        {chooseInitialArtifact ? (
          <fieldset className="project-artifact-choice" role="radiogroup" aria-labelledby={`${titleId}-artifact-choice`}>
            <legend id={`${titleId}-artifact-choice`}>¿Con qué querés empezar?</legend>
            {ARTIFACT_TYPES.map((type) => (
              <label className="project-artifact-option" key={type.id}>
                <input
                  type="radio"
                  name={`${titleId}-artifact-type`}
                  value={type.id}
                  checked={artifactType === type.id}
                  aria-labelledby={`${titleId}-${type.id}-label`}
                  aria-describedby={`${titleId}-${type.id}-description`}
                  onChange={() => setArtifactType(type.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <ArtifactTypeIcon type={type.id} size={20} />
                <span className="project-artifact-option-text">
                  <strong id={`${titleId}-${type.id}-label`}>{type.label}</strong>
                  <span id={`${titleId}-${type.id}-description`}>{type.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="primary-action" type="submit">
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
