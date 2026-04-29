import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { MULTIPLICITY_SUGGESTIONS } from '../constants/multiplicity';

type MultiplicityInputProps = {
  ariaLabel: string;
  autoFocus?: boolean;
  compact?: boolean;
  onCancel?: () => void;
  onChange: (value: string) => void;
  onConfirm?: (value: string) => void;
  placeholder?: string;
  value: string;
};

const stopMouseEvent = (event: MouseEvent<HTMLElement>): void => {
  event.stopPropagation();
};

export function MultiplicityInput({
  ariaLabel,
  autoFocus = false,
  compact = false,
  onCancel,
  onChange,
  onConfirm,
  placeholder = '1',
  value,
}: MultiplicityInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipBlurRef = useRef(false);

  const suggestions = useMemo(() => {
    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue.length === 0) {
      return MULTIPLICITY_SUGGESTIONS;
    }

    return MULTIPLICITY_SUGGESTIONS.filter((suggestion) => suggestion.toLowerCase().startsWith(normalizedValue));
  }, [value]);

  const activeSuggestion = suggestions[0] ?? null;

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [autoFocus]);

  const confirmValue = (nextValue: string): void => {
    onChange(nextValue);
    onConfirm?.(nextValue);
    setIsFocused(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();

    if (event.key === 'Enter') {
      event.preventDefault();
      confirmValue(activeSuggestion ?? value);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      skipBlurRef.current = true;
      setIsFocused(false);
      onCancel?.();
    }
  };

  return (
    <div
      className={`multiplicity-input ${compact ? 'compact' : ''}`}
      onClick={stopMouseEvent}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDoubleClick={stopMouseEvent}
      onMouseDown={stopMouseEvent}
    >
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        value={value}
        onBlur={() => {
          if (skipBlurRef.current) {
            skipBlurRef.current = false;
            return;
          }

          onConfirm?.(value);
          setIsFocused(false);
        }}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      {isFocused && suggestions.length > 0 ? (
        <div
          className="multiplicity-suggestions"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {suggestions.map((suggestion) => (
            <button
              className={suggestion === activeSuggestion ? 'active' : ''}
              key={suggestion}
              type="button"
              onClick={() => confirmValue(suggestion)}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
