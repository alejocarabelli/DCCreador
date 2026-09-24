import {
  Blocks,
  Download,
  FolderClosed,
  FolderOpen,
  Home,
  Keyboard,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { DesignArtifact, DiagramProject } from '../types/diagram';
import type { ThemePreference } from '../hooks/useTheme';
import { APP_NAME } from '../constants/appInfo';
import { ARTIFACT_TYPES } from '../constants/artifactTypes';
import { ArtifactTypeIcon } from './ArtifactTypeIcon';
import { ThemeToggle } from './ThemeToggle';
import { MenuItem, MenuSeparator } from './ui/Toolbar';

type ProjectSidebarProps = {
  themePreference: ThemePreference;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  activeArtifactId: string | null;
  activeProjectId: string | null;
  isCollapsed: boolean;
  isHome: boolean;
  onCreateProject: () => void;
  onOpenHome: () => void;
  onOpenShortcuts: () => void;
  onCreateArtifact: (projectId: string, artifactType: DesignArtifact['type']) => void;
  onDeleteArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onExportProject: (projectId: string) => void;
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

const formatRelativeDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `hoy, ${new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(date)}`;
  }
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(date);
};

const placeMenu = (trigger: HTMLElement, width: number, height: number): { left: number; top: number } => {
  const rect = trigger.getBoundingClientRect();
  const top = rect.bottom + 6 + height > window.innerHeight ? Math.max(8, rect.top - height - 6) : rect.bottom + 6;
  return { left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), top };
};

