import { describe, expect, it } from 'vitest';
import type { NotebookBlock } from '../../types/diagram';
import {
  appendBlock,
  backspaceAtStart,
  changeText,
  enterInQuestion,
  focusSheetEnd,
  hasOnlyEmptyText,
  removeBlock,
  setResolved,
  toNotebook,
} from './notebookBlocks';

const text = (id: string, value = ''): NotebookBlock => ({ id, kind: 'text', text: value });
const question = (id: string, value = '', resolved = false): NotebookBlock => ({ id, kind: 'question', text: value, resolved });
const sketch = (id: string, shapes: Extract<NotebookBlock, { kind: 'sketch' }>['shapes'] = []): NotebookBlock => ({
  id, kind: 'sketch', height: 660, shapes,
});

describe('toNotebook', () => {
  it('stores nothing for a draft made only of empty blocks', () => {
    expect(toNotebook([])).toBeUndefined();
    expect(toNotebook([text('a'), question('b', '  '), sketch('c')])).toBeUndefined();
  });

  it('drops trailing scaffolding but keeps empty blocks in between', () => {
    const blocks = [question('q', 'why?'), text('mid'), question('r', 'and?'), text('end'), sketch('s')];
    expect(toNotebook(blocks)?.blocks.map((block) => block.id)).toEqual(['q', 'mid', 'r']);
  });
});

describe('changeText', () => {
  it('turns "[] " at the start of a text block into a question', () => {
    const edit = changeText([text('a')], 'a', '[] ', 3);
    expect(edit.blocks).toEqual([question('a', '')]);
    expect(edit.focus).toEqual({ id: 'a', caret: 0 });
  });

  it('accepts the markdown checkbox spellings and keeps the rest of the text', () => {
    const edit = changeText([text('a')], 'a', '- [ ] algo', 10);
    expect(edit.blocks).toEqual([question('a', 'algo')]);
    expect(edit.focus?.caret).toBe(4);
    expect(changeText([text('a')], 'a', '[ ] x', 5).blocks[0].kind).toBe('question');
  });

  it('leaves ordinary text, mid-text brackets and multi-line pastes alone', () => {
    expect(changeText([text('a')], 'a', 'hola [] ', 8).blocks[0].kind).toBe('text');
    expect(changeText([text('a')], 'a', '[] a\nb', 6).blocks[0].kind).toBe('text');
    expect(changeText([text('a')], 'a', '[]', 2).blocks[0].kind).toBe('text');
  });

  it('keeps a question on one line', () => {
    const edit = changeText([question('q')], 'q', 'uno\ndos', 7);
    expect(edit.blocks).toEqual([question('q', 'uno dos')]);
  });
});

describe('setResolved', () => {
  it('toggles only the targeted question', () => {
    const blocks = setResolved([question('a'), question('b')], 'b', true);
    expect(blocks).toEqual([question('a'), question('b', '', true)]);
  });
});

describe('enterInQuestion', () => {
  it('splits at the caret and moves the rest to a new question below', () => {
    const edit = enterInQuestion([question('a', 'hola mundo'), text('t')], 'a', 4, 4);
    expect(edit.blocks.map((block) => block.kind)).toEqual(['question', 'question', 'text']);
    expect(edit.blocks[0]).toMatchObject({ id: 'a', text: 'hola' });
    expect(edit.blocks[1]).toMatchObject({ text: ' mundo', resolved: false });
    expect(edit.focus).toEqual({ id: edit.blocks[1].id, caret: 'start' });
  });

  it('at the end creates an empty question', () => {
    const edit = enterInQuestion([question('a', 'hola')], 'a', 4, 4);
    expect(edit.blocks[1]).toMatchObject({ kind: 'question', text: '' });
  });

  it('replaces a selection with the break', () => {
    const edit = enterInQuestion([question('a', 'abcdef')], 'a', 2, 4);
    expect(edit.blocks.map((block) => (block as { text: string }).text)).toEqual(['ab', 'ef']);
  });

  it('a new question below a resolved one starts unresolved', () => {
    const edit = enterInQuestion([question('a', 'hecho', true)], 'a', 5, 5);
    expect(edit.blocks[0]).toMatchObject({ resolved: true });
    expect(edit.blocks[1]).toMatchObject({ resolved: false });
  });

  it('an empty question becomes a text block and keeps its place', () => {
    const edit = enterInQuestion([question('q', 'a'), question('b', '  '), question('c', 'z')], 'b', 2, 2);
    expect(edit.blocks[1]).toEqual({ id: 'b', kind: 'text', text: '' });
    expect(edit.blocks).toHaveLength(3);
    expect(edit.focus).toEqual({ id: 'b', caret: 0 });
  });
});

