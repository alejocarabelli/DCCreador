import type { SequenceMessage } from '../types/diagram';
import {
  sequenceMessageEditModelToPatch,
  type SequenceMessageEditModel,
} from './sequenceMessageEditing';

/** Compatibility surface kept outside the React component for Fast Refresh. */
export type QuickMessageDraft = SequenceMessageEditModel;

export const messageDraftFields = (message?: SequenceMessage) => ({
  arguments: message?.arguments ?? '',
  parameterValues: message?.parameterValues ?? '',
  returnType: message?.returnType ?? '',
  operationMethodId: message?.operationMethodId,
  replyToMessageId: message?.replyToMessageId,
  flowReference: message?.flowReference ?? '',
});

export const quickMessageValues = (draft: QuickMessageDraft) => sequenceMessageEditModelToPatch(draft);
