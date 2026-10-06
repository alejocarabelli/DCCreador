import { accessorAttribute, importClassesFromSequences } from './utils/sequenceClassImport';
import { createId } from './utils/id';
import { useDialogs } from './hooks/useDialogs';
import { ProjectNameDialog } from './components/ProjectNameDialog';
import { ArtifactImportDialog } from './components/ArtifactImportDialog';
import { ArtifactMoveDialog } from './components/ArtifactMoveDialog';
import { ProjectHome } from './components/ProjectHome';
import { ProjectSidebar } from './components/ProjectSidebar';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { ArtifactTabs } from './components/ArtifactTabs';
import { useArtifactTabs } from './hooks/useArtifactTabs';
import { artifactTabShortcut, closeArtifactTabs, closeOtherArtifactTabs, closeArtifactTabsToRight, type ArtifactTabState } from './utils/artifactTabs';
import { artifactViewKey, forgetArtifactView } from './utils/artifactViewMemory';
import { downloadProjectFile } from './utils/projectFile';
import { downloadArtifactFile, downloadTextFile } from './utils/artifactFile';
import { relinkArtifactForProject } from './utils/artifactTransfer';
import artifactGuide from '../docs/artifact-json-guide.md?raw';
import { useProjects } from './hooks/useProjects';
import { useTheme } from './hooks/useTheme';
import { readUiPreference, writeUiPreference } from './storage/uiPreferences';
import type { ArtifactContent, ClassMethod, ClassModelArtifact, ClassSequenceDiagramContent, DesignArtifact, SequenceDiagramContent } from './types/diagram';
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

type ArtifactTransferDialogState =
  | { mode: 'import'; projectId: string }
  | { mode: 'move'; projectId: string; artifactId: string };

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

