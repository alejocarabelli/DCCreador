import { findNeverLinkedSequences, findSequenceModel, findUnlinkedSequences, linkNewSequenceToOnlyModel, linkSequencesToModel, reconcileSequenceModelLinks } from '../utils/sequenceModelLink';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ArtifactContent,
  ArtifactNotebook,
  ClassDiagramArtifact,
  ClassDiagramContent,
  ClassSequenceDiagramArtifact,
  ClassSequenceDiagramContent,
  DiagramContent,
  DiagramProject,
  DesignArtifact,
  SequenceDiagramContent,
  UseCaseFlowContent,
  UseCaseModelArtifact,
  UseCaseModelContent,
} from '../types/diagram';
import { loadProjects, saveProjects } from '../storage/projectsStorage';
import {
  BACKUP_INTERVAL_MS,
  isBackupAvailable,
  readLastBackupAt,
  preserveRecoveryCopy,
  revealBackups,
  writeBackup,
  type BackupState,
} from '../storage/backup';
import {
  getActiveClassDiagramArtifact,
  normalizeClassSequenceDiagramContent,
  normalizeDiagramContent,
  normalizeDiagramProject,
  normalizeUseCaseFlowContent,
  normalizeUseCaseModelContent,
} from '../utils/diagramNormalization';
import {
  applyClassModelRenamesToSequence,
  applyModelNamesToSequence,
  findClassModelRenames,
  hasClassModelRenames,
  isSequenceUsingClassModel,
} from '../utils/classRenamePropagation';
import { createId } from '../utils/id';
import { artifactTypeInfo } from '../constants/artifactTypes';
import { copyProject, sameProjectContent, type ProjectImportCounts } from '../utils/projectRecovery';
import { saveBlob } from '../utils/saveFile';
import { isNotebookEmpty } from '../utils/artifactNotebook';
import { createEmptySequenceDiagramContent, normalizeSequenceDiagramContent } from '../utils/sequenceDiagram';
import { importArtifactIntoProjects, moveArtifactsBetweenProjects, type ArtifactMoveResult } from '../utils/artifactTransfer';

const createEmptyContent = (): ClassDiagramContent => ({
  nodes: [],
  edges: [],
});

const cloneClassContent = (content: ClassDiagramContent): ClassDiagramContent => normalizeDiagramContent({
  nodes: content.nodes,
  edges: content.edges,
});

const createEmptyUseCaseModelContent = (): UseCaseModelArtifact['content'] => ({
  nodes: [],
  edges: [],
});

const createEmptyUseCaseFlowContent = (): UseCaseFlowContent => ({
  classDiagramArtifactId: undefined,
  description: {
    useCaseNumber: '',
    useCaseName: '',
    actor: '',
    description: '',
    priority: 'A',
    inputParameters: '',
    precondition: '',
    postcondition: '',
    initialState: '',
    finalState: '',
  },
  basicFlow: [],
  alternativeFlows: [],
});

const createClassSequenceContent = (
  source: ClassDiagramArtifact | undefined,
  linkedSequenceDiagramIds: string[],
): ClassSequenceDiagramContent => ({
  ...cloneClassContent(source?.content ?? createEmptyContent()),
  version: 1,
  sourceClassDiagramArtifactId: source?.id,
  linkedSequenceDiagramIds,
});

