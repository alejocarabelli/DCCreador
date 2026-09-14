import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

type AutoGrowTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  inputRef?: (element: HTMLTextAreaElement | null) => void;
  minRows?: number;
};

export function AutoGrowTextarea({ inputRef, minRows = 1, onInput, value, ...props }: AutoGrowTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const resize = (): void => {
    const textarea = textareaRef.current;

    if (textarea === null) {
      return;
    }

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    resize();
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
      onInput={(event) => {
        resize();
        onInput?.(event);
      }}
    />
  );
}
