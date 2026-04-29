import { useEffect, useRef, useState, type FormEvent } from 'react';

type ProjectNameDialogProps = {
  initialName: string;
  title: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
};

export function ProjectNameDialog({ initialName, title, onCancel, onConfirm }: ProjectNameDialogProps) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onConfirm(name);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <form className="project-dialog" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{title}</h2>
        <label className="field">
          Nombre
          <input ref={inputRef} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
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
