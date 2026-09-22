import type {
  ClassAttribute,
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
  addedAttributes: number;
  addedMethods: number;
  updatedClasses: number;
};

type ImportedOperation = Pick<ClassMethod, 'name' | 'parameters' | 'returnType'>;

const normalizeKey = (value: string): string => value.trim().toLocaleLowerCase();

/** `:Tramite` and `Tramite` name the same class. */
export const participantClassName = (classifierName: string, name: string): string =>
  classifierName.replace(/^:+/, '').trim() || name.trim();

/**
 * Only calls (synchronous or asynchronous) become operations. A message's
 * arguments are what that call passes at that moment, not the operation's
 * signature, so they are left out: the import brings the name alone. A name
 * typed as `buscar(id)` is cut at the parenthesis for the same reason.
 */
const operationFromMessage = (message: SequenceMessage): ImportedOperation | null => {
  if (message.type !== 'synchronous' && message.type !== 'asynchronous') return null;

  const name = message.name.replace(/\(.*$/, '').trim();
  if (name.length === 0) return null;

  return { name, parameters: '', returnType: message.returnType.trim() };
};

/**
 * `getNombre` and `setNombre` read and write an attribute, so the class has to
 * hold `nombre`. A getter's result is the attribute's type; a setter's
 * argument is only a value, so it says nothing about the type.
 */
export const accessorAttribute = (operation: Pick<ImportedOperation, 'name' | 'returnType'>): Omit<ClassAttribute, 'id'> | null => {
  const match = /^(get|set)([A-ZÁÉÍÓÚÜÑ][\wÁÉÍÓÚÜÑáéíóúüñ]*)$/.exec(operation.name.trim());
  if (match === null) return null;
  const rest = match[2];
  // `getURL` keeps its capitals; `getNombre` becomes `nombre`.
  const name = /^[A-ZÁÉÍÓÚÜÑ]{2}/.test(rest) ? rest : `${rest[0].toLocaleLowerCase()}${rest.slice(1)}`;
  const type = match[1] === 'get' ? operation.returnType.trim() : '';
  return { name, type: type.toLocaleLowerCase() === 'void' ? '' : type };
};

/** Attributes the accessors among `operations` need and `existing` lacks. */
const accessorAttributes = (
  operations: Pick<ImportedOperation, 'name' | 'returnType'>[],
  existing: Pick<ClassAttribute, 'name'>[],
): ClassAttribute[] => {
  const taken = new Set(existing.map((attribute) => normalizeKey(attribute.name)));
  const added = new Map<string, ClassAttribute>();
  for (const operation of operations) {
    const attribute = accessorAttribute(operation);
    if (attribute === null) continue;
    const key = normalizeKey(attribute.name);
    if (taken.has(key)) continue;
    const pending = added.get(key);
    if (pending === undefined) added.set(key, { id: createId(), ...attribute });
    // A setter seen first leaves the type empty; the getter can still fill it.
    else if (pending.type === '') pending.type = attribute.type;
  }
  return [...added.values()];
};

/** One operation per name: `buscar(id)` and `buscar(nro)` are the same method. */
const sameOperation = (a: Pick<ImportedOperation, 'name'>, b: Pick<ImportedOperation, 'name'>): boolean =>
  normalizeKey(a.name) === normalizeKey(b.name);

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

  const summary: SequenceClassImportSummary = { createdClasses: 0, addedAttributes: 0, addedMethods: 0, updatedClasses: 0 };
  const nodes: ClassDiagramNode[] = classContent.nodes.map((node) => {
    const key = normalizeKey(node.data.name);
    const incoming = operations.get(key);
    if (incoming === undefined) return node;

    const missing = incoming.filter((operation) =>
      !node.data.methods.some((method) => sameOperation(method, operation)));
    const attributes = accessorAttributes([...node.data.methods, ...incoming], node.data.attributes);
    operations.delete(key);
    if (missing.length === 0 && attributes.length === 0) return node;

    summary.updatedClasses += 1;
    summary.addedMethods += missing.length;
    summary.addedAttributes += attributes.length;
    return {
      ...node,
      data: {
        ...node.data,
        attributes: [...node.data.attributes, ...attributes],
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
    const attributes = accessorAttributes(incoming, []);
    const size = estimateClassSize({ name, attributes, methods: incoming });
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
        attributes,
        methods: incoming.map((operation) => ({ id: createId(), visibility: '+', ...operation })),
        hasParametricValuesNote: false,
        parametricValuesNoteConnectionMode: 'automatic',
        parametricValuesNotePosition: undefined,
        parametricValues: [],
      },
    });
    summary.createdClasses += 1;
    summary.addedAttributes += attributes.length;
    summary.addedMethods += incoming.length;
  }

  return { content: { ...classContent, nodes }, summary };
};
