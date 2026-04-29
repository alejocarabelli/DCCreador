import { useEffect, useMemo, useState } from 'react';
import type { DiagramContent, DiagramProject } from '../types/diagram';
import { loadProjects, saveProjects } from '../storage/projectsStorage';
import { normalizeDiagramProject } from '../utils/diagramNormalization';
import { createId } from '../utils/id';

const createEmptyContent = (): DiagramContent => ({
  nodes: [],
  edges: [],
});

const buildProject = (name: string): DiagramProject => {
  const now = new Date().toISOString();

  return {
    id: createId(),
    name,
    createdAt: now,
    updatedAt: now,
    content: createEmptyContent(),
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

  const updateProjectContent = (projectId: string, content: DiagramContent): void => {
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectId
          ? { ...project, content, updatedAt: new Date().toISOString() }
          : project,
      ),
    );
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
    createProject,
    deleteProject,
    projects,
    importProject,
    renameProject,
    setActiveProjectId,
    updateProjectContent,
  };
};
