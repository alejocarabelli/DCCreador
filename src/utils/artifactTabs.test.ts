import { describe, expect, it } from 'vitest';
import {
  artifactTabShortcut, closeArtifactTabs, closeArtifactTabsToRight, closeOtherArtifactTabs,
  filterArtifactTabs, openArtifactTab, readArtifactTabs, reconcileArtifactTabs, removeMissingArtifactTabs, reorderArtifactTabs,
  type ArtifactTabState,
} from './artifactTabs';

const tabs = (activeArtifactId = 'b', openArtifactIds = ['a', 'b', 'c', 'd']): ArtifactTabState => ({ activeArtifactId, openArtifactIds });

describe('artifact tabs', () => {
  it('inserts a newly opened artifact to the right of the active tab', () => {
    expect(openArtifactTab(tabs(), 'new')).toEqual(tabs('new', ['a', 'b', 'new', 'c', 'd']));
    expect(openArtifactTab(tabs('d'), 'new')).toEqual(tabs('new', ['a', 'b', 'c', 'd', 'new']));
    expect(openArtifactTab({ openArtifactIds: [], activeArtifactId: null }, 'new')).toEqual(tabs('new', ['new']));
  });

  it('activates an already open tab without moving or duplicating it', () => {
    const state = tabs();
    expect(openArtifactTab(state, 'a')).toEqual(tabs('a'));
    expect(state).toEqual(tabs());
  });

  it('closes the active tab by selecting its right neighbor, then its left neighbor', () => {
    expect(closeArtifactTabs(tabs(), ['b'])).toEqual(tabs('c', ['a', 'c', 'd']));
    expect(closeArtifactTabs(tabs('d'), ['d'])).toEqual(tabs('c', ['a', 'b', 'c']));
    expect(closeArtifactTabs(tabs('a', ['a']), ['a'])).toEqual({ activeArtifactId: null, openArtifactIds: [] });
  });

  it('preserves the active tab when an inactive or missing tab closes', () => {
    expect(closeArtifactTabs(tabs(), ['a'])).toEqual(tabs('b', ['b', 'c', 'd']));
    expect(closeArtifactTabs(tabs(), ['unknown'])).toEqual(tabs());
  });

  it('closes all other tabs and activates the retained tab', () => {
    expect(closeOtherArtifactTabs(tabs(), 'a')).toEqual(tabs('a', ['a']));
    expect(closeOtherArtifactTabs(tabs(), 'd')).toEqual(tabs('d', ['d']));
    expect(closeOtherArtifactTabs(tabs(), 'already-closed')).toEqual(tabs());
  });

  it('closes tabs to the right, applying the same neighbor rule', () => {
    expect(closeArtifactTabsToRight(tabs(), 'c')).toEqual(tabs('b', ['a', 'b', 'c']));
    expect(closeArtifactTabsToRight(tabs('d'), 'b')).toEqual(tabs('b', ['a', 'b']));
    expect(closeArtifactTabsToRight(tabs(), 'd')).toEqual(tabs());
    expect(closeArtifactTabsToRight(tabs(), 'missing')).toEqual(tabs());
  });

  it('reorders in both directions without mutating the original list', () => {
    const ids = tabs().openArtifactIds;
    expect(reorderArtifactTabs(ids, 'b', 3)).toEqual(['a', 'c', 'd', 'b']);
    expect(reorderArtifactTabs(ids, 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(reorderArtifactTabs(ids, 'a', 99)).toEqual(['b', 'c', 'd', 'a']);
    expect(reorderArtifactTabs(ids, 'c', -2)).toEqual(['c', 'a', 'b', 'd']);
    expect(reorderArtifactTabs(ids, 'missing', 0)).toEqual(ids);
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters stale, duplicate and malformed stored IDs while preserving order', () => {
    expect(filterArtifactTabs(['c', 'unknown', 'a', 'c', 1, null], ['a', 'b', 'c'])).toEqual(['c', 'a']);
    expect(readArtifactTabs('["c","unknown","a","c"]', ['a', 'b', 'c'], 'b')).toEqual(tabs('b', ['c', 'a', 'b']));
  });

  it.each([null, '[]', '["removed"]', '{"a":1}', 'invalid JSON'])('opens only the active artifact for empty or invalid preferences: %s', (serialized) => {
    expect(readArtifactTabs(serialized, ['a', 'b', 'c'], 'b')).toEqual(tabs('b', ['b']));
  });

  it('removes deleted or moved artifacts, selecting the next surviving neighbor', () => {
    expect(removeMissingArtifactTabs(tabs(), ['a', 'd', 'closed'])).toEqual(tabs('d', ['a', 'd']));
    expect(removeMissingArtifactTabs(tabs('d'), ['a', 'closed'])).toEqual(tabs('a', ['a']));
    expect(removeMissingArtifactTabs(tabs(), ['closed'])).toEqual({ activeArtifactId: null, openArtifactIds: [] });
    expect(removeMissingArtifactTabs(tabs(), ['a', 'b', 'c', 'd', 'closed'])).toEqual(tabs());
  });

  it('opens artifacts activated through creation, import or editor navigation to the right of the previous active tab', () => {
    expect(reconcileArtifactTabs(tabs(), { existingArtifactIds: ['a', 'b', 'c', 'd', 'generated'], activeArtifactId: 'generated', projectOpened: false, projectActive: true })).toEqual(tabs('generated', ['a', 'b', 'generated', 'c', 'd']));
    expect(reconcileArtifactTabs(tabs(), { existingArtifactIds: ['a', 'b', 'c', 'd'], activeArtifactId: 'c', projectOpened: false, projectActive: true })).toEqual(tabs('c'));
  });

  it('keeps the last tab closed while at Home, then reopens the remembered artifact when entering the project', () => {
    const closed = tabs('b', []);
    const options = { existingArtifactIds: ['a', 'b', 'c'], activeArtifactId: 'b', projectOpened: false, projectActive: false };
    expect(reconcileArtifactTabs(closed, options)).toEqual(closed);
    expect(reconcileArtifactTabs(closed, { ...options, projectOpened: true, projectActive: true })).toEqual(tabs('b', ['b']));
  });

  it('does not reopen the model fallback after moving or deleting the last open source tab', () => {
    expect(reconcileArtifactTabs(tabs('b', ['b']), { existingArtifactIds: ['a', 'c'], activeArtifactId: 'a', projectOpened: false, projectActive: false })).toEqual(tabs('a', []));
    expect(reconcileArtifactTabs(tabs('b', ['b']), { existingArtifactIds: ['a', 'c'], activeArtifactId: 'a', projectOpened: true, projectActive: true })).toEqual(tabs('a', ['a']));
  });

  it('preserves a saved visual order on project changes and never opens closed artifacts just because they exist', () => {
    const state = tabs('c', ['c', 'a']);
    expect(reconcileArtifactTabs(state, { existingArtifactIds: ['a', 'b', 'c', 'd'], activeArtifactId: 'c', projectOpened: true, projectActive: true })).toEqual(state);
  });
});

const keyEvent = (key: string, modifiers: Partial<Parameters<typeof artifactTabShortcut>[0]> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers });

describe('artifact tab shortcuts', () => {
  it('cycles in both directions, wrapping at either end', () => {
    expect(artifactTabShortcut(keyEvent('Tab', { ctrlKey: true }), tabs('d'), true)).toEqual({ type: 'select', artifactId: 'a' });
    expect(artifactTabShortcut(keyEvent('Tab', { ctrlKey: true, shiftKey: true }), tabs('a'), false)).toEqual({ type: 'select', artifactId: 'd' });
  });

  it.each([true, false])('uses the platform modifier for indexed selection and closing (Mac: %s)', (isMac) => {
    const modifiers = isMac ? { metaKey: true } : { ctrlKey: true };
    expect(artifactTabShortcut(keyEvent('1', modifiers), tabs(), isMac)).toEqual({ type: 'select', artifactId: 'a' });
    expect(artifactTabShortcut(keyEvent('9', modifiers), tabs(), isMac)).toEqual({ type: 'select', artifactId: 'd' });
    expect(artifactTabShortcut(keyEvent('8', modifiers), tabs(), isMac)).toBeNull();
    expect(artifactTabShortcut(keyEvent('w', modifiers), tabs(), isMac)).toEqual({ type: 'close', artifactId: 'b' });
  });

  it('does not consume unrelated keys, extra modifiers or shortcuts on Home', () => {
    expect(artifactTabShortcut(keyEvent('1'), tabs(), true)).toBeNull();
    expect(artifactTabShortcut(keyEvent('w', { ctrlKey: true }), tabs(), true)).toBeNull();
    expect(artifactTabShortcut(keyEvent('Tab', { ctrlKey: true, altKey: true }), tabs(), true)).toBeNull();
    expect(artifactTabShortcut(keyEvent('1', { metaKey: true, shiftKey: true }), tabs(), true)).toBeNull();
    expect(artifactTabShortcut(keyEvent('w', { metaKey: true }), { openArtifactIds: [], activeArtifactId: null }, true)).toBeNull();
  });
});
