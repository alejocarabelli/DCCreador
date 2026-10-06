import { useEffect, useState } from 'react';
import type { DiagramProject } from '../types/diagram';
import { readUiPreference, writeUiPreference } from '../storage/uiPreferences';
import { readArtifactTabs, reconcileArtifactTabs } from '../utils/artifactTabs';
import { getActiveArtifact } from '../utils/diagramNormalization';

const preferenceKey = (projectId: string): string => `modelador.openTabs.${projectId}`;
const readProjectTabs = (project: DiagramProject): string[] => readArtifactTabs(
  readUiPreference(preferenceKey(project.id)),
  project.artifacts.map((artifact) => artifact.id),
  getActiveArtifact(project)?.id ?? null,
).openArtifactIds;

export function useArtifactTabs(projects: DiagramProject[], activeProjectId: string | null) {
  const [state, setState] = useState(() => ({
    projects,
    activeProjectId,
    tabsByProject: Object.fromEntries(projects.map((project) => [project.id, readProjectTabs(project)])),
  }));

  let current = state;
  if (state.projects !== projects || state.activeProjectId !== activeProjectId) {
    let changed = Object.keys(state.tabsByProject).length !== projects.length;
    const tabsByProject = Object.fromEntries(projects.map((project) => {
      const previous = state.projects.find((candidate) => candidate.id === project.id);
      const saved = state.tabsByProject[project.id];
      const existingIds = project.artifacts.map((artifact) => artifact.id);
      const activeArtifactId = getActiveArtifact(project)?.id ?? null;
      const previousActiveId = previous === undefined ? null : getActiveArtifact(previous)?.id ?? null;
      let ids = reconcileArtifactTabs({ openArtifactIds: saved ?? readProjectTabs(project), activeArtifactId: previousActiveId }, {
        existingArtifactIds: existingIds,
        activeArtifactId,
        projectOpened: project.id === activeProjectId && activeProjectId !== state.activeProjectId,
        projectActive: project.id === activeProjectId,
      }).openArtifactIds;
      if (saved !== undefined && ids.length === saved.length && ids.every((id, index) => id === saved[index])) ids = saved;
      if (ids !== saved) changed = true;
      return [project.id, ids];
    }));
    current = { projects, activeProjectId, tabsByProject: changed ? tabsByProject : state.tabsByProject };
    setState(current);
  }

  useEffect(() => {
    for (const [projectId, ids] of Object.entries(current.tabsByProject)) {
      writeUiPreference(preferenceKey(projectId), JSON.stringify(ids));
    }
  }, [current.tabsByProject]);

  const setOpenArtifactIds = (projectId: string, ids: string[]): void => {
    setState((previous) => ({ ...previous, tabsByProject: { ...previous.tabsByProject, [projectId]: ids } }));
  };

  return { tabsByProject: current.tabsByProject, setOpenArtifactIds };
}
