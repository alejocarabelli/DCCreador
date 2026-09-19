import type { SequenceParticipant, SequenceParticipantKind } from '../types/diagram';
import { createId } from './id';
import { getSequenceParticipantHeaderWidth } from './sequenceDiagramGeometry';

export type ParsedSequenceParticipantLabel = {
  instanceName: string;
  classifierName: string;
};

/**
 * The single textual participant contract used by the normal editor and the
 * keyboard composer.  A missing left side is intentional (`:Clase`).
 */
export const parseSequenceParticipantLabel = (text: string): ParsedSequenceParticipantLabel => {
  const value = text.replace(/[\r\n]+/g, ' ').trim();
  if (!value) return { instanceName: '', classifierName: '' };
  const separator = value.indexOf(':');
  if (separator < 0) return { instanceName: '', classifierName: value.trim() };
  return {
    instanceName: value.slice(0, separator).trim(),
    classifierName: value.slice(separator + 1).trim(),
  };
};

export const formatSequenceParticipantLabel = (
  participant: Pick<SequenceParticipant, 'name' | 'classifierName'>,
): string => {
  const instanceName = participant.name.trim();
  const classifierName = participant.classifierName.trim().replace(/^:+/, '');
  return instanceName ? `${instanceName}:${classifierName}` : `:${classifierName}`;
};

export const participantLabelIsValid = (parsed: ParsedSequenceParticipantLabel): boolean =>
  parsed.classifierName.length > 0;

export const buildSequenceParticipantFromLabel = ({
  id,
  text,
  x,
  kind = 'object',
  terminateLifeline,
}: {
  id: string;
  text: string;
  x: number;
  kind?: SequenceParticipantKind;
  terminateLifeline?: boolean;
}): SequenceParticipant | null => {
  const parsed = parseSequenceParticipantLabel(text);
  if (!participantLabelIsValid(parsed)) return null;
  return {
    id,
    kind,
    name: parsed.instanceName,
    classifierName: parsed.classifierName,
    x,
    ...(terminateLifeline === undefined ? {} : { terminateLifeline }),
  };
};

/**
 * Shared creation entry point for the normal editor and keyboard composer.
 * It owns id allocation, measured insertion and the textual validation
 * contract so a surface cannot accidentally create a different shape.
 */
export const createSequenceParticipantFromLabel = ({
  text,
  participants,
  side = 1,
  kind = 'object',
  terminateLifeline,
}: {
  text: string;
  participants: SequenceParticipant[];
  side?: -1 | 1;
  kind?: SequenceParticipantKind;
  terminateLifeline?: boolean;
}): SequenceParticipant | null => {
  const parsed = parseSequenceParticipantLabel(text);
  if (!participantLabelIsValid(parsed)) return null;
  const id = createId();
  const candidate = { id, kind, name: parsed.instanceName, classifierName: parsed.classifierName };
  return buildSequenceParticipantFromLabel({
    id,
    text,
    x: resolveSequenceParticipantInsertionX(participants, candidate, side),
    kind,
    terminateLifeline,
  });
};

export const resolveSequenceParticipantInsertionX = (
  participants: SequenceParticipant[],
  participant: Pick<SequenceParticipant, 'kind' | 'name' | 'classifierName'>,
  side: -1 | 1 = 1,
): number => {
  const participantWidth = getSequenceParticipantHeaderWidth(participant);
  if (participants.length === 0) return 120;
  if (side < 0) {
    const leftmost = participants.reduce((left, current) => Math.min(
      left,
      current.x - getSequenceParticipantHeaderWidth(current) / 2,
    ), Number.POSITIVE_INFINITY);
    return Math.max(90, Math.round(leftmost - participantWidth / 2 - 20));
  }
  const rightmost = participants.reduce((right, current) => Math.max(
    right,
    current.x + getSequenceParticipantHeaderWidth(current) / 2,
  ), Number.NEGATIVE_INFINITY);
  return Math.round(rightmost + participantWidth / 2 + 20);
};
