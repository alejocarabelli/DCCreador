import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import windowsSource from '../../../src-tauri/src/shim-main.js?raw';
import macSource from '../../../macos/AppMain.m?raw';

const macScript = macSource.slice(macSource.indexOf('@"(() => {"'), macSource.indexOf('injectionTime:WKUserScriptInjectionTimeAtDocumentStart', macSource.indexOf('@"(() => {"')))
  .match(/"(?:[^"\\]|\\.)*"/g)!.map((part) => JSON.parse(part) as string).join('');

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('PageTransitionEvent', class extends Event {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each([['Windows', windowsSource], ['macOS', macScript]])('%s delivers drafts, saves and waits for the latest backup before closing', async (_, script) => {
  const events: string[] = [];
  let projectText = 'antes';
  let releaseBackup: (() => void) | undefined;
  let first = true;
  const target = new EventTarget();
  const postMessage = vi.fn((message: { payload: string }) => {
    events.push(`backup:${message.payload}`);
    if (!first) return Promise.resolve({});
    first = false;
    return new Promise((resolve) => { releaseBackup = () => resolve({}); });
  });
  const invoke = vi.fn((command: string, message: { payload: string }) => {
    if (command === 'backup') return postMessage(message);
    events.push('close');
    return Promise.resolve();
  });
  const windowValue = Object.assign(target, {
    __TAURI__: { core: { invoke } },
    webkit: { messageHandlers: { modeladorBackup: { postMessage } } },
    __modeladorBridges: undefined as { backup: { postMessage: typeof postMessage } } | undefined,
    __modeladorPrepareClose: undefined as (() => Promise<void>) | undefined,
  });
  vi.stubGlobal('window', windowValue);
  new Function(script)();
  target.addEventListener('modelador:flush-drafts', () => {
    projectText = 'última edición';
    events.push('draft');
  });
  target.addEventListener('pagehide', () => {
    events.push(`save:${projectText}`);
    void windowValue.__modeladorBridges!.backup.postMessage({ payload: projectText });
  });
  const close = windowValue.__modeladorPrepareClose!();
  await vi.advanceTimersByTimeAsync(1);
  expect(events.slice(0, 3)).toEqual(['draft', 'save:última edición', 'backup:última edición']);
  expect(events).not.toContain('close');
  releaseBackup!();
  await vi.advanceTimersByTimeAsync(10);
  await close;
  expect(events.filter((event) => event.startsWith('save:'))).toEqual(['save:última edición', 'save:última edición']);
  if (script === windowsSource) expect(events.at(-1)).toBe('close');
});

describe('native macOS close guard', () => {
  it('keeps the main window alive and gives Cmd+Q a bounded asynchronous wait', () => {
    expect(macSource).toContain('if (sender != self.window || self.terminationReady) return YES;');
    expect(macSource).toContain('[NSApp terminate:nil];\n    return NO;');
    expect(macSource).toContain('await window.__modeladorPrepareClose?.();');
    expect(macSource).toContain('(int64_t)(1.5 * NSEC_PER_SEC)');
    expect(macSource).toContain('[sender replyToApplicationShouldTerminate:YES];');
    expect(macSource).toContain('return NSTerminateLater;');
  });
});
