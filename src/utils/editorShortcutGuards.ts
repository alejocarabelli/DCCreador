type QueryRoot = { querySelector: (selector: string) => unknown };

export const isModalOpen = (root: QueryRoot): boolean =>
  root.querySelector('dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"]') != null;

/** An open toolbar menu (Vista, Exportar…) takes Escape first, wherever the focus is. */
export const isToolMenuOpen = (root: QueryRoot): boolean =>
  root.querySelector('details.v2-menu[open]') != null;

export const shouldIgnoreEditorShortcut = (
  event: { defaultPrevented: boolean },
  root: QueryRoot,
): boolean => event.defaultPrevented || isModalOpen(root);

export const hasCommandModifier = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey'>): boolean =>
  event.ctrlKey || event.metaKey || event.altKey;
