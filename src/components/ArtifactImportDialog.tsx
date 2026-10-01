import { useId, useRef, useState, type FormEvent } from 'react';
import type { DesignArtifact, DiagramProject } from '../types/diagram';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { artifactTypeInfo } from '../constants/artifactTypes';
import { ARTIFACT_IMPORT_INVALID_MESSAGE, extractImportableArtifacts } from '../utils/artifactFile';

type ArtifactImportDialogProps = {
  project: DiagramProject;
  onCancel: () => void;
  onConfirm: (artifact: DesignArtifact) => void;
  onDownloadGuide: () => void;
};

export function ArtifactImportDialog({ project, onCancel, onConfirm, onDownloadGuide }: ArtifactImportDialogProps) {
  const [artifacts, setArtifacts] = useState<DesignArtifact[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const requestRef = useRef(0);
  const dialogRef = useRef<HTMLFormElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const artifact = artifacts[selectedIndex];
  useFocusTrap(dialogRef, true, onCancel);

  const readFile = async (file: File): Promise<void> => {
    const request = ++requestRef.current;
    setArtifacts([]);
    setError(null);
    setIsReading(true);
    try {
      const imported = extractImportableArtifacts(JSON.parse(await file.text()) as unknown);
      if (request !== requestRef.current) return;
      if (imported === null) { setError(ARTIFACT_IMPORT_INVALID_MESSAGE); return; }
      setArtifacts(imported);
      setSelectedIndex(0);
      setName(imported[0].name);
    } catch {
      if (request === requestRef.current) setError('No se pudo leer el archivo. Revisá que contenga un JSON válido.');
    } finally {
      if (request === requestRef.current) setIsReading(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (artifact && name.trim() && !isReading) onConfirm({ ...artifact, name: name.trim() });
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <form ref={dialogRef} className="project-dialog artifact-transfer-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} onSubmit={submit}>
        <h2 id={titleId}>Importar artefacto</h2>
        <p className="dialog-description" id={descriptionId}>Agregá un artefacto a «{project.name}» desde un JSON individual o un proyecto exportado.</p>
        <label className="field">
          Archivo JSON
          <input type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
          }} />
        </label>
        {isReading ? <p role="status">Leyendo archivo…</p> : null}
        {artifacts.length > 1 ? (
          <label className="field">
            Artefacto a importar
            <select value={selectedIndex} onChange={(event) => {
              const index = Number(event.target.value);
              setSelectedIndex(index);
              setName(artifacts[index].name);
            }}>
              {artifacts.map((candidate, index) => <option key={index} value={index}>{candidate.name} · {artifactTypeInfo(candidate.type).label}</option>)}
            </select>
          </label>
        ) : null}
        {artifact ? (
          <>
            <p className="helper-text">{artifactTypeInfo(artifact.type).label}. Se importa una copia; los vínculos con otros artefactos se pueden configurar después.</p>
            <label className="field">Nombre<input value={name} maxLength={120} required onChange={(event) => setName(event.target.value)} /></label>
          </>
        ) : null}
        {error ? <p className="dialog-error" role="alert">{error}</p> : null}
        <button type="button" onClick={onDownloadGuide}>Descargar guía de artefactos para IA (.md)</button>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="primary-action" disabled={!artifact || !name.trim() || isReading}>Importar</button>
        </div>
      </form>
    </div>
  );
}
