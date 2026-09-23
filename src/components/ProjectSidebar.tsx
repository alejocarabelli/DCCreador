import {
  Blocks,
  Boxes,
  FileText,
  FolderKanban,
  GitBranch,
  Home,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  UsersRound,
  Workflow,
} from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { DesignArtifact, DiagramProject } from '../types/diagram';
import type { ThemePreference } from '../hooks/useTheme';
import { ArtifactTypeIcon } from './ArtifactTypeIcon';
import { ThemeToggle } from './ThemeToggle';

type ProjectSidebarProps = {
  themePreference: ThemePreference;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  activeArtifactId: string | null;
  activeProjectId: string | null;
  isCollapsed: boolean;
  onCreateProject: () => void;
  onOpenHome: () => void;
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

type SidebarOptionsMenuState = {
  artifactId?: string;
  canDelete?: boolean;
  kind: 'artifact' | 'project';
  left: number;
  projectId: string;
  top: number;
};

type NewArtifactMenuState = {
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
  onOpenHome,
  onDeleteArtifact,
  onDeleteProject,
  onRenameArtifact,
  onRenameProject,
  onSelectArtifact,
  onSelectProject,
  onToggleCollapsed,
  onThemePreferenceChange,
  projects,
  themePreference,
}: ProjectSidebarProps) {
  const sidebarRef = useRef<HTMLElement | null>(null);
  const optionsMenuRef = useRef<HTMLDivElement | null>(null);
  const newArtifactMenuRef = useRef<HTMLDivElement | null>(null);
  const [optionsMenu, setOptionsMenu] = useState<SidebarOptionsMenuState | null>(null);
  const [newArtifactMenu, setNewArtifactMenu] = useState<NewArtifactMenuState | null>(null);

  const openNewArtifactMenu = (projectId: string, event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();

    if (newArtifactMenu?.projectId === projectId) {
      setNewArtifactMenu(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 224;
    const menuHeight = 224;
    const top =
      rect.bottom + 6 + menuHeight > window.innerHeight
        ? Math.max(8, rect.top - menuHeight - 6)
        : rect.bottom + 6;

    setOptionsMenu(null);
    setNewArtifactMenu({
      projectId,
      left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
      top,
    });
  };

  const openOptionsMenu = (
    values: Omit<SidebarOptionsMenuState, 'left' | 'top'>,
    event: MouseEvent<HTMLButtonElement>,
  ): void => {
    event.stopPropagation();
    setNewArtifactMenu(null);

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 148;
    const menuHeight = 88;
    const top =
      rect.bottom + 6 + menuHeight > window.innerHeight
        ? Math.max(8, rect.top - menuHeight - 6)
        : rect.bottom + 6;

    setOptionsMenu({
      ...values,
      left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
      top,
    });
  };

  useEffect(() => {
    const closeOnOutsideClick = (event: globalThis.MouseEvent): void => {
      const target = event.target as globalThis.Node;

      if (
        optionsMenuRef.current?.contains(target) ||
        newArtifactMenuRef.current?.contains(target) ||
        (target instanceof Element &&
          target.closest('.artifact-options-trigger, .new-artifact-trigger') !== null)
      ) {
        return;
      }

      setOptionsMenu(null);
      setNewArtifactMenu(null);
    };

    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOptionsMenu(null);
        setNewArtifactMenu(null);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick, true);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  if (isCollapsed) {
    return (
      <aside className="project-sidebar collapsed" ref={sidebarRef}>
        <div className="sidebar-collapsed-mark" aria-hidden="true">
          <Blocks size={19} />
        </div>
        <button aria-label="Ir al inicio" className="icon-button sidebar-toggle" type="button" onClick={onOpenHome} title="Ir al inicio">
          <Home size={18} />
        </button>
        <button aria-label="Expandir proyectos" className="icon-button sidebar-toggle" type="button" onClick={onToggleCollapsed} title="Expandir proyectos">
          <PanelLeftOpen size={18} />
        </button>
        <ThemeToggle className="icon-button sidebar-toggle sidebar-theme-toggle" preference={themePreference} onChange={onThemePreferenceChange} />
      </aside>
    );
  }

  return (
    <aside className="project-sidebar" ref={sidebarRef}>
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark" aria-hidden="true">
            <Blocks size={19} />
          </span>
          <div>
            <p className="sidebar-brand-name">Modelador de Sistemas</p>
          </div>
        </div>
        <div className="sidebar-header-actions">
          <button aria-label="Ir al inicio" className="icon-button" type="button" onClick={onOpenHome} title="Ir al inicio">
            <Home size={18} />
          </button>
          <button aria-label="Contraer proyectos" className="icon-button" type="button" onClick={onToggleCollapsed} title="Contraer proyectos">
            <PanelLeftClose size={18} />
          </button>
          <button aria-label="Crear proyecto" className="icon-button primary" type="button" onClick={onCreateProject} title="Crear proyecto">
            <Plus size={18} />
          </button>
        </div>
      </div>

      <nav className="project-list" aria-label="Proyectos">
        {projects.length === 0 ? (
          <div className="empty-list">
            <FolderKanban size={23} />
            <p>Tus proyectos aparecerán acá.</p>
          </div>
        ) : (
          projects.map((project) => (
            <article
              className={`project-item ${project.id === activeProjectId ? 'active' : ''}`}
              key={project.id}
              onClick={() => onSelectProject(project.id)}
            >
              <button
                aria-current={project.id === activeProjectId ? 'page' : undefined}
                className="project-main"
                type="button"
                title={`Creado: ${formatDate(project.createdAt)}`}
              >
                <span className="project-main-icon" aria-hidden="true"><FolderKanban size={17} /></span>
                <span className="project-main-copy">
                  <strong>{project.name}</strong>
                  <small>Actualizado {formatDate(project.updatedAt)}</small>
                </span>
              </button>
              <button
                aria-label="Opciones de proyecto"
                aria-controls="sidebar-options-menu"
                aria-expanded={optionsMenu?.kind === 'project' && optionsMenu.projectId === project.id}
                aria-haspopup="menu"
                className="artifact-options-trigger project-options-trigger"
                type="button"
                onClick={(event) => openOptionsMenu({ kind: 'project', projectId: project.id }, event)}
              >
                <MoreHorizontal size={16} />
              </button>
              {project.id === activeProjectId ? (
                <div className="project-artifacts">
                  <div className="project-artifacts-header">
                    <span>Artefactos</span>
                    <button
                      aria-expanded={newArtifactMenu?.projectId === project.id}
                      aria-haspopup="menu"
                      className="new-artifact-trigger"
                      type="button"
                      onClick={(event) => openNewArtifactMenu(project.id, event)}
                      title="Nuevo artefacto"
                    >
                      <Plus size={14} />
                      Nuevo
                    </button>
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
                          aria-current={project.id === activeProjectId && artifact.id === activeArtifactId ? 'page' : undefined}
                          className="artifact-main"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelectArtifact(project.id, artifact.id);
                          }}
                        >
                          <ArtifactTypeIcon type={artifact.type} />
                          {artifact.name}
                        </button>
                        <button
                          aria-label="Opciones de artefacto"
                          aria-controls="sidebar-options-menu"
                          aria-expanded={optionsMenu?.kind === 'artifact' && optionsMenu.artifactId === artifact.id}
                          aria-haspopup="menu"
                          className="artifact-options-trigger"
                          type="button"
                          onClick={(event) =>
                            openOptionsMenu(
                              {
                                artifactId: artifact.id,
                                canDelete: project.artifacts.length > 1,
                                kind: 'artifact',
                                projectId: project.id,
                              },
                              event,
                            )
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
      </nav>
      <div className="sidebar-footer">
        <ThemeToggle className="sidebar-footer-button" preference={themePreference} onChange={onThemePreferenceChange} showLabel />
      </div>
      {optionsMenu !== null ? (
        <div
          id="sidebar-options-menu"
          aria-label={optionsMenu.kind === 'project' ? 'Opciones del proyecto' : 'Opciones del artefacto'}
          className="artifact-floating-menu"
          ref={optionsMenuRef}
          role="menu"
          style={{ left: optionsMenu.left, top: optionsMenu.top }}
        >
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              if (optionsMenu.kind === 'artifact' && optionsMenu.artifactId !== undefined) {
                onRenameArtifact(optionsMenu.projectId, optionsMenu.artifactId);
              } else {
                onRenameProject(optionsMenu.projectId);
              }
              setOptionsMenu(null);
            }}
          >
            Renombrar
          </button>
          <button
            role="menuitem"
            type="button"
            disabled={optionsMenu.kind === 'artifact' && !optionsMenu.canDelete}
            onClick={() => {
              if (optionsMenu.kind === 'artifact' && optionsMenu.artifactId !== undefined) {
                onDeleteArtifact(optionsMenu.projectId, optionsMenu.artifactId);
              } else {
                onDeleteProject(optionsMenu.projectId);
              }
              setOptionsMenu(null);
            }}
          >
            Eliminar
          </button>
        </div>
      ) : null}
      {newArtifactMenu !== null ? (
        <div
          aria-label="Crear artefacto"
          className="artifact-floating-menu new-artifact-floating-menu"
          ref={newArtifactMenuRef}
          role="menu"
          style={{ left: newArtifactMenu.left, top: newArtifactMenu.top }}
        >
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              onCreateArtifact(newArtifactMenu.projectId, 'class-diagram');
              setNewArtifactMenu(null);
            }}
          >
            <Boxes size={15} />
            Diagrama de clases
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              onCreateArtifact(newArtifactMenu.projectId, 'class-sequence-diagram');
              setNewArtifactMenu(null);
            }}
          >
            <GitBranch size={15} />
            Clases de secuencias
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              onCreateArtifact(newArtifactMenu.projectId, 'use-case-model');
              setNewArtifactMenu(null);
            }}
          >
            <UsersRound size={15} />
            Modelo de casos de uso
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              onCreateArtifact(newArtifactMenu.projectId, 'use-case-flow');
              setNewArtifactMenu(null);
            }}
          >
            <FileText size={15} />
            Flujo de sucesos
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              onCreateArtifact(newArtifactMenu.projectId, 'sequence-diagram');
              setNewArtifactMenu(null);
            }}
          >
            <Workflow size={15} />
            Diagrama de secuencia
          </button>
        </div>
      ) : null}
    </aside>
  );
}
