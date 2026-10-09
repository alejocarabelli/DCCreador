import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCaretAfterRender, setCaretPositionAfterRender, setStateBulletCaretAfterRender } from './textCaret';

let frames: FrameRequestCallback[];

const flushFrames = () => { frames.splice(0).forEach((callback) => callback(0)); };

const element = (value: string) => {
  const textarea = {
    value,
    focus: vi.fn(),
    setSelectionRange: vi.fn(),
  };
  return textarea as typeof textarea & HTMLTextAreaElement;
};

// Line 1 starts at offset 4 in 'uno\n1. dos', so a 3-character marker lands at 7.
const VALUE = 'uno\n1. dos';

beforeEach(() => {
  frames = [];
  vi.stubGlobal('window', {
    requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('setCaretAfterRender', () => {
  it('moves the caret when the value is still the expected one', () => {
    const textarea = element(VALUE);
    setCaretAfterRender(textarea, 1, 3, VALUE);
    flushFrames();

    expect(textarea.focus).toHaveBeenCalled();
    expect(textarea.setSelectionRange).toHaveBeenCalledWith(7, 7);
  });

  it('leaves the caret alone when a newer keystroke changed the value before the frame', () => {
    const textarea = element(VALUE);
    setCaretAfterRender(textarea, 1, 3, VALUE);
    textarea.value = `${VALUE} más`;
    flushFrames();

    expect(textarea.focus).not.toHaveBeenCalled();
    expect(textarea.setSelectionRange).not.toHaveBeenCalled();
  });

  it('keeps moving the caret without an expected value', () => {
    const textarea = element(VALUE);
    setCaretAfterRender(textarea, 1, 3);
    textarea.value = `${VALUE} más`;
    flushFrames();

    expect(textarea.setSelectionRange).toHaveBeenCalledWith(7, 7);
  });
});

describe('setStateBulletCaretAfterRender', () => {
  it('moves the caret when the value is still the expected one', () => {
    const textarea = element(VALUE);
    setStateBulletCaretAfterRender(textarea, 1, 2, VALUE);
    flushFrames();

    expect(textarea.focus).toHaveBeenCalled();
    expect(textarea.setSelectionRange).toHaveBeenCalledWith(6, 6);
  });

  it('leaves the caret alone when a newer keystroke changed the value before the frame', () => {
    const textarea = element(VALUE);
    setStateBulletCaretAfterRender(textarea, 1, 2, VALUE);
    textarea.value = `${VALUE} más`;
    flushFrames();

    expect(textarea.focus).not.toHaveBeenCalled();
    expect(textarea.setSelectionRange).not.toHaveBeenCalled();
  });

  it('keeps moving the caret without an expected value', () => {
    const textarea = element(VALUE);
    setStateBulletCaretAfterRender(textarea, 1, 2);
    textarea.value = `${VALUE} más`;
    flushFrames();

    expect(textarea.setSelectionRange).toHaveBeenCalledWith(6, 6);
  });
});

describe('setCaretPositionAfterRender', () => {
  it('leaves the caret alone when the value changed before the frame', () => {
    const textarea = element('abc');
    setCaretPositionAfterRender(textarea, 1, 'abc');
    textarea.value = 'abcd';
    flushFrames();

    expect(textarea.setSelectionRange).not.toHaveBeenCalled();
  });
});
