import { describe, expect, it } from 'vitest';
import { MAX_TEXT_LENGTH } from '../../utils/artifactNotebook';
import { limitTextChange, limitTextPaste } from './notebookTextLimits';

describe('notebook text editing limits', () => {
  it('accepts the limit and refuses additional typing', () => {
    const text = 'a'.repeat(MAX_TEXT_LENGTH);
    expect(limitTextChange(text.slice(1), text)).toBe(text);
    expect(limitTextChange(text, text + 'b')).toBe(text);
  });

  it('allows reducing and correcting existing oversized text without truncating it', () => {
    const text = 'a'.repeat(MAX_TEXT_LENGTH + 3);
    expect(limitTextChange(text, text.slice(1))).toBe(text.slice(1));
    expect(limitTextChange(text, 'b' + text.slice(1))).toBe('b' + text.slice(1));
    expect(limitTextChange(text, text + 'b')).toBe(text);
  });

  it('pastes only available text and reports truncation, preserving the suffix', () => {
    const text = 'a'.repeat(MAX_TEXT_LENGTH - 3) + 'fin';
    const result = limitTextPaste(text, 0, 2, 'hello');
    expect(result).toEqual({ value: 'he' + text.slice(2), caret: 2, truncated: true });
    expect(result.value).toHaveLength(MAX_TEXT_LENGTH);
  });

  it('does not report a short paste or destroy oversized saved text', () => {
    expect(limitTextPaste('hola', 0, 4, 'chau')).toEqual({ value: 'chau', caret: 4, truncated: false });
    const text = 'a'.repeat(MAX_TEXT_LENGTH + 3);
    expect(limitTextPaste(text, 0, 0, 'b')).toEqual({ value: text, caret: 0, truncated: true });
  });

  it('does not split a surrogate pair at the limit', () => {
    const text = 'a'.repeat(MAX_TEXT_LENGTH - 1);
    expect(limitTextPaste(text, text.length, text.length, '😀')).toEqual({ value: text, caret: text.length, truncated: true });
  });
});
