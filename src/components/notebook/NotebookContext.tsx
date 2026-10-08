import { createContext, useContext } from 'react';

export type NotebookContextValue = {
  /** False outside the main window (read-only viewer, tests): the toolbar button does not render. */
  available: boolean;
  isOpen: boolean;
  /** Opens the sheet and focuses its end, or closes it and returns focus to the canvas. */
  toggle: () => void;
  /** Open questions of the active artifact. */
  pendingCount: number;
};

const UNAVAILABLE: NotebookContextValue = { available: false, isOpen: false, toggle: () => undefined, pendingCount: 0 };

export const NotebookContext = createContext<NotebookContextValue>(UNAVAILABLE);

export const useNotebook = (): NotebookContextValue => useContext(NotebookContext);
