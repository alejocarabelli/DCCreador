import { useEffect, useMemo, useState } from 'react';
import type { ClassDiagramArtifact, ClassDiagramContent, DesignArtifact, DiagramContent, DiagramProject, UseCaseModelArtifact, UseCaseModelContent } from '../types/diagram';
import { loadProjects, saveProjects } from '../storage/projectsStorage';
import { getActiveClassDiagramArtifact, normalizeDiagramContent, normalizeDiagramProject, normalizeUseCaseModelContent } from '../utils/diagramNormalization';
import { createId } from '../utils/id';

const createEmptyContent = (): ClassDiagramContent => ({
  nodes: [],
  edges: [],
});

const createEmptyUseCaseModelContent = (): UseCaseModelArtifact['content'] => ({
  nodes: [],
  edges: [],
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

export const useProjects = () => {
  const [projects, setProjects] = useState<DiagramProject[]>(() => loadProjects());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    const storedProjects = loadProjects();
    return storedProjects[0]?.id ?? null;
  });

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

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

  const updateProjectArtifactContent = (projectId: string, artifactId: string, content: DesignArtifact['content']): void => {
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
                    content: normalizeUseCaseModelContent(content as Partial<UseCaseModelContent>),
                    updatedAt: now,
                  };
                }

                return {
                  ...artifact,
                  content: normalizeDiagramContent(content as Partial<ClassDiagramContent>),
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
    createUseCaseModelArtifact,
    createProject,
    deleteArtifact,
    deleteProject,
    projects,
    importProject,
    renameArtifact,
    renameProject,
    setActiveArtifactId,
    setActiveProjectId,
    updateProjectArtifactContent,
    updateProjectContent,
  };
};
