import { useCallback, useEffectEvent, useLayoutEffect, useState, type RefObject } from 'react';
import type { ReactFlowInstance, Viewport } from 'reactflow';
import {
  artifactViewKey, readArtifactViewport, rememberArtifactScrollView, rememberArtifactViewport,
  type ArtifactScrollView,
} from '../utils/artifactViewMemory';

export function useArtifactViewport(projectId: string, artifactId: string, instance: ReactFlowInstance | null) {
  const key = artifactViewKey(projectId, artifactId);
  const [defaultViewport] = useState(() => readArtifactViewport(key));
  const onMoveEnd = useCallback((_: unknown, viewport: Viewport): void => {
    rememberArtifactViewport(key, viewport);
  }, [key]);
  useLayoutEffect(() => {
    if (instance === null) return;
    return () => rememberArtifactViewport(key, instance.getViewport());
  }, [instance, key]);
  return { defaultViewport, onMoveEnd };
}

export function useArtifactScrollMemory(
  key: string,
  scrollRef: RefObject<HTMLElement | null>,
  initialView: ArtifactScrollView | undefined,
  zoom = 1,
  canvasSize?: ArtifactScrollView['canvasSize'],
) {
  const rememberView = useEffectEvent((element: HTMLElement): void => {
    rememberArtifactScrollView(key, { zoom, scrollLeft: element.scrollLeft, scrollTop: element.scrollTop, canvasSize });
  });
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    if (initialView !== undefined) {
      element.scrollLeft = initialView.scrollLeft;
      element.scrollTop = initialView.scrollTop;
    }
    return () => rememberView(element);
  }, [initialView, key, scrollRef]);
}
