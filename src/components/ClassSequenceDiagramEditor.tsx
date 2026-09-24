import { Import, Link2, RefreshCw, Workflow } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DiagramTheme } from '../theme/themes';
import type {
  ArtifactContent,
  ClassDiagramArtifact,
  ClassDiagramContent,
  ClassSequenceDiagramArtifact,
  DesignProject,
  DiagramContent,
  SequenceDiagramArtifact,
} from '../types/diagram';
import { importClassesFromSequences } from '../utils/sequenceClassImport';
import { DiagramEditor } from './DiagramEditor';
import type { DiagramSaveStatus } from '../hooks/useProjects';

type ClassSequenceDiagramEditorProps = {
  artifact: ClassSequenceDiagramArtifact;
  canRedo: boolean;
  saveStatus?: DiagramSaveStatus;
  canUndo: boolean;
  project: DesignProject;
  theme: DiagramTheme;
  onNavigateToArtifact?: (artifactId: string) => void;
  onLinkAllSequenceDiagrams?: (classModelArtifactId: string) => void;
  onChangeContent: (content: ArtifactContent, options?: { separateHistoryEntry?: boolean; alreadyNormalized?: boolean }) => void;
  onRedo: () => void;
  onUndo: () => void;
};

const asClassContent = (content: DiagramContent): ClassDiagramContent => ({
  nodes: (content as ClassDiagramContent).nodes,
  edges: (content as ClassDiagramContent).edges,
});

