import { DiagramEditor } from './components/DiagramEditor';
import { ProjectNameDialog } from './components/ProjectNameDialog';
import { ProjectSidebar } from './components/ProjectSidebar';
import { useProjects } from './hooks/useProjects';
import { useTheme } from './hooks/useTheme';
import type { DiagramThemeId } from './theme/themes';
import { useEffect, useState } from 'react';

type ProjectDialogState =
  | { mode: 'create'; projectId?: never; initialName: string }
  | { mode: 'rename'; projectId: string; initialName: string };

const PROJECT_SIDEBAR_COLLAPSED_KEY = 'class-diagram-project-sidebar-collapsed';

function App() {
  const [projectDialog, setProjectDialog] = useState<ProjectDialogState | null>(null);
  const [isProjectSidebarCollapsed, setIsProjectSidebarCollapsed] = useState(
    () => localStorage.getItem(PROJECT_SIDEBAR_COLLAPSED_KEY) === 'true',
  );
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
          project={activeProject}
          theme={theme}
          themeId={themeId}
          onChangeContent={(content) => updateProjectContent(activeProject.id, content)}
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
