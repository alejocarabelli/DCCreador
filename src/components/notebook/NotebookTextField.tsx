import { useEffect, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

type NotebookTextFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'ref'> & {
  fieldRef?: (element: HTMLTextAreaElement | null) => void;
};

/**
 * Auto-growing plain textarea. Unlike AutoGrowTextarea it also re-measures
 * when its width changes, because the sheet can be resized while text wraps.
 */
export function NotebookTextField({ fieldRef, value, ...props }: NotebookTextFieldProps) {
  const elementRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (element === null) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    const element = elementRef.current;
    if (element === null || typeof ResizeObserver === 'undefined') return undefined;
    let lastWidth = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === lastWidth) return;
      lastWidth = element.clientWidth;
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight}px`;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <textarea
      {...props}
      ref={(element) => {
        elementRef.current = element;
        fieldRef?.(element);
      }}
      rows={1}
      value={value}
    />
  );
}