describe('backspaceAtStart', () => {
  it('deletes an empty block and focuses the end of the previous one', () => {
    const edit = backspaceAtStart([question('a', 'hola'), text('b')], 'b');
    expect(edit?.blocks.map((block) => block.id)).toEqual(['a']);
    expect(edit?.focus).toEqual({ id: 'a', caret: 'end' });
  });

  it('focuses the following block when the first one is deleted', () => {
    const edit = backspaceAtStart([question('a'), text('b', 'x')], 'a');
    expect(edit?.blocks.map((block) => block.id)).toEqual(['b']);
    expect(edit?.focus).toEqual({ id: 'b', caret: 'start' });
  });

  it('leaves the previous sketch as the focus target', () => {
    const edit = backspaceAtStart([sketch('s'), text('t')], 't');
    expect(edit?.focus).toEqual({ id: 's', caret: 'end' });
  });

  it('does not delete the lone empty text block', () => {
    expect(backspaceAtStart([text('a')], 'a')).toBeNull();
  });

  it('turns a non-empty question into text instead of deleting it', () => {
    const edit = backspaceAtStart([question('a', 'duda')], 'a');
    expect(edit?.blocks).toEqual([text('a', 'duda')]);
  });

  it('is a normal key for non-empty text', () => {
    expect(backspaceAtStart([text('a', 'x'), text('b', 'y')], 'b')).toBeNull();
  });
});

describe('removeBlock / appendBlock / focusSheetEnd', () => {
  it('removeBlock on the only block leaves nothing to focus', () => {
    expect(removeBlock([text('a')], 'a')).toEqual({ blocks: [] });
  });

  it('appendBlock reuses a trailing empty text block', () => {
    const edit = appendBlock([question('a', 'x'), text('t')], 'question');
    expect(edit.blocks.map((block) => block.kind)).toEqual(['question', 'question']);
    expect(edit.focus?.id).toBe(edit.blocks[1].id);
  });

  it('appendBlock keeps a non-empty trailing text block', () => {
    expect(appendBlock([text('t', 'hola')], 'sketch').blocks.map((block) => block.kind)).toEqual(['text', 'sketch']);
  });

  it('focusSheetEnd reaches the end of the last text or question', () => {
    const blocks = [question('a', 'x')];
    expect(focusSheetEnd(blocks, true)).toEqual({ blocks, focus: { id: 'a', caret: 'end' } });
    expect(focusSheetEnd([text('t', 'x')], false).focus).toEqual({ id: 't', caret: 'end' });
  });

  it('focusSheetEnd appends scaffolding after a sketch, after nothing, or after a doubt when clicking below', () => {
    expect(focusSheetEnd([sketch('s')], true).blocks.map((block) => block.kind)).toEqual(['sketch', 'text']);
    expect(focusSheetEnd([], true).blocks.map((block) => block.kind)).toEqual(['text']);
    expect(focusSheetEnd([question('q', 'x')], false).blocks.map((block) => block.kind)).toEqual(['question', 'text']);
  });

  it('that scaffolding is never stored', () => {
    expect(toNotebook(focusSheetEnd([], true).blocks)).toBeUndefined();
    expect(hasOnlyEmptyText(focusSheetEnd([], true).blocks)).toBe(true);
  });
});

describe('block editing limit', () => {
  const full = () => Array.from({ length: 500 }, (_, i) => question(`q${i}`, `duda ${i}`));

  it('refuses buttons, question splitting and trailing scaffolding at the limit', () => {
    const blocks = full();
    expect(appendBlock(blocks, 'question')).toEqual({ blocks, limitReached: true });
    expect(appendBlock(blocks, 'sketch')).toEqual({ blocks, limitReached: true });
    expect(enterInQuestion(blocks, 'q0', 2, 4)).toEqual({ blocks, limitReached: true });
    expect(focusSheetEnd(blocks, false)).toEqual({ blocks, limitReached: true });
  });

  it('still reuses an empty trailing text block and converts an empty question', () => {
    const blocks = [...full().slice(1), text('tail')];
    expect(appendBlock(blocks, 'sketch').blocks).toHaveLength(500);
    const questions = [...full().slice(1), question('tail')];
    expect(enterInQuestion(questions, 'tail', 0, 0).blocks.at(-1)?.kind).toBe('text');
  });

  it('keeps oversized saved notebooks editable without adding more blocks', () => {
    const blocks = [...full(), question('extra', 'guardada')];
    expect(appendBlock(blocks, 'sketch')).toEqual({ blocks, limitReached: true });
    expect(changeText(blocks, 'extra', 'corregida', 9).blocks).toHaveLength(501);
    expect(removeBlock(blocks, 'extra').blocks).toHaveLength(500);
  });
});
