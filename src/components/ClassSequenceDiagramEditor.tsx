import { Link2, RefreshCw, Workflow } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import type { DiagramTheme, DiagramThemeId } from '../theme/themes';
import type {
  ArtifactContent,
  ClassDiagramArtifact,
  ClassDiagramContent,
  ClassSequenceDiagramArtifact,
  DesignProject,
  DiagramContent,
} from '../types/diagram';
import { DiagramEditor } from './DiagramEditor';

type ClassSequenceDiagramEditorProps = {
  artifact: ClassSequenceDiagramArtifact;
  canRedo: boolean;
  canUndo: boolean;
  project: DesignProject;
  theme: DiagramTheme;
  themeId: DiagramThemeId;
  onNavigateToArtifact?: (artifactId: string) => void;
  onLinkAllSequenceDiagrams?: (classModelArtifactId: string) => void;
  onChangeContent: (content: ArtifactContent, options?: { separateHistoryEntry?: boolean; alreadyNormalized?: boolean }) => void;
  onRedo: () => void;
  onUndo: () => void;
  onImportProject: (project: DesignProject) => void;
  onThemeChange: (themeId: DiagramThemeId) => void;
};

const asClassContent = (content: DiagramContent): ClassDiagramContent => ({
  nodes: (content as ClassDiagramContent).nodes,
  edges: (content as ClassDiagramContent).edges,
});

export function ClassSequenceDiagramEditor({
  artifact,
  canRedo,
  canUndo,
  project,
  theme,
  themeId,
  onNavigateToArtifact,
  onLinkAllSequenceDiagrams,
  onChangeContent,
  onRedo,
  onUndo,
  onImportProject,
  onThemeChange,
}: ClassSequenceDiagramEditorProps) {
  const sequenceDiagrams = useMemo(
    () => project.artifacts.filter((candidate) => candidate.type === 'sequence-diagram'),
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
    </div>
  );

  return (
    <DiagramEditor
      artifact={displayArtifact}
      artifactKind="Clases · secuencias"
      canRedo={canRedo}
      canUndo={canUndo}
      project={project}
      theme={theme}
      themeId={themeId}
      toolbarContext={toolbarContext}
      onChangeContent={handleChangeContent}
      onRedo={onRedo}
      onUndo={onUndo}
      onImportProject={onImportProject}
      onThemeChange={onThemeChange}
    />
  );
}