/** Shared by new projects and the “Nuevo artefacto” actions, including model links. */
const addArtifactToProject = (
  project: DiagramProject,
  type: DesignArtifact['type'],
  name: string,
): DiagramProject => {
  const now = new Date().toISOString();
  const base = {
    id: createId(),
    name: name.trim() || (type === 'class-diagram' ? 'Nuevo diagrama de clases' : artifactTypeInfo(type).label),
    createdAt: now,
    updatedAt: now,
  };
  let artifact: DesignArtifact;
  switch (type) {
    case 'use-case-model':
      artifact = { ...base, type, content: createEmptyUseCaseModelContent() };
      break;
    case 'use-case-flow':
      artifact = { ...base, type, content: createEmptyUseCaseFlowContent() };
      break;
    case 'sequence-diagram':
      artifact = {
        ...base, type,
        content: createEmptySequenceDiagramContent(),
      };
      break;
    case 'class-sequence-diagram':
      artifact = { ...base, type, content: createClassSequenceContent(undefined, []) };
      break;
    case 'class-diagram':
      artifact = { ...base, type, content: createEmptyContent() };
      break;
  }

  let artifacts = [...project.artifacts, artifact];
  if (artifact.type === 'sequence-diagram') {
    artifacts = linkNewSequenceToOnlyModel(project.artifacts, artifact);
  } else if (artifact.type === 'class-sequence-diagram') {
    // A new model takes only the sequences that never chose (not the ones unlinked on purpose).
    const unlinkedIds = findNeverLinkedSequences(project.artifacts).map((sequence) => sequence.id);
    artifacts = linkSequencesToModel(artifacts, unlinkedIds, artifact.id, now);
  }

  return { ...project, activeArtifactId: artifact.id, artifacts, updatedAt: now };
};

export const buildProject = (name: string, artifactType: DesignArtifact['type'] = 'use-case-model'): DiagramProject => {
  const now = new Date().toISOString();
  return addArtifactToProject({
    id: createId(),
    name,
    createdAt: now,
    updatedAt: now,
    activeArtifactId: '',
    artifacts: [],
  }, artifactType, artifactTypeInfo(artifactType).label);
};

/** Returns the same project object when nothing about the notes changes. */
export const setNotebookInProject = (
  project: DiagramProject,
  artifactId: string,
  notebook: ArtifactNotebook | undefined,
  now: string,
): DiagramProject => {
  const target = project.artifacts.find((artifact) => artifact.id === artifactId);
  if (target === undefined) return project;

  const next = isNotebookEmpty(notebook) ? undefined : notebook;
  if (JSON.stringify(target.notebook) === JSON.stringify(next)) return project;

  const updated: DesignArtifact = { ...target, updatedAt: now };
  if (next === undefined) delete updated.notebook;
  else updated.notebook = next;
  return {
    ...project,
    updatedAt: now,
    artifacts: project.artifacts.map((artifact) => (artifact.id === artifactId ? updated : artifact)),
  };
};

export type DiagramSaveStatus = 'saved' | 'saving' | 'error';

