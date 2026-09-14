export const setCaretAfterRender = (
  element: HTMLTextAreaElement,
  lineIndex: number,
  markerLength: number,
): void => {
  window.requestAnimationFrame(() => {
    const lines = element.value.split('\n');
    const start = lines.slice(0, lineIndex).reduce((total, line) => total + line.length + 1, 0);
    const nextPosition = start + markerLength;
    element.focus();
    element.setSelectionRange(nextPosition, nextPosition);
  });
};

export const setCaretPositionAfterRender = (element: HTMLTextAreaElement | HTMLInputElement, position: number): void => {
  window.requestAnimationFrame(() => {
    element.focus();
    element.setSelectionRange(position, position);
  });
};

export const setStateBulletCaretAfterRender = (
  element: HTMLTextAreaElement,
  lineIndex: number,
  markerLength: number,
): void => {
  window.requestAnimationFrame(() => {
    const lines = element.value.split('\n');
    const start = lines.slice(0, lineIndex).reduce((total, line) => total + line.length + 1, 0);
    const nextPosition = start + markerLength;
    element.focus();
    element.setSelectionRange(nextPosition, nextPosition);
  });
};
