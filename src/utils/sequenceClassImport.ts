import type {
  ClassDiagramContent,
  ClassDiagramNode,
  ClassMethod,
  SequenceDiagramContent,
  SequenceMessage,
} from '../types/diagram';
import { estimateClassSize, findFreeClassPosition } from './classPlacement';
import { createId } from './id';
import { flattenSequenceItems } from './sequenceDiagram';

export type SequenceClassImportSummary = {
  createdClasses: number;
  addedMethods: number;
  updatedClasses: number;
};

type ImportedOperation = Pick<ClassMethod, 'name' | 'parameters' | 'returnType'>;

const normalizeKey = (value: string): string => value.trim().toLocaleLowerCase();

/** `:Tramite` and `Tramite` name the same class. */
export const participantClassName = (classifierName: string, name: string): string =>
  classifierName.replace(/^:+/, '').trim() || name.trim();

/**
 * Same rule the sequence editor uses when it adds a single method to the model:
 * only calls (synchronous or asynchronous) become operations, and the message's
 * arguments are its parameters. A name typed as `buscar(id)` is split so the
 * parentheses never end up inside the operation name.
 */
const operationFromMessage = (message: SequenceMessage): ImportedOperation | null => {
  if (message.type !== 'synchronous' && message.type !== 'asynchronous') return null;

  let name = message.name.trim();
  let parameters = message.arguments.trim();
  const inlineCall = /^([^()]+)\((.*)\)$/.exec(name);
  if (inlineCall !== null) {
    name = inlineCall[1].trim();
    if (parameters.length === 0) parameters = inlineCall[2].trim();
  }
  if (name.length === 0) return null;

  return { name, parameters, returnType: message.returnType.trim() };
};

const sameOperation = (a: ImportedOperation, b: ImportedOperation): boolean =>
  normalizeKey(a.name) === normalizeKey(b.name) && normalizeKey(a.parameters) === normalizeKey(b.parameters);

/**
 * Brings every non-actor participant of the given sequence diagrams into the
 * class model, each with the operations it receives. Existing classes (matched
 * by name) only gain the operations they are missing, so importing twice is a
 * no-op rather than a duplicate.
 */
export const importClassesFromSequences = (
  classContent: ClassDiagramContent,
  sequences: SequenceDiagramContent[],
): { content: ClassDiagramContent; summary: SequenceClassImportSummary } => {
  const order: string[] = [];
  const displayNames = new Map<string, string>();
  const operations = new Map<string, ImportedOperation[]>();

  for (const sequence of sequences) {
    const participantClass = new Map<string, string>();
    const participants = [...sequence.participants].sort((a, b) => a.x - b.x);

    for (const participant of participants) {
      if (participant.kind === 'actor') continue;
      const className = participantClassName(participant.classifierName ?? '', participant.name ?? '');
      if (className.length === 0) continue;
      const key = normalizeKey(className);
      participantClass.set(participant.id, key);
      if (!displayNames.has(key)) {
        displayNames.set(key, className);
        order.push(key);
        operations.set(key, []);
      }
    }

    for (const { item } of flattenSequenceItems(sequence.items)) {
      if (item.kind !== 'message') continue;
      const key = participantClass.get(item.targetId);
      const operation = operationFromMessage(item);
      if (key === undefined || operation === null) continue;
      const known = operations.get(key) ?? [];
      if (!known.some((candidate) => sameOperation(candidate, operation))) known.push(operation);
      operations.set(key, known);
    }
  }

  const summary: SequenceClassImportSummary = { createdClasses: 0, addedMethods: 0, updatedClasses: 0 };
  const nodes: ClassDiagramNode[] = classContent.nodes.map((node) => {
    const key = normalizeKey(node.data.name);
    const incoming = operations.get(key);
    if (incoming === undefined) return node;

    const missing = incoming.filter((operation) =>
      !node.data.methods.some((method) => sameOperation(method, operation)));
    operations.delete(key);
    if (missing.length === 0) return node;

    summary.updatedClasses += 1;
    summary.addedMethods += missing.length;
    return {
      ...node,
      data: {
        ...node.data,
        methods: [...node.data.methods, ...missing.map((operation) => ({ id: createId(), visibility: '+' as const, ...operation }))],
      },
    };
  });

  const existingRight = Math.max(0, ...classContent.nodes.map((node) =>
    node.position.x + (node.width ?? estimateClassSize(node.data).width)));
  const top = classContent.nodes.length === 0
    ? 120
    : Math.min(...classContent.nodes.map((node) => node.position.y));
  const start = { x: classContent.nodes.length === 0 ? 120 : existingRight + 120, y: top };
  // Rows of about four average classes, so a long sequence does not become one
  // endless line the person has to scroll sideways to read.
  const rowWidth = 1200;
  let cursor = { ...start };
  let rowHeight = 0;

  for (const key of order) {
    const incoming = operations.get(key);
    if (incoming === undefined) continue;

    const name = displayNames.get(key) ?? key;
    const size = estimateClassSize({ name, methods: incoming });
    if (cursor.x > start.x && cursor.x + size.width > start.x + rowWidth) {
      cursor = { x: start.x, y: cursor.y + rowHeight + 60 };
      rowHeight = 0;
    }
    const position = findFreeClassPosition(nodes, cursor, size);
    cursor = { x: position.x + size.width + 60, y: cursor.y };
    rowHeight = Math.max(rowHeight, size.height);

    nodes.push({
      id: createId(),
      type: 'classNode',
      position,
      data: {
        name,
        attributes: [],
        methods: incoming.map((operation) => ({ id: createId(), visibility: '+', ...operation })),
        hasParametricValuesNote: false,
        parametricValuesNoteConnectionMode: 'automatic',
        parametricValuesNotePosition: undefined,
        parametricValues: [],
      },
    });
    summary.createdClasses += 1;
    summary.addedMethods += incoming.length;
  }

  return { content: { ...classContent, nodes }, summary };
};
