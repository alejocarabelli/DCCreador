import { useId, useRef, useState, type FormEvent } from 'react';
import type { DesignArtifact, DiagramProject } from '../types/diagram';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { getLinkedArtifacts } from '../utils/artifactTransfer';

type ArtifactMoveDialogProps = {
  project: DiagramProject;
  artifact: DesignArtifact;
  projects: DiagramProject[];
  onCancel: () => void;
  onConfirm: (targetProjectId: string, includeLinked: boolean) => void;
};

export function ArtifactMoveDialog({ project, artifact, projects, onCancel, onConfirm }: ArtifactMoveDialogProps) {
  const destinations = projects.filter((candidate) => candidate.id !== project.id);
  const [targetId, setTargetId] = useState(destinations[0]?.id ?? '');
  const [includeLinked, setIncludeLinked] = useState(true);
  const linked = getLinkedArtifacts(project, artifact.id).filter((candidate) => candidate.id !== artifact.id);
  const moving = includeLinked ? [artifact, ...linked] : [artifact];
  const dialogRef = useRef<HTMLFormElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  useFocusTrap(dialogRef, true, onCancel);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (destinations.some((candidate) => candidate.id === targetId)) onConfirm(targetId, includeLinked);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <form ref={dialogRef} className="project-dialog artifact-transfer-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} onSubmit={submit}>
        <h2 id={titleId}>Mover artefacto</h2>
        <p className="dialog-description" id={descriptionId}>Mové «{artifact.name}» desde «{project.name}» a otro proyecto.</p>
        {destinations.length > 0 ? (
          <label className="field">Proyecto de destino
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              {destinations.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
          </label>
        ) : <p role="status">Creá otro proyecto para poder mover este artefacto.</p>}
        {linked.length > 0 ? (
          <>
            <label className="artifact-transfer-checkbox">
              <input type="checkbox" checked={includeLinked} onChange={(event) => setIncludeLinked(event.target.checked)} />
              Incluir {linked.length} {linked.length === 1 ? 'artefacto vinculado' : 'artefactos vinculados'}
            </label>
            <p className="helper-text">{includeLinked ? 'Los vínculos se conservan al mover estos artefactos juntos.' : 'Los vínculos entre los artefactos que quedan separados se quitarán. Se conserva su contenido y sus textos.'}</p>
          </>
        ) : null}
        <ul className="artifact-transfer-list" aria-label="Artefactos que se moverán">{moving.map((candidate) => <li key={candidate.id}>{candidate.name}</li>)}</ul>
        {moving.length === project.artifacts.length ? <p className="helper-text">El proyecto de origen quedará con un diagrama de clases vacío.</p> : null}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="primary-action" disabled={destinations.length === 0}>Mover</button>
        </div>
      </form>
    </div>
  );
}
