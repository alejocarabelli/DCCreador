import { DiagramEditor } from './components/DiagramEditor';
import { ProjectNameDialog } from './components/ProjectNameDialog';
import { ProjectSidebar } from './components/ProjectSidebar';
import { UseCaseModelEditor } from './components/UseCaseModelEditor';
import { useProjects } from './hooks/useProjects';
import { useTheme } from './hooks/useTheme';
import type { DiagramThemeId } from './theme/themes';
import type { DesignArtifact, DiagramContent } from './types/diagram';
import { getActiveArtifact, normalizeDiagramContent, normalizeUseCaseModelContent } from './utils/diagramNormalization';
import { useCallback, useEffect, useMemo, useState } from 'react';

type ProjectDialogState =
  | { mode: 'create'; projectId?: never; initialName: string }
  | { mode: 'rename'; projectId: string; initialName: string }
  | { mode: 'createArtifact'; projectId: string; initialName: string; artifactType: DesignArtifact['type'] }
  | { mode: 'renameArtifact'; projectId: string; artifactId: string; initialName: string };

const PROJECT_SIDEBAR_COLLAPSED_KEY = 'class-diagram-project-sidebar-collapsed';
const MAX_HISTORY_ENTRIES = 60;

type ProjectHistory = {
  past: DiagramContent[];
  future: DiagramContent[];
};

const cloneDiagramContent = (content: DiagramContent): DiagramContent => {
  const cloned = JSON.parse(JSON.stringify(content)) as DiagramContent;
  return cloned.nodes.some((node) => node.type === 'useCaseActor' || node.type === 'useCaseOval' || node.type === 'systemBoundary')
    ? normalizeUseCaseModelContent(cloned as Parameters<typeof normalizeUseCaseModelContent>[0])
    : normalizeDiagramContent(cloned as Parameters<typeof normalizeDiagramContent>[0]);
};

const areDiagramContentsEqual = (left: DiagramContent, right: DiagramContent): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

function App() {
  const [projectDialog, setProjectDialog] = useState<ProjectDialogState | null>(null);
  const [isProjectSidebarCollapsed, setIsProjectSidebarCollapsed] = useState(
    () => localStorage.getItem(PROJECT_SIDEBAR_COLLAPSED_KEY) === 'true',
  );
  const [historyByArtifactId, setHistoryByArtifactId] = useState<Record<string, ProjectHistory>>({});
  const { setThemeId, theme, themeId, themeStyle } = useTheme();
  const {
    activeProject,
    activeProjectId,
    createClassDiagramArtifact,
    createUseCaseModelArtifact,
    createProject,
    deleteArtifact,
    deleteProject,
    importProject,
    projects,
    renameArtifact,
    renameProject,
    setActiveArtifactId,
    setActiveProjectId,
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
    }
  };

  const handleCreateArtifact = (projectId: string, artifactType: DesignArtifact['type']): void => {
    setProjectDialog({
      mode: 'createArtifact',
      projectId,
      artifactType,
      initialName: artifactType === 'use-case-model' ? 'Modelo de casos de uso' : 'Nuevo diagrama de clases',
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
    }
  };

  const handleSelectArtifact = (projectId: string, artifactId: string): void => {
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
    (content: DiagramContent): void => {
      if (activeProject === null || activeArtifact === null || activeHistoryKey === null) {
        return;
      }

      const previousContent = cloneDiagramContent(activeArtifact.content);
      const nextContent = cloneDiagramContent(content);

      if (areDiagramContentsEqual(previousContent, nextContent)) {
        return;
      }

      setHistoryByArtifactId((currentHistory) => {
        const projectHistory = currentHistory[activeHistoryKey] ?? { past: [], future: [] };

        return {
          ...currentHistory,
          [activeHistoryKey]: {
            past: [...projectHistory.past, previousContent].slice(-MAX_HISTORY_ENTRIES),
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

    const currentContent = cloneDiagramContent(activeArtifact.content);

    setHistoryByArtifactId((currentHistory) => ({
      ...currentHistory,
      [activeHistoryKey]: {
        past: projectHistory.past.slice(0, -1),
        future: [currentContent, ...projectHistory.future].slice(0, MAX_HISTORY_ENTRIES),
      },
    }));
    updateProjectArtifactContent(activeProject.id, activeArtifact.id, cloneDiagramContent(previousContent));
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

    const currentContent = cloneDiagramContent(activeArtifact.content);

    setHistoryByArtifactId((currentHistory) => ({
      ...currentHistory,
      [activeHistoryKey]: {
        past: [...projectHistory.past, currentContent].slice(-MAX_HISTORY_ENTRIES),
        future: projectHistory.future.slice(1),
      },
    }));
    updateProjectArtifactContent(activeProject.id, activeArtifact.id, cloneDiagramContent(nextContent));
  }, [activeArtifact, activeHistoryKey, activeProject, historyByArtifactId, updateProjectArtifactContent]);

  useEffect(() => {
    localStorage.setItem(PROJECT_SIDEBAR_COLLAPSED_KEY, String(isProjectSidebarCollapsed));
  }, [isProjectSidebarCollapsed]);

  return (
    <div
      className={`app-shell ${isProjectSidebarCollapsed ? 'project-sidebar-collapsed' : ''}`}
      data-theme={theme.id}
      style={themeStyle}
    >
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
          <h2>Creá o abrí un proyecto</h2>
          <p>Los diagramas se guardan automáticamente en este navegador.</p>
          <button type="button" onClick={handleCreateProject}>
            Crear proyecto
          </button>
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
        ) : (
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
