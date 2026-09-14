import { DiagramEditor } from './components/DiagramEditor';
import { ProjectNameDialog } from './components/ProjectNameDialog';
import { ProjectSidebar } from './components/ProjectSidebar';
import { UseCaseFlowEditor } from './components/UseCaseFlowEditor';
import { UseCaseModelEditor } from './components/UseCaseModelEditor';
import { SequenceDiagramEditor } from './components/SequenceDiagramEditor';
import { Blocks, Plus } from 'lucide-react';
import { useProjects } from './hooks/useProjects';
import { useTheme } from './hooks/useTheme';
import { readUiPreference, writeUiPreference } from './storage/uiPreferences';
import type { DiagramThemeId } from './theme/themes';
import type { ArtifactContent, DesignArtifact } from './types/diagram';
import {
  getActiveArtifact,
  normalizeDiagramContent,
  normalizeUseCaseFlowContent,
  normalizeUseCaseModelContent,
} from './utils/diagramNormalization';
import { normalizeSequenceDiagramContent } from './utils/sequenceDiagram';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ProjectDialogState =
  | { mode: 'create'; projectId?: never; initialName: string }
  | { mode: 'rename'; projectId: string; initialName: string }
  | { mode: 'createArtifact'; projectId: string; initialName: string; artifactType: DesignArtifact['type'] }
  | { mode: 'renameArtifact'; projectId: string; artifactId: string; initialName: string };

const PROJECT_SIDEBAR_COLLAPSED_KEY = 'class-diagram-project-sidebar-collapsed';
const MAX_HISTORY_ENTRIES = 60;
const HISTORY_BURST_WINDOW_MS = 650;

type ProjectHistory = {
  past: ArtifactContent[];
  future: ArtifactContent[];
};

type ContentChangeOptions = {
  separateHistoryEntry?: boolean;
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
    return normalizeSequenceDiagramContent(cloned);
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

  return normalizeDiagramContent(cloned as Parameters<typeof normalizeDiagramContent>[0]);
};

const areArtifactContentsEqual = (left: ArtifactContent, right: ArtifactContent): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

