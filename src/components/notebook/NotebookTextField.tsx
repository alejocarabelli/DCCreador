import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { MAX_TEXT_LENGTH } from '../../utils/artifactNotebook';
import { limitTextChange, limitTextPaste, TEXT_LIMIT_HINT, TEXT_PASTE_HINT } from './notebookTextLimits';

type NotebookTextFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'ref' | 'onChange'> & {
  onValueChange: (value: string, caret: number) => void;
  fieldRef?: (element: HTMLTextAreaElement | null) => void;
};

/**
 * Auto-growing plain textarea. Unlike AutoGrowTextarea it also re-measures
 * when its width changes, because the sheet can be resized while text wraps.
 */
export function NotebookTextField({ fieldRef, value, onValueChange, ...props }: NotebookTextFieldProps) {
  const [pasteHint, setPasteHint] = useState(false);
  const text = String(value ?? '');
  const hint = pasteHint ? TEXT_PASTE_HINT : text.length >= MAX_TEXT_LENGTH ? TEXT_LIMIT_HINT : null;
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
    <div style={{ flex: '1 1 auto', minWidth: 0 }}>
      <textarea
        {...props}
        ref={(element) => {
          elementRef.current = element;
          fieldRef?.(element);
        }}
        style={{ width: '100%' }}
        onChange={(event) => {
          const field = event.currentTarget;
          const next = limitTextChange(text, field.value);
          field.value = next;
          setPasteHint(false);
          onValueChange(next, field.selectionStart);
        }}
        onPaste={(event) => {
          event.preventDefault();
          const field = event.currentTarget;
          const next = limitTextPaste(text, field.selectionStart, field.selectionEnd, event.clipboardData.getData('text/plain'));
          setPasteHint(next.truncated);
          onValueChange(next.value, next.caret);
          field.value = next.value;
          field.setSelectionRange(next.caret, next.caret);
        }}
        rows={1}
        value={value}
      />
      {hint !== null ? <p className="notebook-empty-hint" role="status">{hint}</p> : null}
    </div>
  );
}