export function ProjectSidebar({
  activeArtifactId,
  activeProjectId,
  isCollapsed,
  isHome,
  onCreateArtifact,
  onCreateProject,
  onOpenHome,
  onOpenShortcuts,
  onDeleteArtifact,
  onDeleteProject,
  onExportProject,
  onRenameArtifact,
  onRenameProject,
  onSelectArtifact,
  onSelectProject,
  onToggleCollapsed,
  onThemePreferenceChange,
  projects,
  themePreference,
}: ProjectSidebarProps) {
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
    setOptionsMenu(null);
    setNewArtifactMenu({ projectId, ...placeMenu(event.currentTarget, 240, 212) });
  };

  const openOptionsMenu = (values: Omit<SidebarOptionsMenuState, 'left' | 'top'>, event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    setNewArtifactMenu(null);
    setOptionsMenu({ ...values, ...placeMenu(event.currentTarget, 220, values.kind === 'project' ? 130 : 96) });
  };

  useEffect(() => {
    const closeOnOutsideClick = (event: globalThis.MouseEvent): void => {
      const target = event.target as globalThis.Node;
      if (
        optionsMenuRef.current?.contains(target)
        || newArtifactMenuRef.current?.contains(target)
        || (target instanceof Element && target.closest('.sidebar-row-menu, .sidebar-section-action') !== null)
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
      <aside className="project-sidebar collapsed v2-sidebar" aria-label="Navegación">
        <span className="v2-brand-mark" aria-hidden="true"><Blocks size={17} /></span>
        <button aria-label="Mostrar barra lateral" className="v2-tool" type="button" onClick={onToggleCollapsed} title="Mostrar barra lateral (⌘\)">
          <PanelLeftOpen size={16} aria-hidden="true" />
        </button>
        <button
          aria-current={isHome ? 'page' : undefined}
          aria-label="Inicio"
          className={`v2-tool ${isHome ? 'is-pressed' : ''}`}
          type="button"
          onClick={onOpenHome}
          title="Inicio"
        >
          <Home size={16} aria-hidden="true" />
        </button>
        <div className="v2-sidebar-rail-footer">
          <button aria-label="Atajos de teclado" className="v2-tool" type="button" onClick={onOpenShortcuts} title="Atajos de teclado (?)">
            <Keyboard size={16} aria-hidden="true" />
          </button>
          <ThemeToggle className="v2-tool" preference={themePreference} onChange={onThemePreferenceChange} />
        </div>
      </aside>
    );
  }

  return (
    <aside className="project-sidebar v2-sidebar" aria-label="Navegación">
      <div className="v2-sidebar-header">
        <span className="v2-brand-mark" aria-hidden="true"><Blocks size={17} /></span>
        <p className="sidebar-brand-name v2-brand-name">
          {APP_NAME}
        </p>
      </div>

      <nav className="v2-sidebar-nav" aria-label="Proyectos">
        <button
          aria-current={isHome ? 'page' : undefined}
          className={`v2-sidebar-row v2-sidebar-home ${isHome ? 'is-current' : ''}`}
          type="button"
          onClick={onOpenHome}
        >
          <Home size={15} aria-hidden="true" />
          <span className="v2-sidebar-row-label">Inicio</span>
        </button>

        <div className="v2-sidebar-section">
          <h2>Proyectos</h2>
          <button aria-label="Nuevo proyecto" className="v2-tool sidebar-section-action" type="button" onClick={onCreateProject} title="Nuevo proyecto">
            <Plus size={15} aria-hidden="true" />
          </button>
        </div>

        {projects.length === 0 ? (
          <p className="v2-sidebar-empty">Todavía no hay proyectos.</p>
        ) : (
          <ul className="v2-sidebar-projects">
            {projects.map((project) => {
              const isActive = project.id === activeProjectId;
              return (
                <li key={project.id} className={`v2-sidebar-project ${isActive ? 'is-open' : ''}`}>
                  <div className="v2-sidebar-row-wrap">
                    <button
                      aria-current={isActive ? 'true' : undefined}
                      aria-expanded={isActive}
                      className="v2-sidebar-row v2-sidebar-project-row"
                      type="button"
                      title={`Actualizado ${formatRelativeDate(project.updatedAt)}`}
                      onClick={() => onSelectProject(project.id)}
                    >
                      {isActive ? <FolderOpen size={15} aria-hidden="true" /> : <FolderClosed size={15} aria-hidden="true" />}
                      <span className="v2-sidebar-row-label">{project.name}</span>
                    </button>
                    <button
                      aria-controls="sidebar-options-menu"
                      aria-expanded={optionsMenu?.kind === 'project' && optionsMenu.projectId === project.id}
                      aria-haspopup="menu"
                      aria-label={`Opciones del proyecto ${project.name}`}
                      className="v2-tool sidebar-row-menu"
                      type="button"
                      onClick={(event) => openOptionsMenu({ kind: 'project', projectId: project.id }, event)}
                    >
                      <MoreHorizontal size={15} aria-hidden="true" />
                    </button>
                  </div>

                  {isActive ? (
                    <ul className="v2-sidebar-artifacts" aria-label={`Artefactos de ${project.name}`}>
                      {project.artifacts.map((artifact) => {
                        const isCurrent = artifact.id === activeArtifactId;
                        return (
                          <li key={artifact.id} className={`v2-sidebar-row-wrap ${isCurrent ? 'is-current' : ''}`}>
                            <button
                              aria-current={isCurrent ? 'page' : undefined}
                              className="v2-sidebar-row v2-sidebar-artifact-row"
                              type="button"
                              onClick={() => onSelectArtifact(project.id, artifact.id)}
                            >
                              <ArtifactTypeIcon type={artifact.type} />
                              <span className="v2-sidebar-row-label">{artifact.name}</span>
                            </button>
                            <button
                              aria-controls="sidebar-options-menu"
                              aria-expanded={optionsMenu?.kind === 'artifact' && optionsMenu.artifactId === artifact.id}
                              aria-haspopup="menu"
                              aria-label={`Opciones de ${artifact.name}`}
                              className="v2-tool sidebar-row-menu"
                              type="button"
                              onClick={(event) => openOptionsMenu({
                                artifactId: artifact.id,
                                canDelete: project.artifacts.length > 1,
                                kind: 'artifact',
                                projectId: project.id,
                              }, event)}
                            >
                              <MoreHorizontal size={15} aria-hidden="true" />
                            </button>
                          </li>
                        );
                      })}
                      <li>
                        <button
                          aria-expanded={newArtifactMenu?.projectId === project.id}
                          aria-haspopup="menu"
                          className="v2-sidebar-row v2-sidebar-add sidebar-section-action"
                          type="button"
                          onClick={(event) => openNewArtifactMenu(project.id, event)}
                        >
                          <Plus size={15} aria-hidden="true" />
                          <span className="v2-sidebar-row-label">Nuevo artefacto</span>
                        </button>
                      </li>
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="v2-sidebar-footer">
        <ThemeToggle className="v2-tool has-label" preference={themePreference} onChange={onThemePreferenceChange} showLabel />
        <span className="v2-sidebar-footer-tools">
          <button aria-label="Atajos de teclado" className="v2-tool" type="button" onClick={onOpenShortcuts} title="Atajos de teclado (?)">
            <Keyboard size={16} aria-hidden="true" />
          </button>
          <button aria-label="Ocultar barra lateral" className="v2-tool" type="button" onClick={onToggleCollapsed} title="Ocultar barra lateral (⌘\)">
            <PanelLeftClose size={16} aria-hidden="true" />
          </button>
        </span>
      </div>

      {optionsMenu !== null ? (
        <div
          aria-label={optionsMenu.kind === 'project' ? 'Opciones del proyecto' : 'Opciones del artefacto'}
          className="artifact-floating-menu"
          id="sidebar-options-menu"
          ref={optionsMenuRef}
          role="menu"
          style={{ left: optionsMenu.left, top: optionsMenu.top }}
        >
          <MenuItem
            icon={Pencil}
            onSelect={() => {
              if (optionsMenu.kind === 'artifact' && optionsMenu.artifactId !== undefined) {
                onRenameArtifact(optionsMenu.projectId, optionsMenu.artifactId);
              } else {
                onRenameProject(optionsMenu.projectId);
              }
              setOptionsMenu(null);
            }}
          >
            Renombrar…
          </MenuItem>
          {optionsMenu.kind === 'project' ? (
            <MenuItem
              icon={Download}
              onSelect={() => {
                onExportProject(optionsMenu.projectId);
                setOptionsMenu(null);
              }}
            >
              Exportar proyecto (JSON)
            </MenuItem>
          ) : null}
          <MenuSeparator />
          <MenuItem
            danger
            disabled={optionsMenu.kind === 'artifact' && !optionsMenu.canDelete}
            icon={Trash2}
            onSelect={() => {
              if (optionsMenu.kind === 'artifact' && optionsMenu.artifactId !== undefined) {
                onDeleteArtifact(optionsMenu.projectId, optionsMenu.artifactId);
              } else {
                onDeleteProject(optionsMenu.projectId);
              }
              setOptionsMenu(null);
            }}
          >
            {optionsMenu.kind === 'project' ? 'Eliminar proyecto…' : 'Eliminar…'}
          </MenuItem>
        </div>
      ) : null}

      {newArtifactMenu !== null ? (
        <div
          aria-label="Nuevo artefacto"
          className="artifact-floating-menu new-artifact-floating-menu"
          ref={newArtifactMenuRef}
          role="menu"
          style={{ left: newArtifactMenu.left, top: newArtifactMenu.top }}
        >
          {ARTIFACT_TYPES.map((type) => (
            <MenuItem
              key={type.id}
              icon={type.icon}
              onSelect={() => {
                onCreateArtifact(newArtifactMenu.projectId, type.id);
                setNewArtifactMenu(null);
              }}
            >
              {type.label}
            </MenuItem>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
