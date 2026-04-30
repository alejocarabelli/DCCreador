import { DiagramEditor } from './components/DiagramEditor';
import { ProjectNameDialog } from './components/ProjectNameDialog';
import { ProjectSidebar } from './components/ProjectSidebar';
import { useProjects } from './hooks/useProjects';
import { useTheme } from './hooks/useTheme';
import type { DiagramThemeId } from './theme/themes';
import type { DiagramContent } from './types/diagram';
import { normalizeDiagramContent } from './utils/diagramNormalization';
import { useCallback, useEffect, useMemo, useState } from 'react';

type ProjectDialogState =
  | { mode: 'create'; projectId?: never; initialName: string }
  | { mode: 'rename'; projectId: string; initialName: string };

const PROJECT_SIDEBAR_COLLAPSED_KEY = 'class-diagram-project-sidebar-collapsed';
const MAX_HISTORY_ENTRIES = 60;

type ProjectHistory = {
  past: DiagramContent[];
  future: DiagramContent[];
};

const cloneDiagramContent = (content: DiagramContent): DiagramContent =>
  normalizeDiagramContent(JSON.parse(JSON.stringify(content)) as DiagramContent);

const areDiagramContentsEqual = (left: DiagramContent, right: DiagramContent): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

function App() {
  const [projectDialog, setProjectDialog] = useState<ProjectDialogState | null>(null);
  const [isProjectSidebarCollapsed, setIsProjectSidebarCollapsed] = useState(
    () => localStorage.getItem(PROJECT_SIDEBAR_COLLAPSED_KEY) === 'true',
  );
  const [historyByProjectId, setHistoryByProjectId] = useState<Record<string, ProjectHistory>>({});
  const { setThemeId, theme, themeId, themeStyle } = useTheme();
  const {
    activeProject,
    activeProjectId,
    createProject,
    deleteProject,
    importProject,
    projects,
    renameProject,
    setActiveProjectId,
    updateProjectContent,
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

    setProjectDialog(null);
  };

  const handleDeleteProject = (projectId: string): void => {
    const project = projects.find((currentProject) => currentProject.id === projectId);
    const shouldDelete = window.confirm(`Eliminar "${project?.name ?? 'este proyecto'}"?`);

    if (shouldDelete) {
      deleteProject(projectId);
    }
  };

  const activeProjectHistory = useMemo(
    () => (activeProjectId !== null ? historyByProjectId[activeProjectId] : undefined),
    [activeProjectId, historyByProjectId],
  );

  const canUndo = (activeProjectHistory?.past.length ?? 0) > 0;
  const canRedo = (activeProjectHistory?.future.length ?? 0) > 0;

  const handleChangeProjectContent = useCallback(
    (content: DiagramContent): void => {
      if (activeProject === null) {
        return;
      }

      const previousContent = cloneDiagramContent(activeProject.content);
      const nextContent = cloneDiagramContent(content);

      if (areDiagramContentsEqual(previousContent, nextContent)) {
        return;
      }

      setHistoryByProjectId((currentHistory) => {
        const projectHistory = currentHistory[activeProject.id] ?? { past: [], future: [] };

        return {
          ...currentHistory,
          [activeProject.id]: {
            past: [...projectHistory.past, previousContent].slice(-MAX_HISTORY_ENTRIES),
            future: [],
          },
        };
      });
      updateProjectContent(activeProject.id, nextContent);
    },
    [activeProject, updateProjectContent],
  );

  const handleUndo = useCallback((): void => {
    if (activeProject === null) {
      return;
    }

    const projectHistory = historyByProjectId[activeProject.id];
    const previousContent = projectHistory?.past.at(-1);

    if (projectHistory === undefined || previousContent === undefined) {
      return;
    }

    const currentContent = cloneDiagramContent(activeProject.content);

    setHistoryByProjectId((currentHistory) => ({
      ...currentHistory,
      [activeProject.id]: {
        past: projectHistory.past.slice(0, -1),
        future: [currentContent, ...projectHistory.future].slice(0, MAX_HISTORY_ENTRIES),
      },
    }));
    updateProjectContent(activeProject.id, cloneDiagramContent(previousContent));
  }, [activeProject, historyByProjectId, updateProjectContent]);

  const handleRedo = useCallback((): void => {
    if (activeProject === null) {
      return;
    }

    const projectHistory = historyByProjectId[activeProject.id];
    const nextContent = projectHistory?.future[0];

    if (projectHistory === undefined || nextContent === undefined) {
      return;
    }

    const currentContent = cloneDiagramContent(activeProject.content);

    setHistoryByProjectId((currentHistory) => ({
      ...currentHistory,
      [activeProject.id]: {
        past: [...projectHistory.past, currentContent].slice(-MAX_HISTORY_ENTRIES),
        future: projectHistory.future.slice(1),
      },
    }));
    updateProjectContent(activeProject.id, cloneDiagramContent(nextContent));
  }, [activeProject, historyByProjectId, updateProjectContent]);

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
        activeProjectId={activeProjectId}
        isCollapsed={isProjectSidebarCollapsed}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
        onRenameProject={handleRenameProject}
        onSelectProject={setActiveProjectId}
        onToggleCollapsed={() => setIsProjectSidebarCollapsed((isCollapsed) => !isCollapsed)}
        projects={projects}
      />
      {activeProject === null ? (
        <main className="welcome-panel">
          <h2>Creá o abrí un proyecto</h2>
          <p>Los diagramas se guardan automáticamente en este navegador.</p>
          <button type="button" onClick={handleCreateProject}>
            Crear proyecto
          </button>
        </main>
      ) : (
        <DiagramEditor
          key={activeProject.id}
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
      )}
      {projectDialog !== null ? (
        <ProjectNameDialog
          initialName={projectDialog.initialName}
          title={projectDialog.mode === 'create' ? 'Crear proyecto' : 'Renombrar proyecto'}
          onCancel={() => setProjectDialog(null)}
          onConfirm={handleConfirmProjectDialog}
        />
      ) : null}
    </div>
  );
}

export default App;
