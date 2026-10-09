import { vi } from 'vitest';

// Runs effects when dependencies change, without a DOM renderer.
export const runtime = (() => {
  const slots: unknown[] = [];
  const state = { index: 0 };
  const sameDeps = (a: unknown[] | undefined, b: unknown[] | undefined): boolean =>
    a !== undefined && b !== undefined && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const memo = <T>(factory: () => T, deps: unknown[]): T => {
    const slot = state.index++;
    const previous = slots[slot] as { deps: unknown[]; value: T } | undefined;
    if (previous !== undefined && sameDeps(previous.deps, deps)) return previous.value;
    const next = { deps, value: factory() };
    slots[slot] = next;
    return next.value;
  };
  return {
    reset: () => {
      for (const slot of slots) (slot as { cleanup?: () => void } | undefined)?.cleanup?.();
      slots.length = 0;
    },
    begin: () => { state.index = 0; },
    api: {
      useState: <T>(initial: T | (() => T)): [T, (update: T | ((current: T) => T)) => void] => {
        const slot = state.index++;
        if (!(slot in slots)) {
          slots[slot] = { value: typeof initial === 'function' ? (initial as () => T)() : initial };
        }
        const box = slots[slot] as { value: T; set?: (update: T | ((current: T) => T)) => void };
        box.set ??= (update) => {
          box.value = typeof update === 'function' ? (update as (current: T) => T)(box.value) : update;
        };
        return [box.value, box.set];
      },
      useReducer: <S, A, I>(reducer: (state: S, action: A) => S, initial: I, initialize?: (value: I) => S): [S, (action: A) => void] => {
        const [value, setValue] = runtime.api.useState<S>(() => initialize ? initialize(initial) : initial as unknown as S);
        const dispatch = memo(() => (action: A) => setValue((current) => reducer(current, action)), []);
        return [value, dispatch];
      },
      useEffectEvent: <Args extends unknown[], Result>(callback: (...args: Args) => Result): ((...args: Args) => Result) => {
        const box = memo(() => ({ callback }), []);
        box.callback = callback;
        return memo(() => (...args: Args) => box.callback(...args), []);
      },
      useRef: <T>(initial: T) => memo(() => ({ current: initial }), []),
      useMemo: memo,
      useCallback: <T>(callback: T, deps: unknown[]) => memo(() => callback, deps),
      useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
        const slot = state.index++;
        const previous = slots[slot] as { deps?: unknown[]; cleanup?: () => void } | undefined;
        if (previous !== undefined && deps !== undefined && sameDeps(previous.deps, deps)) return;
        previous?.cleanup?.();
        const cleanup = effect();
        slots[slot] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined };
      },
    },
  };
})();

export const createMemoryStorage = () => {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage;
};

// Minimal window/document for the effects that useProjects registers.
export const stubBrowser = (extra: Record<string, unknown> = {}) => {
  vi.stubGlobal('window', {
    setTimeout: (...args: Parameters<typeof setTimeout>) => globalThis.setTimeout(...args),
    clearTimeout: (...args: Parameters<typeof clearTimeout>) => globalThis.clearTimeout(...args),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    ...extra,
  });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => undefined, removeEventListener: () => undefined });
};
