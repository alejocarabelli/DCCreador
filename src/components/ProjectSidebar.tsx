import {
  Blocks,
  Download,
  GitBranch,
  FolderClosed,
  Home,
  Keyboard,
  MoreHorizontal,
  MoveRight,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { DesignArtifact, DiagramProject } from '../types/diagram';
import type { ThemePreference } from '../hooks/useTheme';
import { APP_NAME, APP_VERSION } from '../constants/appInfo';
import { ARTIFACT_TYPES } from '../constants/artifactTypes';
import { ArtifactTypeIcon } from './ArtifactTypeIcon';
import { ThemeToggle } from './ThemeToggle';
import { MenuItem, MenuSeparator } from './ui/Toolbar';
import { shortcutLabel } from '../utils/shortcutLabel';
import {
  readSidebarOthersOpen,
  readSidebarSplit,
  writeSidebarOthersOpen,
  writeSidebarSplit,
} from '../storage/uiPreferences';
import { filterProjectsByName, formatShortProjectDate, shouldShowProjectFilter, sortProjectsByRecency } from '../utils/projectSidebar';
import { SidebarFilter, SidebarPane, SidebarSash } from './SidebarPane';
import type { LatestRelease } from '../utils/appUpdate';

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
  onExportArtifact: (projectId: string, artifactId: string) => void;
  onImportArtifact: (projectId: string) => void;
  onMoveArtifact: (projectId: string, artifactId: string) => void;
  onConvertToSequenceModel?: (projectId: string, artifactId: string) => void;
  onRenameArtifact: (projectId: string, artifactId: string) => void;
  onRenameProject: (projectId: string) => void;
  onSelectArtifact: (projectId: string, artifactId: string) => void;
  onSelectProject: (projectId: string) => void;
  onToggleCollapsed: () => void;
  onDismissUpdate?: () => void;
  projects: DiagramProject[];
  /** A newer release to announce, already filtered for a hidden version. */
  update?: LatestRelease | null;
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
  onExportArtifact,
  onImportArtifact,
  onMoveArtifact,
  onConvertToSequenceModel,
  onRenameArtifact,
  onRenameProject,
  onSelectArtifact,
  onSelectProject,
  onDismissUpdate,
  onToggleCollapsed,
  onThemePreferenceChange,
  projects,
  themePreference,
  update,
}: ProjectSidebarProps) {
  const optionsMenuRef = useRef<HTMLDivElement | null>(null);
  const newArtifactMenuRef = useRef<HTMLDivElement | null>(null);
  const [optionsMenu, setOptionsMenu] = useState<SidebarOptionsMenuState | null>(null);
  const [newArtifactMenu, setNewArtifactMenu] = useState<NewArtifactMenuState | null>(null);
  const panesRef = useRef<HTMLDivElement | null>(null);
  const currentPaneRef = useRef<HTMLElement | null>(null);
  const [othersOpen, setOthersOpen] = useState(readSidebarOthersOpen);
  const [split, setSplit] = useState<number | null>(readSidebarSplit);
  const [filterQuery, setFilterQuery] = useState('');

  // The open project, only while one is open: Inicio shows a single «Proyectos» list instead.
  const openProject = isHome ? null : projects.find((project) => project.id === activeProjectId) ?? null;
  const otherProjects = sortProjectsByRecency(projects, openProject?.id ?? null);
  const showFilter = (openProject === null || othersOpen) && shouldShowProjectFilter(otherProjects.length);
  const visibleProjects = showFilter ? filterProjectsByName(otherProjects, filterQuery) : otherProjects;
  // On Inicio the list is the whole screen of the sidebar, so it is never folded.
  const projectsPaneOpen = openProject === null || othersOpen;
  const bothOpen = openProject !== null && othersOpen;

  const toggleOthers = (): void => {
    setOthersOpen(!othersOpen);
    writeSidebarOthersOpen(!othersOpen);
  };

  const changeSplit = (fraction: number | null, persist: boolean): void => {
    setSplit(fraction);
    if (persist) writeSidebarSplit(fraction);
  };

  const openNewArtifactMenu = (projectId: string, event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    if (newArtifactMenu?.projectId === projectId) {
      setNewArtifactMenu(null);
      return;
    }
    setOptionsMenu(null);
    setNewArtifactMenu({ projectId, ...placeMenu(event.currentTarget, 310, 310) });
  };

  const openOptionsMenu = (values: Omit<SidebarOptionsMenuState, 'left' | 'top'>, event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    setNewArtifactMenu(null);
    setOptionsMenu({ ...values, ...placeMenu(event.currentTarget, 260, 180) });
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

  const newArtifactMenuElement = newArtifactMenu !== null ? (
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
          <MenuSeparator />
          <MenuItem icon={Upload} onSelect={() => {
            onImportArtifact(newArtifactMenu.projectId);
            setNewArtifactMenu(null);
          }}>Importar artefacto…</MenuItem>
        </div>
      ) : null;

  const collapseButton = (
    <button
      aria-expanded={!isCollapsed}
      aria-label={isCollapsed ? 'Mostrar barra lateral' : 'Ocultar barra lateral'}
      className="v2-tool v2-sidebar-toggle"
      type="button"
      onClick={onToggleCollapsed}
      title={shortcutLabel(`${isCollapsed ? 'Mostrar' : 'Ocultar'} barra lateral (⌘\\)`)}
    >
      {isCollapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
    </button>
  );

  if (isCollapsed) {
    // The rail keeps what you use most: the toggle in the very same spot as
    // when the sidebar is open, Inicio, and the open project's artifacts.
    const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
    return (
      <aside className="project-sidebar collapsed v2-sidebar" aria-label="Navegación">
        <div className="v2-sidebar-header">{collapseButton}</div>
        <nav className="v2-sidebar-rail" aria-label="Navegación rápida">
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
          {activeProject !== null ? (
            <>
              <span className="v2-sidebar-rail-divider" aria-hidden="true" />
              {activeProject.artifacts.map((artifact) => {
                const isCurrent = artifact.id === activeArtifactId;
                return (
                  <button
                    aria-current={isCurrent ? 'page' : undefined}
                    aria-label={artifact.name}
                    className={`v2-tool ${isCurrent ? 'is-pressed' : ''}`}
                    key={artifact.id}
                    type="button"
                    onClick={() => onSelectArtifact(activeProject.id, artifact.id)}
                    title={`${artifact.name} · ${activeProject.name}`}
                  >
                    <ArtifactTypeIcon type={artifact.type} />
                  </button>
                );
              })}
              <button
                aria-expanded={newArtifactMenu?.projectId === activeProject.id}
                aria-haspopup="menu"
                aria-label="Nuevo artefacto"
                className="v2-tool"
                type="button"
                onClick={(event) => openNewArtifactMenu(activeProject.id, event)}
                title="Nuevo artefacto"
              >
                <Plus size={16} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </nav>
        <div className="v2-sidebar-rail-footer">
          <button aria-label="Atajos de teclado" className="v2-tool" type="button" onClick={onOpenShortcuts} title="Atajos de teclado (?)">
            <Keyboard size={16} aria-hidden="true" />
            {update ? (
              <span className="v2-update-dot" role="img" aria-label={`Hay una versión nueva (${update.version})`} title={`Hay una versión nueva (${update.version})`} />
            ) : null}
          </button>
          <ThemeToggle preference={themePreference} onChange={onThemePreferenceChange} />
        </div>
        {newArtifactMenuElement}
      </aside>
    );
  }

  return (
    <aside className="project-sidebar v2-sidebar" aria-label="Navegación">
      <div className="v2-sidebar-header">
        {collapseButton}
        <p className="sidebar-brand-name v2-brand-name">
          <span className="v2-brand-mark" aria-hidden="true"><Blocks size={15} /></span>
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

        <div className="v2-sidebar-panes" ref={panesRef}>
          {openProject !== null ? (
            <SidebarPane
              actions={(
                <>
                  <button
                    aria-expanded={newArtifactMenu?.projectId === openProject.id}
                    aria-haspopup="menu"
                    aria-label="Nuevo artefacto"
                    className="v2-tool sidebar-section-action"
                    type="button"
                    onClick={(event) => openNewArtifactMenu(openProject.id, event)}
                    title="Nuevo artefacto"
                  >
                    <Plus size={15} aria-hidden="true" />
                  </button>
                  <button
                    aria-controls="sidebar-options-menu"
                    aria-expanded={optionsMenu?.kind === 'project' && optionsMenu.projectId === openProject.id}
                    aria-haspopup="menu"
                    aria-label={`Opciones del proyecto ${openProject.name}`}
                    className="v2-tool sidebar-section-action"
                    type="button"
                    onClick={(event) => openOptionsMenu({ kind: 'project', projectId: openProject.id }, event)}
                    title="Opciones del proyecto"
                  >
                    <MoreHorizontal size={15} aria-hidden="true" />
                  </button>
                </>
              )}
              className={bothOpen ? (split === null ? 'is-auto-split' : '') : ''}
              id="sidebar-current-pane"
              // The open project's artifacts are always shown: no fold button.
              collapsible={false}
              open
              paneRef={currentPaneRef}
              revealActions
              strong
              style={bothOpen && split !== null ? { flex: `${split} 1 0` } : undefined}
              title={openProject.name}
            >
              <ul className="v2-sidebar-artifacts" aria-label={`Artefactos de ${openProject.name}`}>
                {openProject.artifacts.map((artifact) => {
                  const isCurrent = artifact.id === activeArtifactId;
                  return (
                    <li key={artifact.id} className={`v2-sidebar-row-wrap ${isCurrent ? 'is-current' : ''}`}>
                      <button
                        aria-current={isCurrent ? 'page' : undefined}
                        className="v2-sidebar-row v2-sidebar-artifact-row"
                        type="button"
                        onClick={() => onSelectArtifact(openProject.id, artifact.id)}
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
                          canDelete: openProject.artifacts.length > 1,
                          kind: 'artifact',
                          projectId: openProject.id,
                        }, event)}
                      >
                        <MoreHorizontal size={15} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button
                    aria-expanded={newArtifactMenu?.projectId === openProject.id}
                    aria-haspopup="menu"
                    className="v2-sidebar-row v2-sidebar-add sidebar-section-action"
                    type="button"
                    onClick={(event) => openNewArtifactMenu(openProject.id, event)}
                  >
                    <Plus size={15} aria-hidden="true" />
                    <span className="v2-sidebar-row-label">Nuevo artefacto</span>
                  </button>
                </li>
              </ul>
            </SidebarPane>
          ) : null}

          {bothOpen ? (
            <SidebarSash containerRef={panesRef} onSplit={changeSplit} topId="sidebar-current-pane" topRef={currentPaneRef} />
          ) : null}

          <SidebarPane
            actions={(
              <button aria-label="Nuevo proyecto" className="v2-tool sidebar-section-action" type="button" onClick={onCreateProject} title="Nuevo proyecto">
                <Plus size={15} aria-hidden="true" />
              </button>
            )}
            className={openProject !== null && !othersOpen ? 'has-rule' : ''}
            collapsible={openProject !== null}
            count={otherProjects.length}
            id="sidebar-projects-pane"
            onToggle={toggleOthers}
            open={projectsPaneOpen}
            style={bothOpen && split !== null ? { flex: `${1 - split} 1 0` } : undefined}
            title={openProject !== null ? 'Otros proyectos' : 'Proyectos'}
          >
            {showFilter ? <SidebarFilter value={filterQuery} onChange={setFilterQuery} /> : null}
            {otherProjects.length === 0 ? (
              <p className="v2-sidebar-empty">{openProject !== null ? 'No hay otros proyectos.' : 'Todavía no hay proyectos.'}</p>
            ) : visibleProjects.length === 0 ? (
              <p aria-live="polite" className="v2-sidebar-empty" role="status">Ningún proyecto coincide.</p>
            ) : (
              <ul className="v2-sidebar-projects">
                {visibleProjects.map((project) => (
                  <li key={project.id} className="v2-sidebar-row-wrap v2-sidebar-other">
                    <button
                      className="v2-sidebar-row v2-sidebar-project-row"
                      type="button"
                      title={`${project.name} · actualizado ${formatRelativeDate(project.updatedAt)}`}
                      onClick={() => onSelectProject(project.id)}
                    >
                      <FolderClosed size={15} aria-hidden="true" />
                      <span className="v2-sidebar-row-label">{project.name}</span>
                      <span className="v2-sidebar-row-date" aria-hidden="true">{formatShortProjectDate(project.updatedAt)}</span>
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
                  </li>
                ))}
              </ul>
            )}
          </SidebarPane>
        </div>
      </nav>

      {update ? (
        <div className="v2-sidebar-update" role="status">
          <span>{`Hay una versión nueva (${update.version})`}</span>
          <a href={update.url} rel="noreferrer">Descargar</a>
          <button aria-label="Ocultar" className="v2-tool" type="button" onClick={onDismissUpdate} title="Ocultar">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div className="v2-sidebar-footer">
        <ThemeToggle preference={themePreference} onChange={onThemePreferenceChange} showLabel />
        <div className="v2-sidebar-footer-end">
          <span className="v2-sidebar-version" title="Versión instalada">{`v${APP_VERSION}`}</span>
          <button aria-label="Atajos de teclado" className="v2-tool" type="button" onClick={onOpenShortcuts} title="Atajos de teclado (?)">
            <Keyboard size={16} aria-hidden="true" />
          </button>
        </div>
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
            <>
              <MenuItem icon={Upload} onSelect={() => {
                onImportArtifact(optionsMenu.projectId);
                setOptionsMenu(null);
              }}>Importar artefacto…</MenuItem>
              <MenuItem
                icon={Download}
                onSelect={() => {
                  onExportProject(optionsMenu.projectId);
                  setOptionsMenu(null);
                }}
              >
                Exportar proyecto (JSON)
              </MenuItem>
            </>
          ) : optionsMenu.artifactId !== undefined ? (
            <>
              <MenuItem icon={Download} onSelect={() => {
                onExportArtifact(optionsMenu.projectId, optionsMenu.artifactId!);
                setOptionsMenu(null);
              }}>Exportar artefacto (JSON)</MenuItem>
              <MenuItem icon={MoveRight} onSelect={() => {
                onMoveArtifact(optionsMenu.projectId, optionsMenu.artifactId!);
                setOptionsMenu(null);
              }}>Mover a otro proyecto…</MenuItem>
              {onConvertToSequenceModel && projects.find((project) => project.id === optionsMenu.projectId)?.artifacts
                .some((artifact) => artifact.id === optionsMenu.artifactId && artifact.type === 'class-diagram') ? (
                <MenuItem icon={GitBranch} onSelect={() => {
                  onConvertToSequenceModel(optionsMenu.projectId, optionsMenu.artifactId!);
                  setOptionsMenu(null);
                }}>Convertir en clases de secuencias…</MenuItem>
              ) : null}
            </>
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

      {newArtifactMenuElement}
    </aside>
  );
}
