import type {
  ClassDiagramContent,
  SequenceDiagramContent,
  SequenceTimelineItem,
} from '../types/diagram';

type Rename = { from: string; to: string };

export type ClassModelRenames = {
  /** Class node id → its name before and after. */
  classes: Map<string, Rename>;
  /** Method id → its name before and after. */
  methods: Map<string, Rename>;
};

const normalizeClassName = (value: string): string => value.trim().replace(/^:+/, '').trim().toLocaleLowerCase();

/** Effective names during editing: a temporary blank keeps the last nonempty name. */
export const retainNonEmptyClassModelNames = (
  before: Pick<ClassDiagramContent, 'nodes'>,
  after: Pick<ClassDiagramContent, 'nodes'>,
): Pick<ClassDiagramContent, 'nodes'> => {
  const previousNodes = new Map(before.nodes.map((node) => [node.id, node]));
  return { nodes: after.nodes.map((node) => {
    const previous = previousNodes.get(node.id);
    const previousMethods = new Map(previous?.data.methods.map((method) => [method.id, method]));
    return { ...node, data: {
      ...node.data,
      name: node.data.name.trim() ? node.data.name : previous?.data.name ?? node.data.name,
      methods: node.data.methods.map((method) => ({
        ...method,
        name: method.name.trim() ? method.name : previousMethods.get(method.id)?.name ?? method.name,
      })),
    } };
  }) };
};

/**
 * Names that changed between two versions of a class model, matched by id.
 * A name cleared to blank is left out: it is a rename still being typed, and
 * callers retain the last nonempty names for the next keystroke.
 */
export const findClassModelRenames = (
  before: Pick<ClassDiagramContent, 'nodes'>,
  after: Pick<ClassDiagramContent, 'nodes'>,
): ClassModelRenames => {
  const classes = new Map<string, Rename>();
  const methods = new Map<string, Rename>();
  const previousNodes = new Map(before.nodes.map((node) => [node.id, node]));

  after.nodes.forEach((node) => {
    const previous = previousNodes.get(node.id);
    if (previous === undefined) return;
    const to = node.data.name.trim();
    if (to.length > 0 && previous.data.name.trim() !== to) {
      classes.set(node.id, { from: previous.data.name.trim(), to });
    }
    const previousMethods = new Map(previous.data.methods.map((method) => [method.id, method]));
    node.data.methods.forEach((method) => {
      const previousMethod = previousMethods.get(method.id);
      const methodTo = method.name.trim();
      if (previousMethod !== undefined && methodTo.length > 0 && previousMethod.name.trim() !== methodTo) {
        methods.set(method.id, { from: previousMethod.name.trim(), to: methodTo });
      }
    });
  });

  return { classes, methods };
};

export const hasClassModelRenames = (renames: ClassModelRenames): boolean =>
  renames.classes.size > 0 || renames.methods.size > 0;

/**
 * Carries class-model renames into a sequence diagram.
 *
 * Linked calls follow renames only while their text contains the old method
 * name. Embedded arguments and custom text are preserved. A
 * participant's text can be edited while it stays linked, so its classifier
 * only follows when it still reads the old class name.
 *
 * Returns `null` when nothing in the diagram changes.
 */
export const applyClassModelRenamesToSequence = (
  content: SequenceDiagramContent,
  renames: ClassModelRenames,
): SequenceDiagramContent | null => {
  let changed = false;

  const participants = content.participants.map((participant) => {
    const rename = participant.classifierNodeId ? renames.classes.get(participant.classifierNodeId) : undefined;
    if (rename === undefined || participant.classifierName === rename.to) return participant;
    // A rename typed by clearing the name first arrives as `'' → nuevo`; the
    // linked participant still follows it. An empty `from` matches any name.
    if (rename.from.length > 0 && normalizeClassName(participant.classifierName) !== normalizeClassName(rename.from)) {
      return participant;
    }
    changed = true;
    return { ...participant, classifierName: rename.to };
  });

  const renameItems = (items: SequenceTimelineItem[]): SequenceTimelineItem[] => items.map((item) => {
    if (item.kind === 'fragment') {
      return { ...item, operands: item.operands.map((operand) => ({ ...operand, items: renameItems(operand.items) })) };
    }
    const rename = item.operationMethodId ? renames.methods.get(item.operationMethodId) : undefined;
    if (rename === undefined) return item;
    const start = item.name.length - item.name.trimStart().length;
    const text = item.name.slice(start);
    // Older exports keep call arguments inside `name`. Replace just the
    // operation token, never the suffix or the separate arguments field.
    if (text.slice(0, rename.from.length).toLocaleLowerCase() !== rename.from.toLocaleLowerCase()) return item;
    const suffix = text.slice(rename.from.length);
    if (suffix.trim().length > 0 && !suffix.trimStart().startsWith('(')) return item;
    if (rename.from.length === 0 && text.trim().length > 0) return item;
    const name = item.name.slice(0, start) + rename.to + suffix;
    if (name === item.name) return item;
    changed = true;
    return { ...item, name };
  });
  const items = renameItems(content.items);

  return changed ? { ...content, participants, items } : null;
};

/** Reconcile a history snapshot only against real changes to its model. */
export const applyModelNamesToSequence = (
  content: SequenceDiagramContent,
  model: Pick<ClassDiagramContent, 'nodes'>,
  snapshotModel: Pick<ClassDiagramContent, 'nodes'>,
): SequenceDiagramContent | null =>
  applyClassModelRenamesToSequence(content, findClassModelRenames(snapshotModel, model));

/** A sequence follows only the "Clases de secuencias" model it points at. */
export const isSequenceUsingClassModel = (
  content: SequenceDiagramContent,
  modelArtifactId: string,
): boolean => content.classDiagramArtifactId === modelArtifactId;
