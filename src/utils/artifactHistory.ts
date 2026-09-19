export type ArtifactHistory<T> = {
  past: T[];
  future: T[];
};

export const changeHistory = <T>(
  history: ArtifactHistory<T>,
  previousContent: T,
  separateHistoryEntry: boolean,
  maxEntries = 60,
): ArtifactHistory<T> => ({
  past: separateHistoryEntry || history.past.length === 0
    ? [...history.past, previousContent].slice(-maxEntries)
    : history.past,
  future: [],
});

export const undoHistory = <T>(
  history: ArtifactHistory<T>,
  currentContent: T,
  maxEntries = 60,
): { history: ArtifactHistory<T>; content?: T } => {
  const content = history.past.at(-1);
  if (content === undefined) return { history };
  return {
    content,
    history: {
      past: history.past.slice(0, -1),
      future: [currentContent, ...history.future].slice(0, maxEntries),
    },
  };
};

export const redoHistory = <T>(
  history: ArtifactHistory<T>,
  currentContent: T,
  maxEntries = 60,
): { history: ArtifactHistory<T>; content?: T } => {
  const content = history.future[0];
  if (content === undefined) return { history };
  return {
    content,
    history: {
      past: [...history.past, currentContent].slice(-maxEntries),
      future: history.future.slice(1),
    },
  };
};
