import { FolderOpen, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import type { DiagramProject } from '../types/diagram';

type ProjectSidebarProps = {
  activeProjectId: string | null;
  isCollapsed: boolean;
  onCreateProject: () => void;
  onDeleteProject: (projectId: string) => void;
  onRenameProject: (projectId: string) => void;
  onSelectProject: (projectId: string) => void;
  onToggleCollapsed: () => void;
  projects: DiagramProject[];
};

const formatDate = (isoDate: string): string =>
  new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(isoDate));

export function ProjectSidebar({
  activeProjectId,
  isCollapsed,
  onCreateProject,
  onDeleteProject,
  onRenameProject,
  onSelectProject,
  onToggleCollapsed,
  projects,
}: ProjectSidebarProps) {
  if (isCollapsed) {
    return (
      <aside className="project-sidebar collapsed">
        <button className="icon-button sidebar-toggle" type="button" onClick={onToggleCollapsed} title="Expandir proyectos">
          <PanelLeftOpen size={18} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="project-sidebar">
      <div className="sidebar-header">
        <div>
          <p className="eyebrow">Proyectos</p>
          <h1>Diagramas de clases</h1>
        </div>
        <div className="sidebar-header-actions">
          <button className="icon-button" type="button" onClick={onToggleCollapsed} title="Contraer proyectos">
            <PanelLeftClose size={18} />
          </button>
          <button className="icon-button primary" type="button" onClick={onCreateProject} title="Crear proyecto">
            <Plus size={18} />
          </button>
        </div>
      </div>

      <div className="project-list">
        {projects.length === 0 ? (
          <div className="empty-list">
            <FolderOpen size={24} />
            <p>No hay proyectos todavía.</p>
            <button type="button" onClick={onCreateProject}>
              Crear primer proyecto
            </button>
          </div>
        ) : (
          projects.map((project) => (
            <article
              className={`project-item ${project.id === activeProjectId ? 'active' : ''}`}
              key={project.id}
              onClick={() => onSelectProject(project.id)}
            >
              <button className="project-main" type="button">
                <strong>{project.name}</strong>
                <span>Creado: {formatDate(project.createdAt)}</span>
                <span>Modificado: {formatDate(project.updatedAt)}</span>
              </button>
              <div className="project-actions">
                <button type="button" onClick={() => onRenameProject(project.id)} title="Renombrar proyecto">
                  <Pencil size={15} />
                </button>
                <button type="button" onClick={() => onDeleteProject(project.id)} title="Eliminar proyecto">
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </aside>
  );
}
