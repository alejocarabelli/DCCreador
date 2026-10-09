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

/**
 * Names that changed between two versions of a class model, matched by id.
 * A name cleared to blank is left out: it is a rename still being typed, and
 * the next keystroke carries the real one.
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
 * A message linked to a method always shows that method's name (editing the
 * name by hand drops the link), so linked messages follow the rename. A
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
    if (rename === undefined || item.name.trim() === rename.to) return item;
    changed = true;
    return { ...item, name: rename.to };
  });
  const items = renameItems(content.items);

  return changed ? { ...content, participants, items } : null;
};

/**
 * Names a sequence should show for the model it is linked to now. Undo and
 * redo bring back a snapshot that can predate renames, so each linked
 * participant takes its class's current name and each linked call its
 * method's. Links to elements that no longer exist stay as they are. Returns
 * `null` when nothing changes.
 */
export const applyModelNamesToSequence = (
  content: SequenceDiagramContent,
  model: Pick<ClassDiagramContent, 'nodes'>,
): SequenceDiagramContent | null => {
  const classes = new Map<string, Rename>();
  const methods = new Map<string, Rename>();

  model.nodes.forEach((node) => {
    const name = node.data.name.trim();
    if (name.length > 0) classes.set(node.id, { from: '', to: name });
    node.data.methods.forEach((method) => {
      const methodName = method.name.trim();
      if (methodName.length > 0) methods.set(method.id, { from: '', to: methodName });
    });
  });

  return applyClassModelRenamesToSequence(content, { classes, methods });
};

/** A sequence follows only the "Clases de secuencias" model it points at. */
export const isSequenceUsingClassModel = (
  content: SequenceDiagramContent,
  modelArtifactId: string,
): boolean => content.classDiagramArtifactId === modelArtifactId;
