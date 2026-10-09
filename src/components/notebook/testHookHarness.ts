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
    reset: () => { slots.length = 0; },
    unmount: () => {
      for (const slot of slots) (slot as { cleanup?: () => void })?.cleanup?.();
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

