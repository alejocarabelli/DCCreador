import type { Viewport } from 'reactflow';

export type ArtifactScrollView = {
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
  canvasSize?: { width: number; height: number };
};

type ArtifactView = { kind: 'react-flow'; viewport: Viewport } | { kind: 'scroll'; view: ArtifactScrollView };
const views = new Map<string, ArtifactView>();

export const artifactViewKey = (projectId: string, artifactId: string): string => `${projectId}:${artifactId}`;
export const readArtifactViewport = (key: string): Viewport | undefined => {
  const view = views.get(key);
  return view?.kind === 'react-flow' ? { ...view.viewport } : undefined;
};
export const rememberArtifactViewport = (key: string, viewport: Viewport): void => {
  views.set(key, { kind: 'react-flow', viewport: { ...viewport } });
};
export const readArtifactScrollView = (key: string): ArtifactScrollView | undefined => {
  const view = views.get(key);
  return view?.kind === 'scroll' ? { ...view.view } : undefined;
};
export const rememberArtifactScrollView = (key: string, view: ArtifactScrollView): void => {
  views.set(key, { kind: 'scroll', view: { ...view } });
};
export const forgetArtifactView = (key: string): void => { views.delete(key); };
