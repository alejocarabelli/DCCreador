type QueryRoot = { querySelector: (selector: string) => unknown };

export const isModalOpen = (root: QueryRoot): boolean =>
  root.querySelector('dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"]') != null;

export const shouldIgnoreEditorShortcut = (
  event: { defaultPrevented: boolean },
  root: QueryRoot,
): boolean => event.defaultPrevented || isModalOpen(root);

export const hasCommandModifier = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey'>): boolean =>
  event.ctrlKey || event.metaKey || event.altKey;