function App() {
  const [projectDialog, setProjectDialog] = useState<ProjectDialogState | null>(null);
  const [isProjectSidebarCollapsed, setIsProjectSidebarCollapsed] = useState(
    () => readUiPreference(PROJECT_SIDEBAR_COLLAPSED_KEY) === 'true',
  );
  const [historyByArtifactId, setHistoryByArtifactId] = useState<Record<string, ProjectHistory>>({});
  const historyBurstRef = useRef<{ key: string; updatedAt: number } | null>(null);
  const { setThemeId, theme, themeId, themeStyle } = useTheme();
  const {
    activeProject,
    activeProjectId,
    createClassDiagramArtifact,
    createUseCaseFlowArtifact,
    createUseCaseModelArtifact,
    createSequenceDiagramArtifact,
    createProject,
    deleteArtifact,
    deleteProject,
    importProject,
    projects,
    renameArtifact,
    renameProject,
    setActiveArtifactId,
    setActiveProjectId,
    storageWarning,
    updateProjectArtifactContent,
  } = useProjects();

  const handleCreateProject = (): void => {
    setProjectDialog({ mode: 'create', initialName: 'Nuevo diagrama' });
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
      } else {
        createClassDiagramArtifact(projectDialog.projectId, name);
      }
    }

    if (projectDialog?.mode === 'renameArtifact') {
      renameArtifact(projectDialog.projectId, projectDialog.artifactId, name);
    }

    setProjectDialog(null);
  };

  const handleDeleteProject = (projectId: string): void => {
    const project = projects.find((currentProject) => currentProject.id === projectId);
    const shouldDelete = window.confirm(`Eliminar "${project?.name ?? 'este proyecto'}"?`);

    if (shouldDelete) {
      deleteProject(projectId);
      setHistoryByArtifactId((currentHistory) =>
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
            : 'Nuevo diagrama de clases',
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

  const handleDeleteArtifact = (projectId: string, artifactId: string): void => {
    const project = projects.find((currentProject) => currentProject.id === projectId);
    const artifact = project?.artifacts.find((currentArtifact) => currentArtifact.id === artifactId);

    if ((project?.artifacts.length ?? 0) <= 1) {
      window.alert('No se puede eliminar el último artefacto del proyecto.');
      return;
    }

    const shouldDelete = window.confirm(`Eliminar "${artifact?.name ?? 'este artefacto'}"?`);

    if (shouldDelete) {
      deleteArtifact(projectId, artifactId);
      setHistoryByArtifactId((currentHistory) => {
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

      const previousContent = cloneArtifactContent(activeArtifact);
      const nextContent = cloneContentForType(activeArtifact.type, content);

      if (areArtifactContentsEqual(previousContent, nextContent)) {
        return;
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

      setHistoryByArtifactId((currentHistory) => {
        const projectHistory = currentHistory[activeHistoryKey] ?? { past: [], future: [] };

        return {
          ...currentHistory,
          [activeHistoryKey]: {
            past: shouldCreateHistoryEntry
              ? [...projectHistory.past, previousContent].slice(-MAX_HISTORY_ENTRIES)
              : projectHistory.past,
            future: [],
          },
        };
      });
      updateProjectArtifactContent(activeProject.id, activeArtifact.id, nextContent);
    },
    [activeArtifact, activeHistoryKey, activeProject, updateProjectArtifactContent],
  );

  const handleUndo = useCallback((): void => {
    if (activeProject === null || activeArtifact === null || activeHistoryKey === null) {
      return;
    }

    const projectHistory = historyByArtifactId[activeHistoryKey];
    const previousContent = projectHistory?.past.at(-1);

    if (projectHistory === undefined || previousContent === undefined) {
      return;
    }

    const currentContent = cloneArtifactContent(activeArtifact);
    historyBurstRef.current = null;

    setHistoryByArtifactId((currentHistory) => ({
      ...currentHistory,
      [activeHistoryKey]: {
        past: projectHistory.past.slice(0, -1),
        future: [currentContent, ...projectHistory.future].slice(0, MAX_HISTORY_ENTRIES),
      },
    }));
    updateProjectArtifactContent(activeProject.id, activeArtifact.id, cloneContentForType(activeArtifact.type, previousContent));
  }, [activeArtifact, activeHistoryKey, activeProject, historyByArtifactId, updateProjectArtifactContent]);

  const handleRedo = useCallback((): void => {
    if (activeProject === null || activeArtifact === null || activeHistoryKey === null) {
      return;
    }

    const projectHistory = historyByArtifactId[activeHistoryKey];
    const nextContent = projectHistory?.future[0];

    if (projectHistory === undefined || nextContent === undefined) {
      return;
    }

    const currentContent = cloneArtifactContent(activeArtifact);
    historyBurstRef.current = null;

    setHistoryByArtifactId((currentHistory) => ({
      ...currentHistory,
      [activeHistoryKey]: {
        past: [...projectHistory.past, currentContent].slice(-MAX_HISTORY_ENTRIES),
        future: projectHistory.future.slice(1),
      },
    }));
    updateProjectArtifactContent(activeProject.id, activeArtifact.id, cloneContentForType(activeArtifact.type, nextContent));
  }, [activeArtifact, activeHistoryKey, activeProject, historyByArtifactId, updateProjectArtifactContent]);

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

  return (
    <div
      className={`app-shell ${isProjectSidebarCollapsed ? 'project-sidebar-collapsed' : ''}`}
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
        activeArtifactId={activeArtifact?.id ?? null}
        activeProjectId={activeProjectId}
        isCollapsed={isProjectSidebarCollapsed}
        onCreateArtifact={handleCreateArtifact}
        onCreateProject={handleCreateProject}
        onDeleteArtifact={handleDeleteArtifact}
        onDeleteProject={handleDeleteProject}
        onRenameArtifact={handleRenameArtifact}
        onRenameProject={handleRenameProject}
        onSelectArtifact={handleSelectArtifact}
        onSelectProject={setActiveProjectId}
        onToggleCollapsed={() => setIsProjectSidebarCollapsed((isCollapsed) => !isCollapsed)}
        projects={projects}
      />
      {activeProject === null || activeArtifact === null ? (
        <main className="welcome-panel">
          <div className="welcome-mark" aria-hidden="true">
            <Blocks size={28} />
          </div>
          <p className="eyebrow">Modelador de Sistemas</p>
          <h2>Empezá tu primer proyecto</h2>
          <p>Organizá diagramas y especificaciones en un mismo espacio de trabajo.</p>
          <button className="welcome-primary-action" type="button" onClick={handleCreateProject}>
            <Plus size={17} />
            Crear proyecto
          </button>
          <small>Guardado local automático</small>
        </main>
      ) : (
        activeArtifact.type === 'class-diagram' ? (
          <DiagramEditor
            key={`${activeProject.id}:${activeArtifact.id}`}
            artifact={activeArtifact}
            canRedo={canRedo}
            canUndo={canUndo}
            project={activeProject}
            theme={theme}
            themeId={themeId}
            onChangeContent={handleChangeProjectContent}
            onRedo={handleRedo}
            onUndo={handleUndo}
            onImportProject={importProject}
            onThemeChange={(nextThemeId) => setThemeId(nextThemeId as DiagramThemeId)}
          />
        ) : activeArtifact.type === 'use-case-model' ? (
          <UseCaseModelEditor
            key={`${activeProject.id}:${activeArtifact.id}`}
            artifact={activeArtifact}
            canRedo={canRedo}
            canUndo={canUndo}
            project={activeProject}
            theme={theme}
            themeId={themeId}
            onChangeContent={handleChangeProjectContent}
            onRedo={handleRedo}
            onUndo={handleUndo}
            onImportProject={importProject}
            onThemeChange={(nextThemeId) => setThemeId(nextThemeId as DiagramThemeId)}
          />
        ) : activeArtifact.type === 'use-case-flow' ? (
          <UseCaseFlowEditor
            key={`${activeProject.id}:${activeArtifact.id}`}
            artifact={activeArtifact}
            canRedo={canRedo}
            canUndo={canUndo}
            project={activeProject}
            theme={theme}
            themeId={themeId}
            onChangeContent={handleChangeProjectContent}
            onRedo={handleRedo}
            onUndo={handleUndo}
            onImportProject={importProject}
            onThemeChange={(nextThemeId) => setThemeId(nextThemeId as DiagramThemeId)}
          />
        ) : (
          <SequenceDiagramEditor
            key={`${activeProject.id}:${activeArtifact.id}`}
            artifact={activeArtifact}
            canRedo={canRedo}
            canUndo={canUndo}
            project={activeProject}
            theme={theme}
            themeId={themeId}
            onChangeContent={handleChangeProjectContent}
            onRedo={handleRedo}
            onUndo={handleUndo}
            onImportProject={importProject}
            onThemeChange={(nextThemeId) => setThemeId(nextThemeId as DiagramThemeId)}
          />
        )
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
          onCancel={() => setProjectDialog(null)}
          onConfirm={handleConfirmProjectDialog}
        />
      ) : null}
    </div>
  );
}

export default App;
