import { describe, expect, it } from 'vitest';

const sources: Record<string, string> = {
  ...import.meta.glob('../components/*.tsx', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../components/ui/*.tsx', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../App.tsx', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>;

/**
 * Global keydown listeners that may keep working while the Apuntes sheet has
 * focus, by file: ⌘W/⌘1…9/⌃Tab and ⇧⌘E (App), and menus that only act when open
 * and close on their own outside click.
 */
const UNGUARDED: Record<string, number> = {
  '../App.tsx': 2,
  '../components/ui/Toolbar.tsx': 1,
  '../components/ArtifactTabs.tsx': 1,
  '../components/ProjectSidebar.tsx': 1,
};

const count = (source: string, pattern: RegExp): number => source.match(pattern)?.length ?? 0;

describe('notebook keyboard isolation', () => {
  it('guards every global keydown listener of the editors and the app with isNotebookEvent', () => {
    const entries = Object.entries(sources).filter(([, source]) => /(?:document|window)\.addEventListener\('keydown'/.test(source));
    expect(entries.length).toBeGreaterThanOrEqual(8);
    for (const [path, source] of entries) {
      const listeners = count(source, /(?:document|window)\.addEventListener\('keydown'/g);
      const guards = count(source, /isNotebookEvent\(/g);
      expect(guards, path).toBeGreaterThanOrEqual(listeners - (UNGUARDED[path] ?? 0));
    }
  });

  it('keeps the allow-list honest: every exempt file still has a listener', () => {
    for (const path of Object.keys(UNGUARDED)) {
      expect(count(sources[path] ?? '', /(?:document|window)\.addEventListener\('keydown'/g), path).toBeGreaterThanOrEqual(UNGUARDED[path]);
    }
  });
});
