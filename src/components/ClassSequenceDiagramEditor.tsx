import { Import, Link2, Workflow } from 'lucide-react';
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
import { importClassesFromSequences, planSequenceClassImport } from '../utils/sequenceClassImport';
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
  const pending = useMemo(() => planSequenceClassImport(artifact.content, linkedSequenceDiagrams.map((sequence) => sequence.content)), [artifact.content, linkedSequenceDiagrams]);
  const [rejectedKeys, setRejectedKeys] = useState<Set<string>>(new Set());
  const acceptedKeys = new Set(pending.filter((novelty) => !rejectedKeys.has(novelty.key)).map((novelty) => novelty.key));
  const pendingGroups = new Map<string, typeof pending>();
  for (const novelty of pending) pendingGroups.set(novelty.className, [...(pendingGroups.get(novelty.className) ?? []), novelty]);
  const unlinkedCount = sequenceDiagrams.filter((sequence) => !artifact.content.linkedSequenceDiagramIds.includes(sequence.id)).length;

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
        linkedSequenceDiagramIds: [...new Set([...artifact.content.linkedSequenceDiagramIds, ...sequenceDiagrams.map((sequence) => sequence.id)])],
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

  const importFromSequences = useCallback((sources: SequenceDiagramArtifact[], keys?: ReadonlySet<string>): void => {
    const { content, summary } = importClassesFromSequences(
      { nodes: artifact.content.nodes, edges: artifact.content.edges },
      sources.map((source) => source.content),
      keys,
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
      label={pending.length > 0 ? `${pending.length} ${pending.length === 1 ? 'novedad' : 'novedades'}` : linkedSequenceDiagrams.length > 0 ? `✓ Al día con ${linkedSequenceDiagrams.length} ${linkedSequenceDiagrams.length === 1 ? 'secuencia' : 'secuencias'}` : 'Sin secuencias vinculadas'}
      align="start"
      className={`sequence-model-status ${pending.length > 0 ? 'has-novelties' : ''}`}
      panelClassName="sequence-model-sync-panel"
    >
      {[...pendingGroups].map(([className, novelties]) => (
        <div key={className} role="presentation">
          <MenuLabel>{className}</MenuLabel>
          {novelties.map((novelty) => {
            const parentRejected = novelty.type !== 'class' && rejectedKeys.has(`class:${className.trim().toLocaleLowerCase()}`);
            return <MenuItem key={novelty.key} checked={acceptedKeys.has(novelty.key) && !parentRejected} disabled={parentRejected} keepOpen onSelect={() => setRejectedKeys((current) => {
              const next = new Set(current);
              if (next.has(novelty.key)) next.delete(novelty.key); else next.add(novelty.key);
              return next;
            })}>
              {novelty.type === 'class' ? 'Clase nueva' : novelty.type === 'method' ? `${novelty.elementName}()${novelty.returnType ? `: ${novelty.returnType}` : ''}` : `${novelty.elementName}${novelty.attributeType ? `: ${novelty.attributeType}` : ''}`}
            </MenuItem>;
          })}
        </div>
      ))}
      {pending.length > 0 ? <div className="sequence-model-import-action"><MenuItem icon={Import} disabled={!pending.some((novelty) => acceptedKeys.has(novelty.key) && (novelty.type === 'class' || !rejectedKeys.has(`class:${novelty.className.trim().toLocaleLowerCase()}`)))} onSelect={() => {
        importFromSequences(linkedSequenceDiagrams, acceptedKeys);
        setRejectedKeys(new Set());
      }}>Traer seleccionadas</MenuItem></div> : null}
      <MenuSeparator />
      {linkedSequenceDiagrams.length > 0 ? <>
        <MenuLabel>Abrir secuencia vinculada</MenuLabel>
        {linkedSequenceDiagrams.map((sequence) => <MenuItem key={sequence.id} icon={Workflow} disabled={!onNavigateToArtifact} onSelect={() => onNavigateToArtifact?.(sequence.id)}>{sequence.name}</MenuItem>)}
      </> : null}
      {unlinkedCount > 0 ? <MenuItem icon={Link2} onSelect={refreshLinks}>Vincular {unlinkedCount} {unlinkedCount === 1 ? 'secuencia sin vincular' : 'secuencias sin vincular'}</MenuItem> : null}
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