export const useProjects = () => {
  const [storageLoad, setStorageLoad] = useState(loadProjects);
  const [projects, setProjects] = useState<DiagramProject[]>(storageLoad.projects);
  // Start at the project archive so opening the app does not silently jump into
  // an arbitrary artifact. Creating or selecting a project still opens it as before.
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(storageLoad.warning);
  const [saveStatus, setSaveStatusState] = useState<DiagramSaveStatus>(storageLoad.skipInitialSave ? 'error' : 'saved');
  const saveStatusRef = useRef(saveStatus);
  // Typing changes projects on every keystroke. Setting the status it already has would still queue a
  // synchronous render per keystroke and, typing fast enough, trip React's update-depth limit.
  const setSaveStatus = useCallback((next: DiagramSaveStatus): void => {
    if (saveStatusRef.current === next) return;
    saveStatusRef.current = next;
    setSaveStatusState(next);
  }, []);
  const [saveBlocked, setSaveBlocked] = useState(storageLoad.recoveryRaw !== null);
  const saveBlockedRef = useRef(storageLoad.recoveryRaw !== null);
  const storageUnavailableRef = useRef(storageLoad.storageUnavailable);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const latestProjectsRef = useRef(projects);
  const hasPendingSaveRef = useRef(false);
  const [backup, setBackup] = useState<BackupState>({
    path: null,
    directory: null,
    at: readLastBackupAt(),
    error: null,
  });
  const lastBackupAtRef = useRef(backup.at);
  const backupQueueRef = useRef<Promise<void>>(Promise.resolve());
  const backupTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const allowSaving = useCallback((): void => {
    saveBlockedRef.current = false;
    setSaveBlocked(false);
    setStorageWarning(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (storageLoad.recoveryRaw === null) return;
    let cancelled = false;
    void preserveRecoveryCopy(storageLoad.recoveryRaw).then((preserved) => {
      if (cancelled || !preserved) return;
      setRecoveryNotice('No se pudo leer todo el trabajo guardado. Se guardó una copia en Documentos › Modelador de Sistemas › Respaldos.');
      allowSaving();
    });
    return () => { cancelled = true; };
  }, [storageLoad, allowSaving]);

  const downloadRecoveryCopy = async (): Promise<boolean> => {
    if (storageLoad.recoveryRaw === null) return false;
    const outcome = await saveBlob(new Blob([storageLoad.recoveryRaw], { type: 'application/json' }), `recuperacion-${Date.now()}.json`);
    if (outcome.status === 'saved') {
      if (outcome.path === null) return true;
      setRecoveryNotice('No se pudo leer todo el trabajo guardado. Se guardó una copia de seguridad del original.');
      allowSaving();
    } else if (outcome.status === 'failed') {
      setStorageWarning('No se pudo guardar la copia de seguridad. Reintentá la descarga. El original sigue protegido.');
    }
    return false;
  };

  const confirmRecoveryDownload = (): void => {
    setRecoveryNotice('No se pudo leer todo el trabajo guardado. Se descargó una copia de seguridad del original.');
    allowSaving();
  };

  useEffect(() => {
    latestProjectsRef.current = projects;

    if (saveBlockedRef.current || storageUnavailableRef.current) {
      return;
    }

    setSaveStatus('saving');
    hasPendingSaveRef.current = true;
    const timeoutId = window.setTimeout(() => {
      if (saveBlockedRef.current || storageUnavailableRef.current) return;
      const result = saveProjects(projects);
      hasPendingSaveRef.current = false;
      setStorageWarning(result.error);
      if (result.ok && result.error === null) {
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [projects, saveBlocked, setSaveStatus, storageLoad.storageUnavailable]);

  useEffect(() => {
    const flushPendingSave = (): void => {
      if (saveBlockedRef.current || storageUnavailableRef.current || !hasPendingSaveRef.current) {
        return;
      }

      const result = saveProjects(latestProjectsRef.current);
      hasPendingSaveRef.current = false;

      if (result.error !== null) {
        setStorageWarning(result.error);
        setSaveStatus('error');
      } else if (result.ok) {
        setSaveStatus('saved');
      }
    };

    const flushWhenHidden = (): void => {
      if (document.visibilityState === 'hidden') {
        flushPendingSave();
      }
    };

    window.addEventListener('pagehide', flushPendingSave);
    document.addEventListener('visibilitychange', flushWhenHidden);

    return () => {
      window.removeEventListener('pagehide', flushPendingSave);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      flushPendingSave();
    };
  }, [setSaveStatus]);

  const runBackup = useCallback(async function performBackup(force: boolean, snapshot?: DiagramProject[]): Promise<void> {
    if (!isBackupAvailable() || saveBlockedRef.current) return;
    const task = backupQueueRef.current.then(async () => {
      if (!mountedRef.current || saveBlockedRef.current) return;
      const last = readLastBackupAt() ?? lastBackupAtRef.current;
      if (!force && last !== null && Date.now() - last < BACKUP_INTERVAL_MS) {
        if (backupTimeoutRef.current !== null) window.clearTimeout(backupTimeoutRef.current);
        backupTimeoutRef.current = window.setTimeout(() => {
          backupTimeoutRef.current = null;
          void performBackup(false);
        }, BACKUP_INTERVAL_MS - (Date.now() - last));
        return;
      }
      if (backupTimeoutRef.current !== null) window.clearTimeout(backupTimeoutRef.current);
      backupTimeoutRef.current = null;
      const result = await writeBackup(snapshot ?? latestProjectsRef.current);
      if (result.at !== null) lastBackupAtRef.current = result.at;
      if (mountedRef.current && (result.at !== null || result.error !== null)) setBackup(result);
    });
    backupQueueRef.current = task;
    await task;
  }, []);

  useEffect(() => {
    if (!saveBlocked) void runBackup(false);
  }, [projects, saveBlocked, runBackup]);

  useEffect(() => {
    const onPageHide = (): void => { void runBackup(true); };
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') void runBackup(true);
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onHide);
      if (backupTimeoutRef.current !== null) window.clearTimeout(backupTimeoutRef.current);
    };
  }, [runBackup]);

  const retryStorage = (): void => {
    const loaded = loadProjects();
    if (loaded.storageUnavailable) {
      setStorageWarning(loaded.warning);
      return;
    }
    saveBlockedRef.current = loaded.recoveryRaw !== null;
    storageUnavailableRef.current = false;
    hasPendingSaveRef.current = false;
    setSaveBlocked(saveBlockedRef.current);
    setStorageLoad(loaded);
    setStorageWarning(loaded.warning);
    setSaveStatus(loaded.skipInitialSave ? 'error' : 'saved');
    setProjects((sessionProjects) => {
      const stored = new Map(loaded.projects.map((project) => [project.id, project]));
      const session = sessionProjects.flatMap((project) => {
        const existing = stored.get(project.id);
        if (existing === undefined) return [project];
        return sameProjectContent(existing, project) ? [] : [copyProject(project)];
      });
      return [...loaded.projects, ...session];
    });
  };

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );

  const createProject = (name: string, artifactType: DesignArtifact['type'] = 'use-case-model'): void => {
    const project = buildProject(name.trim() || 'Nuevo proyecto', artifactType);
    setProjects((currentProjects) => [project, ...currentProjects]);
    setActiveProjectId(project.id);
  };

  const renameProject = (projectId: string, name: string): void => {
    const cleanName = name.trim();

    if (cleanName.length === 0) {
      return;
    }

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectId
          ? { ...project, name: cleanName, updatedAt: new Date().toISOString() }
          : project,
      ),
    );
  };

  const deleteProject = (projectId: string): void => {
    if (projects.some((project) => project.id === projectId)) void runBackup(true, projects);
    setProjects((currentProjects) => {
      const nextProjects = currentProjects.filter((project) => project.id !== projectId);

      if (activeProjectId === projectId) {
        setActiveProjectId(nextProjects[0]?.id ?? null);
      }

      return nextProjects;
    });
  };

  const setActiveArtifactId = (projectId: string, artifactId: string): void => {
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectId && project.artifacts.some((artifact) => artifact.id === artifactId)
          ? { ...project, activeArtifactId: artifactId }
          : project,
      ),
    );
  };

  const createArtifact = (
    projectId: string,
    type: DesignArtifact['type'],
    name: string,
  ): void => {
    setProjects((currentProjects) => currentProjects.map((project) =>
      project.id === projectId ? addArtifactToProject(project, type, name) : project));
  };

  const createClassDiagramArtifact = (projectId: string, name: string): void => {
    createArtifact(projectId, 'class-diagram', name);
  };

  /** A sequence that asks for the new model is linked to it even if it was unlinked on purpose. */
  const createClassSequenceDiagramArtifact = (projectId: string, name: string, forSequenceId?: string): void => {
    if (forSequenceId === undefined) {
      createArtifact(projectId, 'class-sequence-diagram', name);
      return;
    }
    setProjects((currentProjects) => currentProjects.map((project) => {
      if (project.id !== projectId) return project;
      const next = addArtifactToProject(project, 'class-sequence-diagram', name);
      const previousIds = new Set(project.artifacts.map((artifact) => artifact.id));
      const model = next.artifacts.find((artifact) => !previousIds.has(artifact.id));
      if (model === undefined) return next;
      return { ...next, artifacts: linkSequencesToModel(next.artifacts, [forSequenceId], model.id, next.updatedAt) };
    }));
  };

  const createUseCaseModelArtifact = (projectId: string, name: string): void => {
    createArtifact(projectId, 'use-case-model', name);
  };

  const createUseCaseFlowArtifact = (projectId: string, name: string): void => {
    createArtifact(projectId, 'use-case-flow', name);
  };

  const createSequenceDiagramArtifact = (projectId: string, name: string): void => {
    createArtifact(projectId, 'sequence-diagram', name);
  };

  /**
   * Points sequences at a "Clases de secuencias" model. With no list, it takes
   * the sequences that have no model yet, never one drawn on another model.
   */
  const linkSequenceDiagramsToClassModel = (projectId: string, classModelArtifactId: string, sequenceIds?: string[]): void => {
    const now = new Date().toISOString();

    setProjects((currentProjects) => currentProjects.map((project) => {
      if (project.id !== projectId) {
        return project;
      }

      const ids = sequenceIds ?? findUnlinkedSequences(project.artifacts).map((sequence) => sequence.id);
      const artifacts = linkSequencesToModel(project.artifacts, ids, classModelArtifactId, now);
      return artifacts === project.artifacts ? project : { ...project, updatedAt: now, artifacts };
    }));
  };

  /**
   * Turns a plain class diagram into a "Clases de secuencias" model in place:
   * same id, name, classes and relations. It takes the sequences that never
   * chose a model. Flows that pointed at it lose that link, since a flow reads a
   * plain class diagram.
   */
  const convertClassDiagramToSequenceModel = (projectId: string, artifactId: string): void => {
    const now = new Date().toISOString();

    setProjects((currentProjects) => currentProjects.map((project) => {
      if (project.id !== projectId) {
        return project;
      }
      const source = project.artifacts.find((artifact): artifact is ClassDiagramArtifact =>
        artifact.id === artifactId && artifact.type === 'class-diagram');
      if (source === undefined) return project;

      const converted: ClassSequenceDiagramArtifact = {
        id: source.id,
        type: 'class-sequence-diagram',
        name: source.name,
        createdAt: source.createdAt,
        updatedAt: now,
        ...(source.notebook !== undefined ? { notebook: source.notebook } : {}),
        content: createClassSequenceContent(source, []),
      };
      // The copy is the diagram itself now, not a link to a source.
      converted.content.sourceClassDiagramArtifactId = undefined;
      const artifacts = project.artifacts.map((artifact): DesignArtifact => {
        if (artifact.id === source.id) return converted;
        if (artifact.type === 'use-case-flow' && artifact.content.classDiagramArtifactId === source.id) {
          return { ...artifact, updatedAt: now, content: { ...artifact.content, classDiagramArtifactId: null } };
        }
        return artifact;
      });
      const unlinkedIds = findNeverLinkedSequences(artifacts).map((sequence) => sequence.id);

      return {
        ...project,
        activeArtifactId: source.id,
        updatedAt: now,
        artifacts: linkSequencesToModel(artifacts, unlinkedIds, source.id, now),
      };
    }));
  };

  // Notes are not model content: no undo entry, no link reconciliation, no
  // rename propagation, and the active artifact stays as it is.
  const updateArtifactNotebook = useCallback((
    projectId: string,
    artifactId: string,
    notebook: ArtifactNotebook | undefined,
  ): void => {
    const now = new Date().toISOString();
    setProjects((currentProjects) => currentProjects.map((project) =>
      project.id === projectId ? setNotebookInProject(project, artifactId, notebook, now) : project));
  }, []);

  const renameArtifact = (projectId: string, artifactId: string, name: string): void => {
    const cleanName = name.trim();

    if (cleanName.length === 0) {
      return;
    }

    const now = new Date().toISOString();

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              artifacts: project.artifacts.map((artifact) =>
                artifact.id === artifactId ? { ...artifact, name: cleanName, updatedAt: now } : artifact,
              ),
              updatedAt: now,
            }
          : project,
      ),
    );
  };

  const deleteArtifact = (projectId: string, artifactId: string): void => {
    const target = projects.find((project) => project.id === projectId);
    if (target && target.artifacts.length > 1 && target.artifacts.some((artifact) => artifact.id === artifactId)) {
      void runBackup(true, projects);
    }
    const now = new Date().toISOString();

    setProjects((currentProjects) =>
      currentProjects.map((project) => {
        if (project.id !== projectId || project.artifacts.length <= 1) {
          return project;
        }

        const nextArtifacts = reconcileSequenceModelLinks(project.artifacts.filter((artifact) => artifact.id !== artifactId), now);

        if (nextArtifacts.length === project.artifacts.length || nextArtifacts.length === 0) {
          return project;
        }

        return {
          ...project,
          activeArtifactId:
            project.activeArtifactId === artifactId ? nextArtifacts[0].id : project.activeArtifactId,
          artifacts: nextArtifacts,
          updatedAt: now,
        };
      }),
    );
  };

  const updateProjectArtifactContent = (
    projectId: string,
    artifactId: string,
    content: ArtifactContent,
    options?: { alreadyNormalized?: boolean; fromHistory?: boolean },
  ): void => {
    const now = new Date().toISOString();

    setProjects((currentProjects) => currentProjects.map((project) => {
      if (project.id !== projectId) {
        return project;
      }

      const targetArtifact = project.artifacts.find((artifact) => artifact.id === artifactId);
      if (targetArtifact === undefined) {
        return project;
      }

      const normalizedTargetContent = targetArtifact.type === 'use-case-model'
        ? (options?.alreadyNormalized ? content as UseCaseModelContent : normalizeUseCaseModelContent(content as Partial<UseCaseModelContent>))
        : targetArtifact.type === 'use-case-flow'
          ? (options?.alreadyNormalized ? content as UseCaseFlowContent : normalizeUseCaseFlowContent(content as Partial<UseCaseFlowContent>))
          : targetArtifact.type === 'sequence-diagram'
            ? (options?.alreadyNormalized ? content as SequenceDiagramContent : normalizeSequenceDiagramContent(content as Partial<SequenceDiagramContent>))
            : targetArtifact.type === 'class-sequence-diagram'
              ? (options?.alreadyNormalized
                ? content as ClassSequenceDiagramContent
                : normalizeClassSequenceDiagramContent(content as Partial<ClassSequenceDiagramContent>))
              : (options?.alreadyNormalized ? content as ClassDiagramContent : normalizeDiagramContent(content as Partial<ClassDiagramContent>));

      // Only a "Clases de secuencias" model talks to sequences: its renamed
      // classes and methods reach the sequences drawn on it. Undo replays
      // through here, so it carries the old names back. A plain class diagram
      // stays on its own.
      const renames = targetArtifact.type === 'class-sequence-diagram'
        ? findClassModelRenames(targetArtifact.content, normalizedTargetContent as ClassDiagramContent)
        : undefined;
      const propagatesRenames = renames !== undefined && hasClassModelRenames(renames);

      // Only a restored sequence snapshot takes the linked names from the model
      // again: it can predate a rename. Ordinary edits keep what was typed,
      // since a linked participant may read another name on purpose.
      const sequenceModel = targetArtifact.type === 'sequence-diagram' && options?.fromHistory
        ? findSequenceModel(project.artifacts, { content: normalizedTargetContent as SequenceDiagramContent })
        : undefined;
      const restoredContent = sequenceModel === undefined
        ? normalizedTargetContent
        : applyModelNamesToSequence(normalizedTargetContent as SequenceDiagramContent, sequenceModel.content) ?? normalizedTargetContent;

      const updatedArtifacts = project.artifacts.map((artifact) => {
        if (artifact.id === artifactId) {
          return { ...artifact, content: restoredContent, updatedAt: now } as typeof artifact;
        }

        if (propagatesRenames && artifact.type === 'sequence-diagram' && isSequenceUsingClassModel(artifact.content, artifactId)) {
          const renamedContent = applyClassModelRenamesToSequence(artifact.content, renames);
          return renamedContent === null ? artifact : { ...artifact, content: renamedContent, updatedAt: now };
        }

        return artifact;
      });
      const linksMayChange = targetArtifact.type === 'sequence-diagram' || targetArtifact.type === 'class-sequence-diagram';
      const artifacts = linksMayChange ? reconcileSequenceModelLinks(updatedArtifacts, now) : updatedArtifacts;

      return {
        ...project,
        updatedAt: now,
        activeArtifactId: artifactId,
        artifacts,
      };
    }));
  };

  const updateProjectContent = (projectId: string, content: DiagramContent): void => {
    const project = projects.find((currentProject) => currentProject.id === projectId);

    if (project === undefined) {
      return;
    }

    updateProjectArtifactContent(projectId, getActiveClassDiagramArtifact(project).id, content);
  };

  const importProject = (project: DiagramProject): void => {
    const normalizedProject = normalizeDiagramProject(project);
    const now = new Date().toISOString();

    setProjects((currentProjects) => {
      const idExists = currentProjects.some((currentProject) => currentProject.id === normalizedProject.id);
      const importedProject = {
        ...(idExists ? copyProject(normalizedProject) : normalizedProject),
        createdAt: normalizedProject.createdAt || now,
        updatedAt: now,
      };

      setActiveProjectId(importedProject.id);
      return [importedProject, ...currentProjects];
    });
  };

  const importArtifact = (projectId: string, artifact: DesignArtifact): void => {
    setProjects((currentProjects) => importArtifactIntoProjects(currentProjects, projectId, artifact));
    setActiveProjectId(projectId);
  };

  const moveArtifact = (sourceProjectId: string, targetProjectId: string, artifactId: string, includeLinked: boolean): ArtifactMoveResult => {
    const result = moveArtifactsBetweenProjects(projects, sourceProjectId, targetProjectId, artifactId, includeLinked);
    if (result.idMap.size > 0) {
      setProjects(result.projects);
      setActiveProjectId(targetProjectId);
    }
    return result;
  };

  const importProjects = (incoming: DiagramProject[]): ProjectImportCounts => {
    const known = new Map(projects.map((project) => [project.id, project]));
    const counts: ProjectImportCounts = { imported: 0, recovered: 0, skipped: 0 };
    const fresh: DiagramProject[] = [];
    incoming.forEach((project) => {
      const normalized = normalizeDiagramProject(project);
      const existing = known.get(normalized.id);
      if (existing && sameProjectContent(existing, normalized)) {
        counts.skipped += 1;
        return;
      }
      const imported = existing ? copyProject(normalized, `${normalized.name} (recuperado)`) : normalized;
      if (existing) counts.recovered += 1;
      else counts.imported += 1;
      fresh.push(imported);
      known.set(imported.id, imported);
    });
    if (fresh.length > 0) setProjects((currentProjects) => [...fresh, ...currentProjects]);
    return counts;
  };

  return {
    activeProject,
    activeProjectId,
    backup,
    backupAvailable: isBackupAvailable(),
    revealBackups,
    runBackupNow: () => runBackup(true),
    createClassDiagramArtifact,
    createClassSequenceDiagramArtifact,
    createUseCaseFlowArtifact,
    createUseCaseModelArtifact,
    createSequenceDiagramArtifact,
    linkSequenceDiagramsToClassModel,
    convertClassDiagramToSequenceModel,
    createProject,
    deleteArtifact,
    deleteProject,
    projects,
    importProject,
    importProjects,
    importArtifact,
    moveArtifact,
    renameArtifact,
    renameProject,
    saveStatus,
    setActiveArtifactId,
    setActiveProjectId,
    storageWarning: storageWarning ?? recoveryNotice,
    recoveryPending: saveBlocked && storageLoad.recoveryRaw !== null,
    storageUnavailable: storageLoad.storageUnavailable,
    retryStorage,
    downloadRecoveryCopy,
    confirmRecoveryDownload,
    continueWithoutRecovery: () => {
      setRecoveryNotice('Elegiste seguir sin copia de seguridad. El próximo guardado reemplaza el original.');
      allowSaving();
    },
    updateArtifactNotebook,
    updateProjectArtifactContent,
    updateProjectContent,
  };
};
