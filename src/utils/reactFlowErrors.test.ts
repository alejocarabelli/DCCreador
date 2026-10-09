import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleReactFlowError } from './reactFlowErrors';

afterEach(() => vi.restoreAllMocks());

describe('handleReactFlowError', () => {
  it('drops the StrictMode false alarm about nodeTypes and edgeTypes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    handleReactFlowError('002', 'It looks like you have created a new nodeTypes or edgeTypes object.');
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps every other warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    handleReactFlowError('010', 'Handle not found.');
    expect(warn).toHaveBeenCalledWith('[React Flow]: Handle not found.');
  });
});
