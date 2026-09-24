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
import { MenuItem, MenuLabel, MenuSeparator, ToolMenu } from './ui/Toolbar';
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
    <ToolMenu
      icon={RefreshCw}
      label="Sincronizar"
      align="start"
      badge={linkedSequenceDiagrams.length > 0 ? linkedSequenceDiagrams.length : undefined}
      title="Importar clases desde las secuencias y abrir las secuencias vinculadas"
    >
      <p className="v2-menu-note">
        <Link2 aria-hidden="true" size={13} />
        {linkedSequenceDiagrams.length} {linkedSequenceDiagrams.length === 1 ? 'secuencia vinculada' : 'secuencias vinculadas'}
        {' · '}
        {sourceClassDiagram ? `modelo compartido con «${sourceClassDiagram.name}»` : 'modelo propio'}
      </p>
      <MenuSeparator />
      <MenuLabel>Importar clases y métodos</MenuLabel>
      {sequenceDiagrams.length === 0 ? (
        <p className="v2-menu-note">Este proyecto todavía no tiene diagramas de secuencia.</p>
      ) : (
        <>
          {sequenceDiagrams.map((sequence) => (
            <MenuItem key={sequence.id} icon={Import} onSelect={() => importFromSequences([sequence])}>
              Desde «{sequence.name}»
            </MenuItem>
          ))}
          {sequenceDiagrams.length > 1 ? (
            <MenuItem icon={Import} onSelect={() => importFromSequences(sequenceDiagrams)}>
              Desde todas las secuencias ({sequenceDiagrams.length})
            </MenuItem>
          ) : null}
        </>
      )}
      <MenuItem icon={Link2} disabled={sequenceDiagrams.length === 0} onSelect={refreshLinks}>
        Vincular todas las secuencias
      </MenuItem>
      {linkedSequenceDiagrams.length > 0 ? (
        <>
          <MenuSeparator />
          <MenuLabel>Abrir secuencia vinculada</MenuLabel>
          {linkedSequenceDiagrams.map((sequence) => (
            <MenuItem key={sequence.id} icon={Workflow} onSelect={() => onNavigateToArtifact?.(sequence.id)}>
              {sequence.name}
            </MenuItem>
          ))}
        </>
      ) : null}
    </ToolMenu>
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
      externalFeedback={importFeedback}
      onChangeContent={handleChangeContent}
      onRedo={onRedo}
      onUndo={onUndo}
    />
  );
}
