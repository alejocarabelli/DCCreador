import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

type ProjectNameDialogProps = {
  initialName: string;
  title: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
};

export function ProjectNameDialog({ initialName, title, onCancel, onConfirm }: ProjectNameDialogProps) {
  const [name, setName] = useState(initialName);
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
    onConfirm(cleanName);
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
        className="project-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        role="dialog"
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        <p className="dialog-description" id={descriptionId}>
          El nombre te ayuda a reconocer este archivo técnico después.
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
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="primary-action" type="submit">
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
