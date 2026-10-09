import type { ArtifactNotebook, NotebookBlock, SketchShape } from '../../types/diagram';
import { MAX_BLOCKS, createNotebookBlock, isNotebookBlockEmpty } from '../../utils/artifactNotebook';

/** Where the caret goes after an edit; sketches ignore `caret`. */
export type FocusTarget = { id: string; caret: number | 'start' | 'end' };
export type BlockEdit = { blocks: NotebookBlock[]; focus?: FocusTarget; limitReached?: boolean };

type QuestionBlock = Extract<NotebookBlock, { kind: 'question' }>;
type TextBlock = Extract<NotebookBlock, { kind: 'text' }>;

/** "[] ", "[ ] ", "- [ ] " typed at the start of a text block turn it into a question. */
const QUESTION_SHORTCUT = /^(?:[-*] )?\[ ?\] /;

const indexOfBlock = (blocks: NotebookBlock[], id: string) => blocks.findIndex((block) => block.id === id);

const withBlock = (blocks: NotebookBlock[], id: string, update: (block: NotebookBlock) => NotebookBlock) =>
  blocks.map((block) => (block.id === id ? update(block) : block));

const singleLine = (text: string) => text.replace(/\s*\n\s*/g, ' ');

/** What the project stores: trailing empty blocks are scaffolding, never data. */
export const toNotebook = (blocks: readonly NotebookBlock[]): ArtifactNotebook | undefined => {
  let end = blocks.length;
  while (end > 0 && isNotebookBlockEmpty(blocks[end - 1])) end -= 1;
  return end === 0 ? undefined : { version: 1, blocks: blocks.slice(0, end) };
};

export const notebookKey = (notebook: ArtifactNotebook | undefined): string => JSON.stringify(notebook ?? null);

/** True while there is nothing to show but an optional empty text block. */
export const hasOnlyEmptyText = (blocks: readonly NotebookBlock[]): boolean =>
  blocks.every((block) => block.kind === 'text' && block.text.trim().length === 0);

export const changeText = (blocks: NotebookBlock[], id: string, text: string, caret: number): BlockEdit => {
  const block = blocks[indexOfBlock(blocks, id)];
  if (block === undefined || block.kind === 'sketch') return { blocks };

  if (block.kind === 'question') {
    return { blocks: withBlock(blocks, id, () => ({ ...block, text: singleLine(text) })) };
  }

  const shortcut = !text.includes('\n') ? QUESTION_SHORTCUT.exec(text) : null;
  if (shortcut === null) return { blocks: withBlock(blocks, id, () => ({ ...block, text })) };

  const question: QuestionBlock = { id, kind: 'question', text: text.slice(shortcut[0].length), resolved: false };
  return {
    blocks: withBlock(blocks, id, () => question),
    focus: { id, caret: Math.max(0, caret - shortcut[0].length) },
  };
};

export const setResolved = (blocks: NotebookBlock[], id: string, resolved: boolean): NotebookBlock[] =>
  withBlock(blocks, id, (block) => (block.kind === 'question' ? { ...block, resolved } : block));

/**
 * Enter in a question: an empty one becomes a text block (like leaving a list),
 * otherwise the text after the caret moves to a new question below.
 */
export const enterInQuestion = (
  blocks: NotebookBlock[], id: string, selectionStart: number, selectionEnd: number,
): BlockEdit => {
  const index = indexOfBlock(blocks, id);
  const block = blocks[index];
  if (block === undefined || block.kind !== 'question') return { blocks };

  if (block.text.trim().length === 0) {
    const text: TextBlock = { id, kind: 'text', text: '' };
    return { blocks: withBlock(blocks, id, () => text), focus: { id, caret: 0 } };
  }

  if (blocks.length >= MAX_BLOCKS) return { blocks, limitReached: true };

  const before = block.text.slice(0, selectionStart);
  const after = block.text.slice(selectionEnd);
  const next = { ...createNotebookBlock('question'), text: after } as QuestionBlock;
  const result = blocks.slice();
  result.splice(index, 1, { ...block, text: before }, next);
  return { blocks: result, focus: { id: next.id, caret: 'start' } };
};

/**
 * Backspace with the caret at the very start. An empty block is deleted and
 * the caret goes to the end of the previous one; a non-empty question becomes
 * a text block. Returns null when the key should behave normally.
 */
export const backspaceAtStart = (blocks: NotebookBlock[], id: string): BlockEdit | null => {
  const index = indexOfBlock(blocks, id);
  const block = blocks[index];
  if (block === undefined || block.kind === 'sketch') return null;

  if (block.text.length === 0) {
    // The lone empty text block is the sheet's resting state.
    if (index === 0 && block.kind === 'text' && blocks.length === 1) return null;
    return removeBlock(blocks, id);
  }

  if (block.kind === 'question') {
    const text: TextBlock = { id, kind: 'text', text: block.text };
    return { blocks: withBlock(blocks, id, () => text), focus: { id, caret: 0 } };
  }

  return null;
};

export const removeBlock = (blocks: NotebookBlock[], id: string): BlockEdit => {
  const index = indexOfBlock(blocks, id);
  if (index === -1) return { blocks };
  const result = blocks.filter((block) => block.id !== id);
  const previous = result[index - 1];
  const following = result[index];
  if (previous !== undefined) return { blocks: result, focus: { id: previous.id, caret: 'end' } };
  if (following !== undefined) return { blocks: result, focus: { id: following.id, caret: 'start' } };
  return { blocks: result };
};

/** Appends a block (an empty trailing text block makes room for it) and focuses it. */
export const appendBlock = (blocks: NotebookBlock[], kind: NotebookBlock['kind']): BlockEdit => {
  const last = blocks[blocks.length - 1];
  const base = last !== undefined && last.kind === 'text' && last.text.length === 0 ? blocks.slice(0, -1) : blocks;
  if (base.length >= MAX_BLOCKS) return { blocks, limitReached: true };
  const block = createNotebookBlock(kind);
  return { blocks: [...base, block], focus: { id: block.id, caret: 'end' } };
};

/**
 * Puts the caret at the end of the sheet. `reuseLastQuestion` is true when the
 * sheet is opened (continue the last doubt); a click on the empty space below
 * a doubt starts a text instead.
 */
export const focusSheetEnd = (blocks: NotebookBlock[], reuseLastQuestion: boolean): BlockEdit => {
  const last = blocks[blocks.length - 1];
  if (last !== undefined && (last.kind === 'text' || (reuseLastQuestion && last.kind === 'question'))) {
    return { blocks, focus: { id: last.id, caret: 'end' } };
  }
  return appendBlock(blocks, 'text');
};

export const setSketchShapes = (blocks: NotebookBlock[], id: string, shapes: SketchShape[]): NotebookBlock[] =>
  withBlock(blocks, id, (block) => (block.kind === 'sketch' ? { ...block, shapes } : block));

export const setSketchHeight = (blocks: NotebookBlock[], id: string, height: number): NotebookBlock[] =>
  withBlock(blocks, id, (block) => (block.kind === 'sketch' ? { ...block, height } : block));
