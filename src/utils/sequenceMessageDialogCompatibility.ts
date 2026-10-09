import type { SequenceMessage, SequenceParticipant } from '../types/diagram';
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

/**
 * Route proposed for the very first message of a diagram: it starts at the
 * actor (else the first participant, left to right) and goes to the next
 * different participant. A lone participant is its own target.
 */
export const firstMessageRoute = (participants: SequenceParticipant[]): { sourceId: string; targetId: string } | undefined => {
  const sorted = [...participants].sort((left, right) => left.x - right.x);
  const source = sorted.find((participant) => participant.kind === 'actor') ?? sorted[0];
  if (!source) return undefined;
  const index = sorted.indexOf(source);
  return { sourceId: source.id, targetId: (sorted[index + 1] ?? sorted[index - 1] ?? source).id };
};
