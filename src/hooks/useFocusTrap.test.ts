import { afterEach, describe, expect, it, vi } from 'vitest';
import { runtime } from './testHookHarness';
import { useFocusTrap } from './useFocusTrap';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const { runtime: hooks } = await import('./testHookHarness');
  return { ...actual, ...hooks.api };
});

afterEach(() => {
  runtime.reset();
  vi.unstubAllGlobals();
});

describe('modal focus trap', () => {
  it('consumes Escape before it can reach the editor and restores the opener', () => {
    class Opener { focus = vi.fn(); }
    const opener = new Opener();
    vi.stubGlobal('HTMLElement', Opener);
    vi.stubGlobal('document', { activeElement: opener });
    vi.stubGlobal('window', { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
    let listener: ((event: KeyboardEvent) => void) | undefined;
    const container = {
      addEventListener: (_: string, callback: (event: KeyboardEvent) => void) => { listener = callback; },
      removeEventListener: vi.fn(),
      querySelectorAll: () => [],
      focus: vi.fn(),
    };
    const onEscape = vi.fn();
    runtime.begin();
    useFocusTrap({ current: container as unknown as HTMLElement }, true, onEscape);
    const event = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() };
    listener?.(event as unknown as KeyboardEvent);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onEscape).toHaveBeenCalledOnce();
    runtime.reset();
    expect(opener.focus).toHaveBeenCalledOnce();
    expect(container.removeEventListener).toHaveBeenCalledWith('keydown', listener);
  });
});
