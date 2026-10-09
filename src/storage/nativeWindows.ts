type WindowsBridge = { postMessage: (message: unknown) => Promise<unknown> };

declare global {
  interface Window {
    __modeladorNativeWindows?: boolean;
  }
}

const bridge = (): WindowsBridge | null => {
  if (typeof window === 'undefined' || window.__modeladorNativeWindows !== true) return null;
  const handlers = (window as unknown as { webkit?: { messageHandlers?: { modeladorWindows?: WindowsBridge } } })
    .webkit?.messageHandlers;
  return window.__modeladorBridges?.windows ?? handlers?.modeladorWindows ?? null;
};

export const viewerHashPrefix = '#viewer=';

/** Opens a read-only copy of the artifact in its own window, e.g. to drag it to an iPad used as a second display. */
export const openArtifactWindow = (projectId: string, artifactId: string, title: string): void => {
  const native = bridge();
  if (native) {
    void native.postMessage({ action: 'open', projectId, artifactId, title }).catch(() => undefined);
    return;
  }
  const hash = `${viewerHashPrefix}${encodeURIComponent(projectId)}/${encodeURIComponent(artifactId)}`;
  window.open(`${window.location.pathname}${hash}`, '_blank');
};

/** Brings the main window forward with the artifact selected, so it can be edited there. */
export const focusArtifactInMainWindow = (projectId: string, artifactId: string): void => {
  const native = bridge();
  if (native) void native.postMessage({ action: 'focus-main', projectId, artifactId }).catch(() => undefined);
};

export const parseViewerHash = (hash: string): { projectId: string; artifactId: string } | null => {
  if (!hash.startsWith(viewerHashPrefix)) return null;
  const [projectId, artifactId] = hash.slice(viewerHashPrefix.length).split('/').map((part) => {
    try { return decodeURIComponent(part); } catch { return ''; }
  });
  return projectId && artifactId ? { projectId, artifactId } : null;
};
