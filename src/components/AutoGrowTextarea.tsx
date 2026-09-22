import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

type AutoGrowTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  inputRef?: (element: HTMLTextAreaElement | null) => void;
  minRows?: number;
};

export function AutoGrowTextarea({ inputRef, minRows = 1, value, ...props }: AutoGrowTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastHeightRef = useRef<string>('');

  // A single resize per committed value. Measuring costs a forced reflow, so it
  // runs once in the layout phase rather than again on every input event, and
  // only writes back when the measured height actually changed.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;

    if (textarea === null) {
      return;
    }

    textarea.style.height = 'auto';
    const next = `${textarea.scrollHeight}px`;

    if (next !== lastHeightRef.current) {
      lastHeightRef.current = next;
    }

    textarea.style.height = next;
  }, [value]);

  return (
    <textarea
      {...props}
      ref={(element) => {
        textareaRef.current = element;
        inputRef?.(element);
      }}
      rows={minRows}
      value={value}
    />
  );
}
