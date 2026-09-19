import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ArtifactContent,
  ClassDiagramArtifact,
  ClassDiagramContent,
  DiagramContent,
  DiagramProject,
  SequenceDiagramArtifact,
  SequenceDiagramContent,
  UseCaseFlowArtifact,
  UseCaseFlowContent,
  UseCaseModelArtifact,
  UseCaseModelContent,
} from '../types/diagram';
import { loadProjects, saveProjects } from '../storage/projectsStorage';
import {
  getActiveClassDiagramArtifact,
  normalizeDiagramContent,
  normalizeDiagramProject,
  normalizeUseCaseFlowContent,
  normalizeUseCaseModelContent,
} from '../utils/diagramNormalization';
import { createId } from '../utils/id';
import { createEmptySequenceDiagramContent, normalizeSequenceDiagramContent } from '../utils/sequenceDiagram';

const createEmptyContent = (): ClassDiagramContent => ({
  nodes: [],
  edges: [],
});

const createEmptyUseCaseModelContent = (): UseCaseModelArtifact['content'] => ({
  nodes: [],
  edges: [],
});

const createEmptyUseCaseFlowContent = (): UseCaseFlowContent => ({
  classDiagramArtifactId: undefined,
  description: {
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

const buildProject = (name: string): DiagramProject => {
  const now = new Date().toISOString();
  const artifact: ClassDiagramArtifact = {
    id: createId(),
    type: 'class-diagram',
    name: 'Diagrama de clases',
    createdAt: now,
    updatedAt: now,
    content: createEmptyContent(),
  };

  return {
    id: createId(),
    name,
    createdAt: now,
    updatedAt: now,
    activeArtifactId: artifact.id,
    artifacts: [artifact],
  };
};

export type DiagramSaveStatus = 'saved' | 'saving' | 'error';

export const useProjects = () => {
  const [initialLoad] = useState(loadProjects);
  const [projects, setProjects] = useState<DiagramProject[]>(initialLoad.projects);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialLoad.projects[0]?.id ?? null);
  const [storageWarning, setStorageWarning] = useState<string | null>(initialLoad.warning);
  const [saveStatus, setSaveStatus] = useState<DiagramSaveStatus>('saved');
  const skipInitialSaveRef = useRef(initialLoad.skipInitialSave);
  const latestProjectsRef = useRef(projects);
  const hasPendingSaveRef = useRef(false);

  useEffect(() => {
    latestProjectsRef.current = projects;

    if (skipInitialSaveRef.current) {
      skipInitialSaveRef.current = false;
      return;
    }

    setSaveStatus('saving');
    hasPendingSaveRef.current = true;
    const timeoutId = window.setTimeout(() => {
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
  }, [projects]);

  useEffect(() => {
    const flushPendingSave = (): void => {
      if (!hasPendingSaveRef.current) {
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
  }, []);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );

  const createProject = (name: string): void => {
    const project = buildProject(name.trim() || 'Nuevo diagrama');
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

  const createClassDiagramArtifact = (projectId: string, name: string): void => {
    const now = new Date().toISOString();
    const artifact: ClassDiagramArtifact = {
      id: createId(),
      type: 'class-diagram',
      name: name.trim() || 'Nuevo diagrama de clases',
      createdAt: now,
      updatedAt: now,
      content: createEmptyContent(),
    };

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              activeArtifactId: artifact.id,
              artifacts: [...project.artifacts, artifact],
              updatedAt: now,
            }
          : project,
      ),
    );
  };

  const createUseCaseModelArtifact = (projectId: string, name: string): void => {
    const now = new Date().toISOString();
    const artifact: UseCaseModelArtifact = {
      id: createId(),
      type: 'use-case-model',
      name: name.trim() || 'Modelo de casos de uso',
      createdAt: now,
      updatedAt: now,
      content: createEmptyUseCaseModelContent(),
    };

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              activeArtifactId: artifact.id,
              artifacts: [...project.artifacts, artifact],
              updatedAt: now,
            }
          : project,
      ),
    );
  };

  const createUseCaseFlowArtifact = (projectId: string, name: string): void => {
    const now = new Date().toISOString();
    const artifact: UseCaseFlowArtifact = {
      id: createId(),
      type: 'use-case-flow',
      name: name.trim() || 'Flujo de sucesos',
      createdAt: now,
      updatedAt: now,
      content: createEmptyUseCaseFlowContent(),
    };

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              activeArtifactId: artifact.id,
              artifacts: [...project.artifacts, artifact],
              updatedAt: now,
            }
          : project,
      ),
    );
  };

  const createSequenceDiagramArtifact = (
    projectId: string,
    name: string,
    initialContent?: SequenceDiagramContent,
  ): void => {
    const now = new Date().toISOString();
    const artifact: SequenceDiagramArtifact = {
      id: createId(),
      type: 'sequence-diagram',
      name: name.trim() || 'Diagrama de secuencia',
      createdAt: now,
      updatedAt: now,
      content: initialContent ? normalizeSequenceDiagramContent(initialContent) : createEmptySequenceDiagramContent(),
    };

    setProjects((currentProjects) => currentProjects.map((project) => project.id === projectId
      ? {
          ...project,
          activeArtifactId: artifact.id,
          artifacts: [...project.artifacts, artifact],
          updatedAt: now,
        }
      : project));
  };

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
    const now = new Date().toISOString();

    setProjects((currentProjects) =>
      currentProjects.map((project) => {
        if (project.id !== projectId || project.artifacts.length <= 1) {
          return project;
        }

        const nextArtifacts = project.artifacts.filter((artifact) => artifact.id !== artifactId);

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
    options?: { alreadyNormalized?: boolean },
  ): void => {
    const now = new Date().toISOString();

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              updatedAt: now,
              activeArtifactId: artifactId,
              artifacts: project.artifacts.map((artifact) => {
                if (artifact.id !== artifactId) {
                  return artifact;
                }

                if (artifact.type === 'use-case-model') {
                  return {
                    ...artifact,
                    content: options?.alreadyNormalized ? content as UseCaseModelContent : normalizeUseCaseModelContent(content as Partial<UseCaseModelContent>),
                    updatedAt: now,
                  };
                }

                if (artifact.type === 'use-case-flow') {
                  return {
                    ...artifact,
                    content: options?.alreadyNormalized ? content as UseCaseFlowContent : normalizeUseCaseFlowContent(content as Partial<UseCaseFlowContent>),
                    updatedAt: now,
                  };
                }

                if (artifact.type === 'sequence-diagram') {
                  return {
                    ...artifact,
                    content: options?.alreadyNormalized ? content as SequenceDiagramContent : normalizeSequenceDiagramContent(content as Partial<SequenceDiagramContent>),
                    updatedAt: now,
                  };
                }

                return {
                  ...artifact,
                  content: options?.alreadyNormalized ? content as ClassDiagramContent : normalizeDiagramContent(content as Partial<ClassDiagramContent>),
                  updatedAt: now,
                };
              }),
            }
          : project,
      ),
    );
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
      const importedId = normalizedProject.id && !idExists ? normalizedProject.id : createId();
      const importedProject = {
        ...normalizedProject,
        id: importedId,
        createdAt: normalizedProject.createdAt || now,
        updatedAt: now,
      };

      setActiveProjectId(importedProject.id);
      return [importedProject, ...currentProjects];
    });
  };

  return {
    activeProject,
    activeProjectId,
    createClassDiagramArtifact,
    createUseCaseFlowArtifact,
    createUseCaseModelArtifact,
    createSequenceDiagramArtifact,
    createProject,
    deleteArtifact,
    deleteProject,
    projects,
    importProject,
    renameArtifact,
    renameProject,
    saveStatus,
    setActiveArtifactId,
    setActiveProjectId,
    storageWarning,
    updateProjectArtifactContent,
    updateProjectContent,
  };
};
