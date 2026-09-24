import { useDialogs } from './hooks/useDialogs';
import { ProjectNameDialog } from './components/ProjectNameDialog';
import { ProjectHome } from './components/ProjectHome';
import { ProjectSidebar } from './components/ProjectSidebar';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { downloadProjectFile } from './utils/projectFile';
import { useProjects } from './hooks/useProjects';
import { useTheme } from './hooks/useTheme';
import { readUiPreference, writeUiPreference } from './storage/uiPreferences';
import type { ArtifactContent, ClassMethod, ClassModelArtifact, ClassSequenceDiagramContent, DesignArtifact } from './types/diagram';
import {
  getActiveArtifact,
  normalizeClassSequenceDiagramContent,
  normalizeDiagramContent,
  normalizeUseCaseFlowContent,
  normalizeUseCaseModelContent,
} from './utils/diagramNormalization';
import { normalizeSequenceDiagramContent } from './utils/sequenceDiagram';
import { changeHistory, redoHistory, undoHistory, type ArtifactHistory } from './utils/artifactHistory';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DiagramEditor = lazy(() => import('./components/DiagramEditor').then(({ DiagramEditor: editor }) => ({ default: editor })));
const UseCaseModelEditor = lazy(() => import('./components/UseCaseModelEditor').then(({ UseCaseModelEditor: editor }) => ({ default: editor })));
const UseCaseFlowEditor = lazy(() => import('./components/UseCaseFlowEditor').then(({ UseCaseFlowEditor: editor }) => ({ default: editor })));
const SequenceDiagramEditor = lazy(() => import('./components/SequenceDiagramEditor').then(({ SequenceDiagramEditor: editor }) => ({ default: editor })));
const ClassSequenceDiagramEditor = lazy(() => import('./components/ClassSequenceDiagramEditor').then(({ ClassSequenceDiagramEditor: editor }) => ({ default: editor })));

type ProjectDialogState =
  | { mode: 'create'; projectId?: never; initialName: string }
  | { mode: 'rename'; projectId: string; initialName: string }
  | { mode: 'createArtifact'; projectId: string; initialName: string; artifactType: DesignArtifact['type'] }
  | { mode: 'renameArtifact'; projectId: string; artifactId: string; initialName: string };

const PROJECT_SIDEBAR_COLLAPSED_KEY = 'class-diagram-project-sidebar-collapsed';
const MAX_HISTORY_ENTRIES = 60;
const HISTORY_BURST_WINDOW_MS = 650;

type ProjectHistory = ArtifactHistory<ArtifactContent>;

type ContentChangeOptions = {
  separateHistoryEntry?: boolean;
  alreadyNormalized?: boolean;
};

const cloneArtifactContent = (artifact: DesignArtifact): ArtifactContent => {
  const cloned = JSON.parse(JSON.stringify(artifact.content)) as ArtifactContent;

  if (artifact.type === 'use-case-model') {
    return normalizeUseCaseModelContent(cloned as Parameters<typeof normalizeUseCaseModelContent>[0]);
  }

  if (artifact.type === 'use-case-flow') {
    return normalizeUseCaseFlowContent(cloned as Parameters<typeof normalizeUseCaseFlowContent>[0]);
  }

    if (artifact.type === 'sequence-diagram') {
      return cloned;
    }

    if (artifact.type === 'class-sequence-diagram') {
      return normalizeClassSequenceDiagramContent(cloned as Partial<ClassSequenceDiagramContent>);
    }

  return normalizeDiagramContent(cloned as Parameters<typeof normalizeDiagramContent>[0]);
};

const cloneContentForType = (artifactType: DesignArtifact['type'], content: ArtifactContent): ArtifactContent => {
  const cloned = JSON.parse(JSON.stringify(content)) as ArtifactContent;

  if (artifactType === 'use-case-model') {
    return normalizeUseCaseModelContent(cloned as Parameters<typeof normalizeUseCaseModelContent>[0]);
  }

  if (artifactType === 'use-case-flow') {
    return normalizeUseCaseFlowContent(cloned as Parameters<typeof normalizeUseCaseFlowContent>[0]);
  }

  if (artifactType === 'sequence-diagram') {
    return normalizeSequenceDiagramContent(cloned);
  }

  if (artifactType === 'class-sequence-diagram') {
    return normalizeClassSequenceDiagramContent(cloned as Partial<ClassSequenceDiagramContent>);
  }

  return normalizeDiagramContent(cloned as Parameters<typeof normalizeDiagramContent>[0]);
};

