import { describe, expect, it } from 'vitest';
import { artifactViewKey, forgetArtifactView, readArtifactScrollView, readArtifactViewport, rememberArtifactScrollView, rememberArtifactViewport } from './artifactViewMemory';

describe('artifact view memory', () => {
  it('keeps independent viewports across artifacts and projects', () => {
    const first = artifactViewKey('project', 'a');
    const second = artifactViewKey('project', 'b');
    const other = artifactViewKey('other', 'a');
    rememberArtifactViewport(first, { x: -300, y: 120, zoom: 0.65 });
    rememberArtifactViewport(second, { x: 40, y: -80, zoom: 1.5 });
    expect(readArtifactViewport(first)).toEqual({ x: -300, y: 120, zoom: 0.65 });
    expect(readArtifactViewport(second)).toEqual({ x: 40, y: -80, zoom: 1.5 });
    expect(readArtifactViewport(other)).toBeUndefined();
    const copy = readArtifactViewport(first)!;
    copy.x = 999;
    expect(readArtifactViewport(first)?.x).toBe(-300);
  });

  it('remembers scroll, zoom and expanded sequence dimensions only in memory', () => {
    const key = artifactViewKey('project', 'sequence');
    const view = { zoom: 0.7, scrollLeft: 240, scrollTop: 820, canvasSize: { width: 2800, height: 4000 } };
    rememberArtifactScrollView(key, view);
    expect(readArtifactScrollView(key)).toEqual(view);
    expect(readArtifactViewport(key)).toBeUndefined();
    forgetArtifactView(key);
    expect(readArtifactScrollView(key)).toBeUndefined();
  });
});
