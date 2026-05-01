import { FolderOpen, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from 'react';
import type { DesignArtifact, DiagramProject } from '../types/diagram';

type ProjectSidebarProps = {
  activeArtifactId: string | null;
  activeProjectId: string | null;
  isCollapsed: boolean;
  onCreateProject: () => void;
  onCreateArtifact: (projectId: string, artifactType: DesignArtifact['type']) => void;
  onDeleteArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onRenameArtifact: (projectId: string, artifactId: string) => void;
  onRenameProject: (projectId: string) => void;
  onSelectArtifact: (projectId: string, artifactId: string) => void;
  onSelectProject: (projectId: string) => void;
  onToggleCollapsed: () => void;
  projects: DiagramProject[];
};

type ArtifactOptionsMenuState = {
  artifactId: string;
  canDelete: boolean;
  left: number;
  projectId: string;
  top: number;
};

const formatDate = (isoDate: string): string =>
  new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(isoDate));

export function ProjectSidebar({
  activeArtifactId,
  activeProjectId,
  isCollapsed,
  onCreateArtifact,
  onCreateProject,
  onDeleteArtifact,
  onDeleteProject,
  onRenameArtifact,
  onRenameProject,
  onSelectArtifact,
  onSelectProject,
  onToggleCollapsed,
  projects,
}: ProjectSidebarProps) {
  const sidebarRef = useRef<HTMLElement | null>(null);
  const artifactOptionsMenuRef = useRef<HTMLDivElement | null>(null);
  const [artifactOptionsMenu, setArtifactOptionsMenu] = useState<ArtifactOptionsMenuState | null>(null);

  const closeArtifactMenus = (except?: HTMLDetailsElement): void => {
    sidebarRef.current?.querySelectorAll<HTMLDetailsElement>('details.artifact-item-menu').forEach((details) => {
      if (details !== except) {
        details.removeAttribute('open');
      }
    });
  };

  const handleArtifactMenuToggle = (event: SyntheticEvent<HTMLDetailsElement>): void => {
    if (event.currentTarget.open) {
      closeArtifactMenus(event.currentTarget);
      setArtifactOptionsMenu(null);
    }
  };

  const openArtifactOptionsMenu = (
    projectId: string,
    artifactId: string,
    canDelete: boolean,
    event: MouseEvent<HTMLButtonElement>,
  ): void => {
    event.stopPropagation();
    closeArtifactMenus();

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 148;
    const menuHeight = 88;
    const top =
      rect.bottom + 6 + menuHeight > window.innerHeight
        ? Math.max(8, rect.top - menuHeight - 6)
        : rect.bottom + 6;

    setArtifactOptionsMenu({
      artifactId,
      canDelete,
      left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
      projectId,
      top,
    });
  };

  useEffect(() => {
    const closeOnOutsideClick = (event: globalThis.MouseEvent): void => {
      const target = event.target as globalThis.Node;

      if (
        artifactOptionsMenuRef.current?.contains(target) ||
        (target instanceof Element && target.closest('.artifact-options-trigger') !== null)
      ) {
        return;
      }

      if (!sidebarRef.current?.contains(target)) {
        closeArtifactMenus();
      }

      setArtifactOptionsMenu(null);
    };

    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeArtifactMenus();
        setArtifactOptionsMenu(null);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  if (isCollapsed) {
    return (
      <aside className="project-sidebar collapsed" ref={sidebarRef}>
        <button className="icon-button sidebar-toggle" type="button" onClick={onToggleCollapsed} title="Expandir proyectos">
          <PanelLeftOpen size={18} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="project-sidebar" ref={sidebarRef}>
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
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRenameProject(project.id);
                  }}
                  title="Renombrar proyecto"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteProject(project.id);
                  }}
                  title="Eliminar proyecto"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {project.id === activeProjectId ? (
                <div className="project-artifacts">
                  <div className="project-artifacts-header">
                    <span>Artefactos</span>
                    <details className="artifact-item-menu" onToggle={handleArtifactMenuToggle}>
                      <summary
                        className="new-artifact-summary"
                        aria-label="Nuevo artefacto"
                        onClick={(event) => event.stopPropagation()}
                        title="Nuevo artefacto"
                      >
                        <Plus size={14} />
                        Nuevo artefacto
                      </summary>
                      <div className="artifact-item-menu-content">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onCreateArtifact(project.id, 'class-diagram');
                            event.currentTarget.closest('details')?.removeAttribute('open');
                          }}
                        >
                          Diagrama de clases
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onCreateArtifact(project.id, 'use-case-model');
                            event.currentTarget.closest('details')?.removeAttribute('open');
                          }}
                        >
                          Modelo de casos de uso
                        </button>
                      </div>
                    </details>
                  </div>
                  <div className="artifact-list">
                    {project.artifacts.map((artifact) => (
                      <div
                        className={`artifact-item ${
                          project.id === activeProjectId && artifact.id === activeArtifactId ? 'active' : ''
                        }`}
                        key={artifact.id}
                      >
                        <button
                          className="artifact-main"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelectArtifact(project.id, artifact.id);
                          }}
                        >
                          {artifact.name}
                        </button>
                        <button
                          aria-label="Opciones de artefacto"
                          className="artifact-options-trigger"
                          type="button"
                          onClick={(event) =>
                            openArtifactOptionsMenu(project.id, artifact.id, project.artifacts.length > 1, event)
                          }
                        >
                          <MoreHorizontal size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
      {artifactOptionsMenu !== null ? (
        <div
          className="artifact-floating-menu"
          ref={artifactOptionsMenuRef}
          style={{ left: artifactOptionsMenu.left, top: artifactOptionsMenu.top }}
        >
          <button
            type="button"
            onClick={() => {
              onRenameArtifact(artifactOptionsMenu.projectId, artifactOptionsMenu.artifactId);
              setArtifactOptionsMenu(null);
            }}
          >
            Renombrar
          </button>
          <button
            type="button"
            disabled={!artifactOptionsMenu.canDelete}
            onClick={() => {
              onDeleteArtifact(artifactOptionsMenu.projectId, artifactOptionsMenu.artifactId);
              setArtifactOptionsMenu(null);
            }}
          >
            Eliminar
          </button>
        </div>
      ) : null}
    </aside>
  );
}
