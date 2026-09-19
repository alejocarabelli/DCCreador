import type { SequenceDiagramContent, SequenceTimelineItem } from '../types/diagram';
import { flattenSequenceItems } from './sequenceDiagram';
import type { SequenceLayout } from './sequenceDiagramLayout';
import { getSequenceMessageEndpoints } from './sequenceDiagramLayout';

export type SequenceSelectionTarget = {
  kind: 'participant' | 'message' | 'fragment' | 'note';
  id: string;
};

export type SequenceSelectionState = {
  primary: SequenceSelectionTarget | null;
  elements: SequenceSelectionTarget[];
};

export const replaceSequenceSelection = (
  elements: SequenceSelectionTarget[],
  primary: SequenceSelectionTarget | null = elements[0] ?? null,
): SequenceSelectionState => {
  const unique = elements.filter((element, index) =>
    elements.findIndex((candidate) => candidate.kind === element.kind && candidate.id === element.id) === index);
  const resolvedPrimary = primary !== null
    && unique.some((element) => element.kind === primary.kind && element.id === primary.id)
    ? primary
    : unique[0] ?? null;
  return { primary: resolvedPrimary, elements: unique };
};

export const selectSequenceElement = (
  element: SequenceSelectionTarget | null,
): SequenceSelectionState => replaceSequenceSelection(element ? [element] : []);

export const pruneSequenceSelection = (
  state: SequenceSelectionState,
  content: SequenceDiagramContent,
): SequenceSelectionState => {
  const validElements = state.elements.filter((element) => {
    if (element.kind === 'participant') {
      return content.participants.some((participant) => participant.id === element.id);
    }
    if (element.kind === 'note') {
      return content.notes.some((note) => note.id === element.id);
    }
    const item = findSequenceItemLocation(content.items, element.id)?.item;
    return item?.kind === element.kind;
  });
  return replaceSequenceSelection(validElements, state.primary);
};

export const toggleSequenceElement = (
  state: SequenceSelectionState,
  element: SequenceSelectionTarget,
): SequenceSelectionState => {
  const exists = state.elements.some((candidate) => candidate.kind === element.kind && candidate.id === element.id);
  const elements = exists
    ? state.elements.filter((candidate) => candidate.kind !== element.kind || candidate.id !== element.id)
    : [...state.elements, element];
  return replaceSequenceSelection(elements, exists ? state.primary : element);
};

export type SequenceItemLocation = {
  containerId: string; // 'root' or operandId
  index: number;
  item: SequenceTimelineItem;
  parentList: SequenceTimelineItem[];
};

export const findSequenceItemLocation = (
  items: SequenceTimelineItem[],
  itemId: string,
  containerId = 'root',
): SequenceItemLocation | null => {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.id === itemId) {
      return { containerId, index: i, item, parentList: items };
    }
    if (item.kind === 'fragment') {
      for (const operand of item.operands) {
        const found = findSequenceItemLocation(operand.items, itemId, operand.id);
        if (found !== null) return found;
      }
    }
  }
  return null;
};

export const areItemsInSameContainer = (
  items: SequenceTimelineItem[],
  itemIds: string[],
): boolean => {
  if (itemIds.length <= 1) return true;
  const locations = itemIds.map((id) => findSequenceItemLocation(items, id));
  if (locations.some((loc) => loc === null)) return false;
  const firstContainerId = locations[0]!.containerId;
  return locations.every((loc) => loc!.containerId === firstContainerId);
};

export const areItemsContiguous = (
  items: SequenceTimelineItem[],
  itemIds: string[],
): boolean => {
  if (itemIds.length === 0) return false;
  if (itemIds.length === 1) {
    return findSequenceItemLocation(items, itemIds[0]) !== null;
  }
  const locations = itemIds.map((id) => findSequenceItemLocation(items, id));
  if (locations.some((loc) => loc === null)) return false;
  const firstContainerId = locations[0]!.containerId;
  if (!locations.every((loc) => loc!.containerId === firstContainerId)) return false;

  const indices = locations.map((loc) => loc!.index).sort((a, b) => a - b);
  for (let i = 1; i < indices.length; i += 1) {
    if (indices[i] !== indices[i - 1] + 1) {
      return false;
    }
  }
  return true;
};

export const getContiguousRange = (
  items: SequenceTimelineItem[],
  startId: string,
  endId: string,
): string[] | null => {
  const startLoc = findSequenceItemLocation(items, startId);
  const endLoc = findSequenceItemLocation(items, endId);
  if (!startLoc || !endLoc || startLoc.containerId !== endLoc.containerId) {
    return null;
  }
  const minIdx = Math.min(startLoc.index, endLoc.index);
  const maxIdx = Math.max(startLoc.index, endLoc.index);
  return startLoc.parentList.slice(minIdx, maxIdx + 1).map((item) => item.id);
};

export const getOrderedSelectionInContainer = (
  items: SequenceTimelineItem[],
  selectedIds: string[],
): SequenceTimelineItem[] | null => {
  if (!areItemsContiguous(items, selectedIds)) return null;
  const firstLoc = findSequenceItemLocation(items, selectedIds[0]);
  if (!firstLoc) return null;
  const selectedSet = new Set(selectedIds);
  return firstLoc.parentList.filter((item) => selectedSet.has(item.id));
};