const blurFocusedElement = (): void => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
};

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
  const [artifactTransferDialog, setArtifactTransferDialog] = useState<ArtifactTransferDialogState | null>(null);
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
    importProjects,
    importArtifact,
    moveArtifact,
    linkSequenceDiagramsToClassModel,
    convertClassDiagramToSequenceModel,
    projects,
    renameArtifact,
    renameProject,
    saveStatus,
    setActiveArtifactId,
    setActiveProjectId,
    storageWarning,
    updateProjectArtifactContent,
  } = useProjects();
  const { tabsByProject, setOpenArtifactIds } = useArtifactTabs(projects, activeProjectId);

  const getProjectTabState = (projectId: string): ArtifactTabState => ({
    openArtifactIds: tabsByProject[projectId] ?? [],
    activeArtifactId: projects.find((project) => project.id === projectId)?.activeArtifactId ?? null,
  });

  const applyTabState = (projectId: string, next: ArtifactTabState, openHomeIfEmpty = true): void => {
    if (projectId === activeProjectId && next.activeArtifactId !== getProjectTabState(projectId).activeArtifactId) blurFocusedElement();
    historyBurstRef.current = null;
    setOpenArtifactIds(projectId, next.openArtifactIds);
    if (next.activeArtifactId !== null) setActiveArtifactId(projectId, next.activeArtifactId);
    else if (openHomeIfEmpty && projectId === activeProjectId) setActiveProjectId(null);
  };

  const handleCloseArtifactTab = (projectId: string, artifactId: string): void => {
    applyTabState(projectId, closeArtifactTabs(getProjectTabState(projectId), [artifactId]));
  };

  const handleCreateProject = (): void => {
    setProjectDialog({ mode: 'create', initialName: 'Nuevo proyecto' });
  };

  const handleOpenHome = (): void => {
    blurFocusedElement();
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
      setActiveProjectId(projectDialog.projectId);
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
      for (const artifact of project?.artifacts ?? []) forgetArtifactView(artifactViewKey(projectId, artifact.id));
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
      handleCloseArtifactTab(projectId, artifactId);
      forgetArtifactView(artifactViewKey(projectId, artifactId));
      updateHistory((currentHistory) => {
        const nextHistory = { ...currentHistory };
        delete nextHistory[`${projectId}:${artifactId}`];
        return nextHistory;
      });
      historyBurstRef.current = null;
    }
  };

  const handleConvertToSequenceModel = async (projectId: string, artifactId: string): Promise<void> => {
    const project = projects.find((currentProject) => currentProject.id === projectId);
    const artifact = project?.artifacts.find((currentArtifact) => currentArtifact.id === artifactId);
    if (artifact?.type !== 'class-diagram') return;
    const shouldConvert = await confirm({
      title: `¿Convertir "${artifact.name}" en clases de secuencias?`,
      description: 'Conserva las clases y las relaciones, se vincula con las secuencias que todavía no tienen modelo y desde ahí se sincroniza con ellas. Deja de ser un diagrama de clases común. Si querés conservar el original, exportalo antes.',
      confirmLabel: 'Convertir',
      tone: 'neutral',
    });
    if (!shouldConvert) return;
    convertClassDiagramToSequenceModel(projectId, artifactId);
    // Earlier snapshots belong to the class diagram it was; undoing into them
    // would mix both kinds of content.
    updateHistory((currentHistory) => {
      const nextHistory = { ...currentHistory };
      delete nextHistory[`${projectId}:${artifactId}`];
      return nextHistory;
    });
    historyBurstRef.current = null;
    handleSelectArtifact(projectId, artifactId);
  };

  const handleSelectArtifact = (projectId: string, artifactId: string): void => {
    if (projectId !== activeProjectId || artifactId !== activeProject?.activeArtifactId) blurFocusedElement();
    historyBurstRef.current = null;
    setActiveProjectId(projectId);
    setActiveArtifactId(projectId, artifactId);
  };

  const activeArtifact = useMemo(
    () => (activeProject !== null ? getActiveArtifact(activeProject) : null),
    [activeProject],
  );
  const isProjectHome = activeProject === null || activeArtifact === null;
  const openArtifactIds = useMemo(() => activeProject === null ? [] : tabsByProject[activeProject.id] ?? [], [activeProject, tabsByProject]);
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
      const attribute = accessorAttribute(method);
      const addAttribute = attribute !== null && !classNode.data.attributes.some(
        (existing) => existing.name.trim().toLocaleLowerCase() === attribute.name.toLocaleLowerCase(),
      );
      const nextContent = {
        ...modelArtifact.content,
        nodes: modelArtifact.content.nodes.map((node) => node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                methods: [...node.data.methods, method],
                attributes: addAttribute && attribute ? [...node.data.attributes, { id: createId(), ...attribute }] : node.data.attributes,
              },
            }
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

  const handleImportSequenceIntoClassModel = useCallback(
    (artifactId: string, sequenceContent: SequenceDiagramContent): void => {
      if (activeProject === null || activeArtifact?.type !== 'sequence-diagram') return;
      const modelArtifact = activeProject.artifacts.find(
        (candidate): candidate is ClassModelArtifact => candidate.id === artifactId
          && (candidate.type === 'class-diagram' || candidate.type === 'class-sequence-diagram'),
      );
      if (!modelArtifact) return;
      const { content, summary } = importClassesFromSequences(modelArtifact.content, [sequenceContent]);
      const needsLink = modelArtifact.type === 'class-sequence-diagram' && !modelArtifact.content.linkedSequenceDiagramIds.includes(activeArtifact.id);
      if (!needsLink && summary.createdClasses + summary.addedMethods + summary.addedAttributes === 0) return;
      const previousContent = cloneArtifactContent(modelArtifact);
      const nextContent = modelArtifact.type === 'class-sequence-diagram'
        ? { ...content, linkedSequenceDiagramIds: [...new Set([...modelArtifact.content.linkedSequenceDiagramIds, activeArtifact.id])] }
        : content;
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
    [activeProject, activeArtifact, updateHistory, updateProjectArtifactContent],
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

  useEffect(() => {
    if (activeProject === null || activeArtifact === null) return;
    const handleTabShortcut = (event: KeyboardEvent): void => {
      if (document.querySelector('.modal-backdrop, [aria-modal="true"], dialog[open]') !== null) return;
      const action = artifactTabShortcut(event, {
        openArtifactIds,
        activeArtifactId: activeArtifact.id,
      }, /Mac|iPhone|iPad/.test(navigator.platform));
      if (action === null) return;
      event.preventDefault();
      event.stopPropagation();
      blurFocusedElement();
      historyBurstRef.current = null;
      if (action.type === 'close') {
        const next = closeArtifactTabs({ openArtifactIds, activeArtifactId: activeArtifact.id }, [action.artifactId]);
        setOpenArtifactIds(activeProject.id, next.openArtifactIds);
        if (next.activeArtifactId !== null) setActiveArtifactId(activeProject.id, next.activeArtifactId);
        else setActiveProjectId(null);
      } else setActiveArtifactId(activeProject.id, action.artifactId);
    };
    document.addEventListener('keydown', handleTabShortcut, true);
    return () => document.removeEventListener('keydown', handleTabShortcut, true);
  }, [activeArtifact, activeProject, openArtifactIds, setActiveArtifactId, setActiveProjectId, setOpenArtifactIds]);

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

  const handleExportArtifact = (projectId: string, artifactId: string): void => {
    const artifact = projects.find((project) => project.id === projectId)?.artifacts.find((candidate) => candidate.id === artifactId);
    if (artifact) downloadArtifactFile(artifact);
  };

  const handleDownloadArtifactGuide = (): void => {
    downloadTextFile(artifactGuide, 'guia-artefactos-ia.md', 'text/markdown;charset=utf-8');
  };

  const transferProject = projects.find((project) => project.id === artifactTransferDialog?.projectId);
  const transferArtifact = artifactTransferDialog?.mode === 'move'
    ? transferProject?.artifacts.find((artifact) => artifact.id === artifactTransferDialog.artifactId)
    : undefined;

  const handleMoveArtifact = (targetProjectId: string, includeLinked: boolean): void => {
    if (!transferProject || !transferArtifact) return;
    const result = moveArtifact(transferProject.id, targetProjectId, transferArtifact.id, includeLinked);
    if (result.idMap.size === 0) return;
    applyTabState(transferProject.id, closeArtifactTabs(getProjectTabState(transferProject.id), [...result.idMap.keys()]), false);
    updateHistory((currentHistory) => {
      const nextHistory = { ...currentHistory };
      // Carry undo/redo with the artifact, and keep old snapshots from restoring links across projects.
      for (const project of result.projects.filter((candidate) => candidate.id === transferProject.id || candidate.id === targetProjectId)) {
        for (const artifact of project.artifacts) {
          const oldId = project.id === targetProjectId
            ? [...result.idMap].find(([, newId]) => newId === artifact.id)?.[0]
            : undefined;
          if (project.id === targetProjectId && !oldId) continue;
          if (!oldId && transferProject.artifacts.find((candidate) => candidate.id === artifact.id)?.content === artifact.content) continue;
          const oldKey = `${oldId ? transferProject.id : project.id}:${oldId ?? artifact.id}`;
          const history = currentHistory[oldKey];
          if (!history) continue;
          const context = oldId ? project.artifacts.filter((candidate) => [...result.idMap.values()].includes(candidate.id)) : project.artifacts;
          const sanitize = (content: ArtifactContent): ArtifactContent => relinkArtifactForProject(
            { ...artifact, content } as DesignArtifact, context, oldId ? result.idMap : undefined, transferProject.artifacts,
          ).content;
          delete nextHistory[oldKey];
          nextHistory[`${project.id}:${artifact.id}`] = { past: history.past.map(sanitize), future: history.future.map(sanitize) };
        }
      }
      return nextHistory;
    });
    historyBurstRef.current = null;
    setArtifactTransferDialog(null);
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
        onExportArtifact={handleExportArtifact}
        onImportArtifact={(projectId) => setArtifactTransferDialog({ mode: 'import', projectId })}
        onMoveArtifact={(projectId, artifactId) => setArtifactTransferDialog({ mode: 'move', projectId, artifactId })}
        onConvertToSequenceModel={(projectId, artifactId) => { void handleConvertToSequenceModel(projectId, artifactId); }}
        onDownloadArtifactGuide={handleDownloadArtifactGuide}
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
          onImportProjects={importProjects}
          onOpenProject={setActiveProjectId}
        />
      ) : (
        <div className="artifact-editor-column">
          <ArtifactTabs
            key={activeProject.id}
            projectName={activeProject.name}
            artifacts={activeProject.artifacts}
            openArtifactIds={openArtifactIds}
            activeArtifactId={activeArtifact.id}
            onSelect={(artifactId) => handleSelectArtifact(activeProject.id, artifactId)}
            onClose={(artifactId) => handleCloseArtifactTab(activeProject.id, artifactId)}
            onCloseOthers={(artifactId) => applyTabState(activeProject.id, closeOtherArtifactTabs(getProjectTabState(activeProject.id), artifactId))}
            onCloseRight={(artifactId) => applyTabState(activeProject.id, closeArtifactTabsToRight(getProjectTabState(activeProject.id), artifactId))}
            onReorder={(ids) => setOpenArtifactIds(activeProject.id, ids)}
          />
          <div id="artifact-editor-panel" className="artifact-editor-panel" role="tabpanel" aria-labelledby={`artifact-tab-${activeArtifact.id}`}>
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
                  onNavigateToArtifact={(targetArtifactId) => handleSelectArtifact(activeProject.id, targetArtifactId)}
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
                    handleSelectArtifact(activeProject.id, targetArtifactId)
                  }
                  onCreateClassMethod={handleCreateClassMethodFromSequence}
                  onImportSequenceIntoClassModel={handleImportSequenceIntoClassModel}
                  onCreateSequenceDiagramArtifact={(name, initialContent) =>
                    createSequenceDiagramArtifact(activeProject.id, name, initialContent)
                  }
                  onCreateSequenceModel={() => createClassSequenceDiagramArtifact(activeProject.id, 'Clases de secuencias')}
                  onChangeContent={handleChangeProjectContent}
                  onRedo={handleRedo}
                  onUndo={handleUndo}
                />
              )}
            </Suspense>
          </div>
        </div>
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
      {artifactTransferDialog?.mode === 'import' && transferProject ? (
        <ArtifactImportDialog
          key={transferProject.id}
          project={transferProject}
          onCancel={() => setArtifactTransferDialog(null)}
          onDownloadGuide={handleDownloadArtifactGuide}
          onConfirm={(artifact) => {
            importArtifact(transferProject.id, artifact);
            historyBurstRef.current = null;
            setArtifactTransferDialog(null);
          }}
        />
      ) : null}
      {artifactTransferDialog?.mode === 'move' && transferProject && transferArtifact ? (
        <ArtifactMoveDialog
          key={`${transferProject.id}:${transferArtifact.id}`}
          project={transferProject}
          artifact={transferArtifact}
          projects={projects}
          onCancel={() => setArtifactTransferDialog(null)}
          onConfirm={handleMoveArtifact}
        />
      ) : null}
    </div>
  );
}

export default App;