const areArtifactContentsEqual = (left: ArtifactContent, right: ArtifactContent): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

function EditorLoadingState() {
  return (
    <main className="editor-shell editor-loading" aria-live="polite">
      <div className="editor-loading-card">
        <span className="editor-loading-dot" aria-hidden="true" />
        <p>Abriendo editor…</p>
      </div>
    </main>
  );
}

function App() {
  const { confirm, notify } = useDialogs();
  const [projectDialog, setProjectDialog] = useState<ProjectDialogState | null>(null);
  const [isProjectSidebarCollapsed, setIsProjectSidebarCollapsed] = useState(
    () => readUiPreference(PROJECT_SIDEBAR_COLLAPSED_KEY) === 'true',
  );
  const [historyByArtifactId, setHistoryByArtifactId] = useState<Record<string, ProjectHistory>>({});
  const historyByArtifactIdRef = useRef<Record<string, ProjectHistory>>({});
  const updateHistory = useCallback((update: (current: Record<string, ProjectHistory>) => Record<string, ProjectHistory>): void => {
    setHistoryByArtifactId((current) => {
      const next = update(current);
      historyByArtifactIdRef.current = next;
      return next;
    });
  }, []);
  const historyBurstRef = useRef<{ key: string; updatedAt: number } | null>(null);
  const { preference: themePreference, setPreference: setThemePreference, theme, themeStyle } = useTheme();
  const {
    activeProject,
    activeProjectId,
    backup,
    backupAvailable,
    revealBackups,
    createClassDiagramArtifact,
    createClassSequenceDiagramArtifact,
    createUseCaseFlowArtifact,
    createUseCaseModelArtifact,
    createSequenceDiagramArtifact,
    createProject,
    deleteArtifact,
    deleteProject,
    importProject,
    linkSequenceDiagramsToClassModel,
    projects,
    renameArtifact,
    renameProject,
    saveStatus,
    setActiveArtifactId,
    setActiveProjectId,
    storageWarning,
    updateProjectArtifactContent,
  } = useProjects();

  const handleCreateProject = (): void => {
    setProjectDialog({ mode: 'create', initialName: 'Nuevo proyecto' });
  };

  const handleOpenHome = (): void => {
    setActiveProjectId(null);
  };

  const handleRenameProject = (projectId: string): void => {
    const project = projects.find((currentProject) => currentProject.id === projectId);
    setProjectDialog({ mode: 'rename', projectId, initialName: project?.name ?? '' });
  };

  const handleConfirmProjectDialog = (name: string): void => {
    if (projectDialog?.mode === 'create') {
      createProject(name);
    }

    if (projectDialog?.mode === 'rename') {
      renameProject(projectDialog.projectId, name);
    }

    if (projectDialog?.mode === 'createArtifact') {
      if (projectDialog.artifactType === 'use-case-model') {
        createUseCaseModelArtifact(projectDialog.projectId, name);
      } else if (projectDialog.artifactType === 'use-case-flow') {
        createUseCaseFlowArtifact(projectDialog.projectId, name);
      } else if (projectDialog.artifactType === 'sequence-diagram') {
        createSequenceDiagramArtifact(projectDialog.projectId, name);
      } else if (projectDialog.artifactType === 'class-sequence-diagram') {
        createClassSequenceDiagramArtifact(projectDialog.projectId, name);
      } else {
        createClassDiagramArtifact(projectDialog.projectId, name);
      }
    }

    if (projectDialog?.mode === 'renameArtifact') {
      renameArtifact(projectDialog.projectId, projectDialog.artifactId, name);
    }

    setProjectDialog(null);
  };

  const handleDeleteProject = async (projectId: string): Promise<void> => {
    const project = projects.find((currentProject) => currentProject.id === projectId);
    const shouldDelete = await confirm({
      title: `¿Eliminar "${project?.name ?? 'este proyecto'}"?`,
      description: 'Se borran todos sus artefactos y el historial de cambios. No se puede deshacer.',
    });

    if (shouldDelete) {
      deleteProject(projectId);
      updateHistory((currentHistory) =>
        Object.fromEntries(Object.entries(currentHistory).filter(([key]) => !key.startsWith(`${projectId}:`))),
      );
      historyBurstRef.current = null;
    }
  };

  const handleCreateArtifact = (projectId: string, artifactType: DesignArtifact['type']): void => {
    setProjectDialog({
      mode: 'createArtifact',
      projectId,
      artifactType,
      initialName:
        artifactType === 'use-case-model'
          ? 'Modelo de casos de uso'
          : artifactType === 'use-case-flow'
            ? 'Flujo de sucesos'
            : artifactType === 'sequence-diagram'
              ? 'Diagrama de secuencia'
              : artifactType === 'class-sequence-diagram'
                ? 'Clases de secuencias'
            : 'Diagrama de clases',
    });
  };

  const handleRenameArtifact = (projectId: string, artifactId: string): void => {
    const project = projects.find((currentProject) => currentProject.id === projectId);
    const artifact = project?.artifacts.find((currentArtifact) => currentArtifact.id === artifactId);

    setProjectDialog({
      mode: 'renameArtifact',
      projectId,
      artifactId,
      initialName: artifact?.name ?? '',
    });
  };

  const handleDeleteArtifact = async (projectId: string, artifactId: string): Promise<void> => {
    const project = projects.find((currentProject) => currentProject.id === projectId);
    const artifact = project?.artifacts.find((currentArtifact) => currentArtifact.id === artifactId);

    if ((project?.artifacts.length ?? 0) <= 1) {
      await notify({
        title: 'El proyecto necesita al menos un artefacto',
        description: 'Creá otro artefacto antes de eliminar este.',
      });
      return;
    }

    const shouldDelete = await confirm({
      title: `¿Eliminar "${artifact?.name ?? 'este artefacto'}"?`,
      description: 'Se pierde su contenido y su historial de cambios. No se puede deshacer.',
    });

    if (shouldDelete) {
      deleteArtifact(projectId, artifactId);
      updateHistory((currentHistory) => {
        const nextHistory = { ...currentHistory };
        delete nextHistory[`${projectId}:${artifactId}`];
        return nextHistory;
      });
      historyBurstRef.current = null;
    }
  };

  const handleSelectArtifact = (projectId: string, artifactId: string): void => {
    historyBurstRef.current = null;
    setActiveProjectId(projectId);
    setActiveArtifactId(projectId, artifactId);
  };

  const activeArtifact = useMemo(
    () => (activeProject !== null ? getActiveArtifact(activeProject) : null),
    [activeProject],
  );
  const isProjectHome = activeProject === null || activeArtifact === null;
  const activeHistoryKey = activeProject !== null && activeArtifact !== null
    ? `${activeProject.id}:${activeArtifact.id}`
    : null;
  const activeProjectHistory = useMemo(
    () => (activeHistoryKey !== null ? historyByArtifactId[activeHistoryKey] : undefined),
    [activeHistoryKey, historyByArtifactId],
  );

  const canUndo = (activeProjectHistory?.past.length ?? 0) > 0;
  const canRedo = (activeProjectHistory?.future.length ?? 0) > 0;

  const handleChangeProjectContent = useCallback(
    (content: ArtifactContent, options?: ContentChangeOptions): void => {
      if (activeProject === null || activeArtifact === null || activeHistoryKey === null) {
        return;
      }

      let previousContent: ArtifactContent;
      let nextContent: ArtifactContent;
      if (activeArtifact.type === 'sequence-diagram' && options?.alreadyNormalized) {
        const previousSerialized = JSON.stringify(activeArtifact.content);
        const nextSerialized = JSON.stringify(content);
        if (previousSerialized === nextSerialized) return;
        previousContent = JSON.parse(previousSerialized) as ArtifactContent;
        nextContent = JSON.parse(nextSerialized) as ArtifactContent;
      } else {
        previousContent = cloneArtifactContent(activeArtifact);
        nextContent = cloneContentForType(activeArtifact.type, content);
        if (areArtifactContentsEqual(previousContent, nextContent)) return;
      }

      const now = performance.now();
      const previousBurst = historyBurstRef.current;
      const shouldCreateHistoryEntry =
        options?.separateHistoryEntry === true ||
        previousBurst === null ||
        previousBurst.key !== activeHistoryKey ||
        now - previousBurst.updatedAt > HISTORY_BURST_WINDOW_MS;
      historyBurstRef.current = options?.separateHistoryEntry === true
        ? null
        : { key: activeHistoryKey, updatedAt: now };

      updateHistory((currentHistory) => {
        const projectHistory = currentHistory[activeHistoryKey] ?? { past: [], future: [] };

        return {
          ...currentHistory,
          [activeHistoryKey]: changeHistory(projectHistory, previousContent, shouldCreateHistoryEntry, MAX_HISTORY_ENTRIES),
        };
      });
      updateProjectArtifactContent(activeProject.id, activeArtifact.id, nextContent, { alreadyNormalized: true });
    },
    [activeArtifact, activeHistoryKey, activeProject, updateHistory, updateProjectArtifactContent],
  );

  const handleCreateClassMethodFromSequence = useCallback(
    (artifactId: string, nodeId: string, method: ClassMethod): void => {
      if (activeProject === null) {
        return;
      }

      const modelArtifact = activeProject.artifacts.find(
        (candidate): candidate is ClassModelArtifact => candidate.id === artifactId
          && (candidate.type === 'class-diagram' || candidate.type === 'class-sequence-diagram'),
      );

      if (modelArtifact === undefined) {
        return;
      }

      const classNode = modelArtifact.content.nodes.find((node) => node.id === nodeId);
      if (classNode === undefined || classNode.data.methods.some((candidate) => candidate.id === method.id)) {
        return;
      }

      const previousContent = cloneArtifactContent(modelArtifact);
      const nextContent = {
        ...modelArtifact.content,
        nodes: modelArtifact.content.nodes.map((node) => node.id === nodeId
          ? { ...node, data: { ...node.data, methods: [...node.data.methods, method] } }
          : node),
      };
      const normalizedNextContent = cloneContentForType(modelArtifact.type, nextContent);
      const historyKey = `${activeProject.id}:${modelArtifact.id}`;

      updateHistory((currentHistory) => {
        const modelHistory = currentHistory[historyKey] ?? { past: [], future: [] };
        return {
          ...currentHistory,
          [historyKey]: changeHistory(modelHistory, previousContent, true, MAX_HISTORY_ENTRIES),
        };
      });
      historyBurstRef.current = null;
      updateProjectArtifactContent(activeProject.id, modelArtifact.id, normalizedNextContent, { alreadyNormalized: true });
    },
    [activeProject, updateHistory, updateProjectArtifactContent],
  );

  const handleUndo = useCallback((): void => {
    if (activeProject === null || activeArtifact === null || activeHistoryKey === null) {
      return;
    }

    const projectHistory = historyByArtifactIdRef.current[activeHistoryKey];
    const result = projectHistory ? undoHistory(projectHistory, cloneArtifactContent(activeArtifact), MAX_HISTORY_ENTRIES) : undefined;
    const previousContent = result?.content;

    if (projectHistory === undefined || result === undefined || previousContent === undefined) {
      return;
    }

    historyBurstRef.current = null;

    updateHistory((currentHistory) => ({
      ...currentHistory,
      [activeHistoryKey]: result.history,
    }));
    updateProjectArtifactContent(activeProject.id, activeArtifact.id, cloneContentForType(activeArtifact.type, previousContent), { alreadyNormalized: true });
  }, [activeArtifact, activeHistoryKey, activeProject, updateHistory, updateProjectArtifactContent]);

  const handleRedo = useCallback((): void => {
    if (activeProject === null || activeArtifact === null || activeHistoryKey === null) {
      return;
    }

    const projectHistory = historyByArtifactIdRef.current[activeHistoryKey];
    const result = projectHistory ? redoHistory(projectHistory, cloneArtifactContent(activeArtifact), MAX_HISTORY_ENTRIES) : undefined;
    const nextContent = result?.content;

    if (projectHistory === undefined || result === undefined || nextContent === undefined) {
      return;
    }

    historyBurstRef.current = null;

    updateHistory((currentHistory) => ({
      ...currentHistory,
      [activeHistoryKey]: result.history,
    }));
    updateProjectArtifactContent(activeProject.id, activeArtifact.id, cloneContentForType(activeArtifact.type, nextContent), { alreadyNormalized: true });
  }, [activeArtifact, activeHistoryKey, activeProject, updateHistory, updateProjectArtifactContent]);

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent): void => {
      if ((!event.metaKey && !event.ctrlKey) || document.querySelector('.modal-backdrop') !== null) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      const isEditing = target?.closest('input, textarea, select, [contenteditable="true"]') !== null;

      if (isEditing) {
        return;
      }

      const key = event.key.toLowerCase();
      const wantsRedo = (key === 'z' && event.shiftKey) || key === 'y';
      const wantsUndo = key === 'z' && !event.shiftKey;

      if (wantsRedo && canRedo) {
        event.preventDefault();
        handleRedo();
      } else if (wantsUndo && canUndo) {
        event.preventDefault();
        handleUndo();
      }
    };

    document.addEventListener('keydown', handleHistoryShortcut);
    return () => document.removeEventListener('keydown', handleHistoryShortcut);
  }, [canRedo, canUndo, handleRedo, handleUndo]);

  useEffect(() => {
    writeUiPreference(PROJECT_SIDEBAR_COLLAPSED_KEY, String(isProjectSidebarCollapsed));
  }, [isProjectSidebarCollapsed]);

  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // `?` opens the shortcuts panel and ⌘\ toggles the sidebar, unless the user is typing.
  useEffect(() => {
    const handleHelpShortcut = (event: KeyboardEvent): void => {
      if (event.key === '\\' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setIsProjectSidebarCollapsed((isCollapsed) => !isCollapsed);
        return;
      }
      if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      setIsShortcutsOpen((open) => !open);
    };
    document.addEventListener('keydown', handleHelpShortcut);
    return () => document.removeEventListener('keydown', handleHelpShortcut);
  }, []);

  const handleExportProject = (projectId: string): void => {
    const project = projects.find((candidate) => candidate.id === projectId);
    if (project !== undefined) downloadProjectFile(project);
  };

  return (
    <div
      className={`app-shell ${isProjectSidebarCollapsed ? 'project-sidebar-collapsed' : 'project-sidebar-expanded'} ${isProjectHome ? 'project-home-mode' : ''}`}
      data-theme={theme.id}
      data-ui-version="refined"
      style={themeStyle}
    >
      {storageWarning !== null ? (
        <div className="app-storage-warning" role="status">
          {storageWarning}
        </div>
      ) : null}
      <ProjectSidebar
        activeArtifactId={isProjectHome ? null : activeArtifact.id}
        activeProjectId={activeProjectId}
        isCollapsed={isProjectSidebarCollapsed}
        isHome={isProjectHome}
        onCreateArtifact={handleCreateArtifact}
        onCreateProject={handleCreateProject}
        onExportProject={handleExportProject}
        onOpenHome={handleOpenHome}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onDeleteArtifact={handleDeleteArtifact}
        onDeleteProject={handleDeleteProject}
        onRenameArtifact={handleRenameArtifact}
        onRenameProject={handleRenameProject}
        onSelectArtifact={handleSelectArtifact}
        onSelectProject={setActiveProjectId}
        onToggleCollapsed={() => setIsProjectSidebarCollapsed((isCollapsed) => !isCollapsed)}
        onThemePreferenceChange={setThemePreference}
        projects={projects}
        themePreference={themePreference}
      />
      {isProjectHome ? (
        <ProjectHome
          backup={backup}
          backupAvailable={backupAvailable}
          onRevealBackups={() => void revealBackups()}
          projects={projects}
          onCreateProject={handleCreateProject}
          onImportProject={importProject}
          onOpenProject={setActiveProjectId}
        />
      ) : (
        <Suspense fallback={<EditorLoadingState />}>
          {activeArtifact.type === 'class-diagram' ? (
          <DiagramEditor
            key={`${activeProject.id}:${activeArtifact.id}`}
            artifact={activeArtifact}
            canRedo={canRedo}
            canUndo={canUndo}
            saveStatus={saveStatus}
            project={activeProject}
            theme={theme}
            onChangeContent={handleChangeProjectContent}
            onRedo={handleRedo}
            onUndo={handleUndo}
          />
        ) : activeArtifact.type === 'class-sequence-diagram' ? (
          <ClassSequenceDiagramEditor
            key={`${activeProject.id}:${activeArtifact.id}`}
            artifact={activeArtifact}
            canRedo={canRedo}
            canUndo={canUndo}
            saveStatus={saveStatus}
            project={activeProject}
            theme={theme}
            onNavigateToArtifact={(targetArtifactId) => setActiveArtifactId(activeProject.id, targetArtifactId)}
            onLinkAllSequenceDiagrams={(classModelArtifactId) =>
              linkSequenceDiagramsToClassModel(activeProject.id, classModelArtifactId)
            }
            onChangeContent={handleChangeProjectContent}
            onRedo={handleRedo}
            onUndo={handleUndo}
          />
        ) : activeArtifact.type === 'use-case-model' ? (
          <UseCaseModelEditor
            key={`${activeProject.id}:${activeArtifact.id}`}
            artifact={activeArtifact}
            canRedo={canRedo}
            canUndo={canUndo}
            saveStatus={saveStatus}
            project={activeProject}
            theme={theme}
            onChangeContent={handleChangeProjectContent}
            onRedo={handleRedo}
            onUndo={handleUndo}
          />
        ) : activeArtifact.type === 'use-case-flow' ? (
          <UseCaseFlowEditor
            key={`${activeProject.id}:${activeArtifact.id}`}
            artifact={activeArtifact}
            canRedo={canRedo}
            canUndo={canUndo}
            saveStatus={saveStatus}
            project={activeProject}
            theme={theme}
            onChangeContent={handleChangeProjectContent}
            onRedo={handleRedo}
            onUndo={handleUndo}
          />
        ) : (
          <SequenceDiagramEditor
            key={`${activeProject.id}:${activeArtifact.id}`}
            artifact={activeArtifact}
            canRedo={canRedo}
            canUndo={canUndo}
            saveStatus={saveStatus}
            project={activeProject}
            theme={theme}
            onNavigateToArtifact={(targetArtifactId) =>
              setActiveArtifactId(activeProject.id, targetArtifactId)
            }
            onCreateClassMethod={handleCreateClassMethodFromSequence}
            onCreateSequenceDiagramArtifact={(name, initialContent) =>
              createSequenceDiagramArtifact(activeProject.id, name, initialContent)
            }
            onChangeContent={handleChangeProjectContent}
            onRedo={handleRedo}
            onUndo={handleUndo}
          />
          )}
        </Suspense>
      )}
      {projectDialog !== null ? (
        <ProjectNameDialog
          initialName={projectDialog.initialName}
          title={
            projectDialog.mode === 'create'
              ? 'Crear proyecto'
              : projectDialog.mode === 'rename'
                ? 'Renombrar proyecto'
                : projectDialog.mode === 'createArtifact'
                  ? 'Crear artefacto'
                  : 'Renombrar artefacto'
          }
          description={
            projectDialog.mode === 'create' || projectDialog.mode === 'rename'
              ? 'Un proyecto reúne todos los diagramas y especificaciones de un sistema.'
              : 'El nombre distingue este artefacto de los otros del proyecto.'
          }
          confirmLabel={projectDialog.mode === 'create' || projectDialog.mode === 'createArtifact' ? 'Crear' : 'Guardar'}
          onCancel={() => setProjectDialog(null)}
          onConfirm={handleConfirmProjectDialog}
        />
      ) : null}
      {isShortcutsOpen ? <ShortcutsDialog onClose={() => setIsShortcutsOpen(false)} /> : null}
    </div>
  );
}

export default App;