export type SequenceMarqueeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const marqueeRectsIntersect = (
  left: SequenceMarqueeRect,
  right: SequenceMarqueeRect,
): boolean =>
  left.x <= right.x + right.width
  && left.x + left.width >= right.x
  && left.y <= right.y + right.height
  && left.y + left.height >= right.y;

/**
 * Elementos tocados por el rectángulo de selección. Devuelve ids de mensajes
 * y fragmentos (línea de tiempo) más ids de notas.
 *
 * Prefiere lo de adentro: un fragmento parcialmente tocado no se incluye si
 * ya hay elementos seleccionados dentro de él; si el marquee lo encierra por
 * completo, se incluye solo él (lo de adentro va implícito en el bloque).
 */
export const findMarqueeHits = (
  content: SequenceDiagramContent,
  layout: SequenceLayout,
  rect: SequenceMarqueeRect,
): { timelineIds: string[]; noteIds: string[] } => {
  const timelineIds: string[] = [];
  const noteIds: string[] = [];
  for (const entry of flattenSequenceItems(content.items)) {
    const item = entry.item;
    if (item.kind === 'message') {
      const box = layout.messageLayouts.get(item.id);
      const endpoints = getSequenceMessageEndpoints(content, layout, item);
      if (!box || !endpoints) continue;
      let x1 = Math.min(endpoints.sourceX, endpoints.targetX);
      let x2 = Math.max(endpoints.sourceX, endpoints.targetX);
      if (item.sourceId === item.targetId) x2 += 52;
      let y1 = box.y - 10;
      let y2 = box.y + 10;
      if (box.labelLines.length > 0) {
        x1 = Math.min(x1, box.labelCenterX - box.labelWidth / 2);
        x2 = Math.max(x2, box.labelCenterX + box.labelWidth / 2);
        y1 = Math.min(y1, box.labelTop - 2);
        y2 = Math.max(y2, box.labelBottom + 4);
      }
      if (box.flowLines.length > 0) {
        y1 = Math.min(y1, box.flowTop ?? y1);
        y2 = Math.max(y2, box.flowBottom ?? box.flowBaselineY ?? y2);
      }
      if (marqueeRectsIntersect(rect, { x: x1 - 4, y: y1 - 4, width: x2 - x1 + 8, height: y2 - y1 + 8 })) {
        timelineIds.push(item.id);
      }
    } else {
      const fragmentBox = layout.fragmentLayouts.get(item.id);
      if (!fragmentBox) continue;
      if (marqueeRectsIntersect(rect, { x: fragmentBox.x, y: fragmentBox.y, width: fragmentBox.width, height: fragmentBox.height })) {
        timelineIds.push(item.id);
      }
    }
  }
  for (const note of content.notes) {
    const noteBox = layout.noteLayouts.get(note.id);
    if (!noteBox) continue;
    if (marqueeRectsIntersect(rect, noteBox)) noteIds.push(note.id);
  }

  const parentOf = new Map<string, string | undefined>();
  for (const entry of flattenSequenceItems(content.items)) {
    parentOf.set(entry.item.id, entry.parentFragmentId);
  }
  const isDescendantOf = (id: string, ancestorId: string): boolean => {
    let current = parentOf.get(id);
    while (current !== undefined) {
      if (current === ancestorId) return true;
      current = parentOf.get(current);
    }
    return false;
  };
  const containsBox = (box: SequenceMarqueeRect): boolean =>
    rect.x <= box.x
    && rect.y <= box.y
    && rect.x + rect.width >= box.x + box.width
    && rect.y + rect.height >= box.y + box.height;

  const selected = new Set(timelineIds);
  for (const id of [...selected]) {
    const fragmentBox = layout.fragmentLayouts.get(id);
    if (!fragmentBox) continue;
    const selectedDescendants = [...selected].filter(
      (other) => other !== id && isDescendantOf(other, id),
    );
    if (selectedDescendants.length === 0) continue;
    if (containsBox({ x: fragmentBox.x, y: fragmentBox.y, width: fragmentBox.width, height: fragmentBox.height })) {
      for (const descendant of selectedDescendants) selected.delete(descendant);
    } else {
      selected.delete(id);
    }
  }
  const selectedTimelineIds = timelineIds.filter((id) => selected.has(id));
  const byContainer = new Map<string, string[]>();
  selectedTimelineIds.forEach((id) => {
    const containerId = findSequenceItemLocation(content.items, id)?.containerId;
    if (containerId === undefined) return;
    byContainer.set(containerId, [...(byContainer.get(containerId) ?? []), id]);
  });
  const compatibleTimelineIds = [...byContainer.entries()].reduce(
    (best, candidate) => candidate[1].length > best[1].length
      || (candidate[1].length === best[1].length && best[0] === 'root' && candidate[0] !== 'root')
      ? candidate
      : best,
    ['root', []] as [string, string[]],
  )[1];
  return { timelineIds: compatibleTimelineIds, noteIds };
};