export function ClassSequenceDiagramEditor({
  artifact,
  canRedo,
  saveStatus = 'saved',
  canUndo,
  project,
  theme,
  onNavigateToArtifact,
  onLinkAllSequenceDiagrams,
  onChangeContent,
  onRedo,
  onUndo,
}: ClassSequenceDiagramEditorProps) {
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const sequenceDiagrams = useMemo(
    () => project.artifacts.filter((candidate): candidate is SequenceDiagramArtifact => candidate.type === 'sequence-diagram'),
    [project.artifacts],
  );
  const linkedSequenceDiagrams = useMemo(
    () => sequenceDiagrams.filter((candidate) => artifact.content.linkedSequenceDiagramIds.includes(candidate.id)),
    [artifact.content.linkedSequenceDiagramIds, sequenceDiagrams],
  );
  const sourceClassDiagram = useMemo(
    () => project.artifacts.find(
      (candidate): candidate is ClassDiagramArtifact =>
        candidate.type === 'class-diagram' && candidate.id === artifact.content.sourceClassDiagramArtifactId,
    ),
    [artifact.content.sourceClassDiagramArtifactId, project.artifacts],
  );

  const handleChangeContent = useCallback(
    (content: DiagramContent, options?: { separateHistoryEntry?: boolean }): void => {
      const classContent = asClassContent(content);
      onChangeContent(
        {
          ...artifact.content,
          ...classContent,
          version: 1 as const,
        },
        options,
      );
    },
    [artifact.content, onChangeContent],
  );

  const refreshLinks = useCallback((): void => {
    onLinkAllSequenceDiagrams?.(artifact.id);
    onChangeContent(
      {
        ...artifact.content,
        linkedSequenceDiagramIds: sequenceDiagrams.map((sequence) => sequence.id),
        version: 1,
      },
      { separateHistoryEntry: true, alreadyNormalized: true },
    );
  }, [artifact.content, artifact.id, onChangeContent, onLinkAllSequenceDiagrams, sequenceDiagrams]);

  useEffect(() => {
    if (importFeedback === null) return undefined;
    const timeout = window.setTimeout(() => setImportFeedback(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [importFeedback]);

  const importFromSequences = useCallback((sources: SequenceDiagramArtifact[]): void => {
    const { content, summary } = importClassesFromSequences(
      { nodes: artifact.content.nodes, edges: artifact.content.edges },
      sources.map((source) => source.content),
    );

    if (summary.createdClasses === 0 && summary.addedMethods === 0 && summary.addedAttributes === 0) {
      setImportFeedback('No hay clases, atributos ni métodos nuevos: el modelo ya incluye todo lo de esa secuencia.');
      return;
    }

    const linkedIds = new Set([...artifact.content.linkedSequenceDiagramIds, ...sources.map((source) => source.id)]);
    onChangeContent(
      { ...artifact.content, ...content, linkedSequenceDiagramIds: [...linkedIds], version: 1 },
      { separateHistoryEntry: true },
    );

    const parts = [
      summary.createdClasses > 0 ? `${summary.createdClasses} ${summary.createdClasses === 1 ? 'clase nueva' : 'clases nuevas'}` : null,
      summary.addedAttributes > 0 ? `${summary.addedAttributes} ${summary.addedAttributes === 1 ? 'atributo' : 'atributos'}` : null,
      summary.addedMethods > 0 ? `${summary.addedMethods} ${summary.addedMethods === 1 ? 'método' : 'métodos'}` : null,
    ].filter((part): part is string => part !== null);
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0];
    setImportFeedback(`Importado: ${list}.`);
  }, [artifact.content, onChangeContent]);

  const displayArtifact: ClassDiagramArtifact = useMemo(() => ({
    id: artifact.id,
    type: 'class-diagram',
    name: artifact.name,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    content: {
      nodes: artifact.content.nodes,
      edges: artifact.content.edges,
    },
  }), [artifact.createdAt, artifact.content.edges, artifact.content.nodes, artifact.id, artifact.name, artifact.updatedAt]);

  const toolbarContext = (
    <div className="class-sequence-sync-context" aria-label="Estado de sincronización">
      <span className="class-sequence-sync-status">
        <Link2 aria-hidden="true" size={14} />
        <strong>{linkedSequenceDiagrams.length}</strong>
        <span>{linkedSequenceDiagrams.length === 1 ? 'secuencia vinculada' : 'secuencias vinculadas'}</span>
      </span>
      <span className="class-sequence-sync-source">
        {sourceClassDiagram ? `Modelo compartido · ${sourceClassDiagram.name}` : 'Modelo local sin fuente'}
      </span>
      <details className="toolbar-menu class-sequence-import-menu">
        <summary
          className="class-sequence-sync-button class-sequence-sync-button-primary"
          aria-label="Importar clases desde un diagrama de secuencia"
          title="Crea una clase por participante (sin actores) con los métodos que recibe"
        >
          <Import aria-hidden="true" size={14} />
          Importar desde secuencia
        </summary>
        <div className="toolbar-menu-content class-sequence-import-list">
          {sequenceDiagrams.length === 0 ? (
            <p className="class-sequence-import-empty">Este proyecto todavía no tiene diagramas de secuencia.</p>
          ) : (
            <>
              <p className="class-sequence-import-hint">
                Una clase por participante, sin actores, con los métodos que recibe.
              </p>
              {sequenceDiagrams.map((sequence) => (
                <button
                  key={sequence.id}
                  type="button"
                  onClick={(event) => {
                    importFromSequences([sequence]);
                    event.currentTarget.closest('details')?.removeAttribute('open');
                  }}
                >
                  <Workflow aria-hidden="true" size={15} />
                  {sequence.name}
                </button>
              ))}
              {sequenceDiagrams.length > 1 ? (
                <>
                  <hr />
                  <button
                    type="button"
                    onClick={(event) => {
                      importFromSequences(sequenceDiagrams);
                      event.currentTarget.closest('details')?.removeAttribute('open');
                    }}
                  >
                    <Import aria-hidden="true" size={15} />
                    Todas las secuencias ({sequenceDiagrams.length})
                  </button>
                </>
              ) : null}
            </>
          )}
        </div>
      </details>
      <button className="class-sequence-sync-button" type="button" onClick={refreshLinks} title="Actualizar vínculos con todas las secuencias">
        <RefreshCw aria-hidden="true" size={14} />
        Actualizar vínculos
      </button>
      {linkedSequenceDiagrams[0] !== undefined ? (
        <button
          className="class-sequence-sync-button class-sequence-sync-button-secondary"
          type="button"
          onClick={() => onNavigateToArtifact?.(linkedSequenceDiagrams[0].id)}
          title="Abrir la primera secuencia vinculada"
        >
          <Workflow aria-hidden="true" size={14} />
          Abrir secuencia
        </button>
      ) : null}
      {importFeedback !== null ? (
        <span className="class-sequence-import-feedback" role="status" aria-live="polite">{importFeedback}</span>
      ) : null}
    </div>
  );

  return (
    <DiagramEditor
      artifact={displayArtifact}
      artifactKind="Clases de secuencias"
      artifactType="class-sequence-diagram"
      canRedo={canRedo}
      canUndo={canUndo}
      saveStatus={saveStatus}
      project={project}
      theme={theme}
      toolbarContext={toolbarContext}
      onChangeContent={handleChangeContent}
      onRedo={onRedo}
      onUndo={onUndo}
    />
  );
}
