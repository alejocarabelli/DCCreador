import type {
  SequenceDiagramContent,
  SequenceDiagramProblemCode,
  SequenceFragment,
  SequenceTimelineItem,
} from '../types/diagram';
import { analyzeSequenceDiagramSemantics, findSequenceItem, flattenSequenceItems, getTopLevelBlockIds, removeSequenceItem } from './sequenceDiagram';
import type { SequenceLayout } from './sequenceDiagramLayout';
import { findSequenceItemLocation } from './sequenceDiagramSelection';

export type MoveSequenceItemValidation = {
  valid: boolean;
  reason?: string;
  problemCode?: SequenceDiagramProblemCode;
  newContent?: SequenceDiagramContent;
  isNoop?: boolean;
};

export type InsertionSlot = {
  containerId: string;
  containerName?: string;
  containerBounds?: { x: number; width: number; top: number; bottom: number };
  index: number;
  y: number;
  isValid: boolean;
  reason?: string;
  isNoop: boolean;
};

/**
 * Returns the visual anchor used by the insertion guide for a dragged block.
 * It deliberately inspects every dragged id instead of relying on the first
 * selection entry, which may not be the topmost rendered item after a tree
 * move or when a selection arrives in a different order.
 */
export const getBlockDropGuideY = (
  layout: SequenceLayout,
  groupIds: string[],
  fallbackY: number,
): number => {
  const positions = groupIds.flatMap((id) => {
    const message = layout.messageLayouts.get(id);
    if (message !== undefined) return [message.y];
    const fragment = layout.fragmentLayouts.get(id);
    return fragment === undefined ? [] : [fragment.y];
  });
  return positions.length > 0 ? Math.min(...positions) : fallbackY;
};

/**
 * Moves a timeline item to a new container and index in the item tree.
 */
export const moveTimelineItemInTree = (
  items: SequenceTimelineItem[],
  itemId: string,
  targetContainerId: string,
  targetIndex: number,
): SequenceTimelineItem[] | null => {
  const sourceLoc = findSequenceItemLocation(items, itemId);
  if (!sourceLoc) return null;

  const rawItem = sourceLoc.item;
  const itemToMove = rawItem.kind === 'fragment' ? { ...rawItem, y: undefined } : rawItem;

  // Helper to remove item from its current container
  const removeFromTree = (list: SequenceTimelineItem[], containerId: string): SequenceTimelineItem[] => {
    if (containerId === sourceLoc.containerId) {
      return list.filter((it) => it.id !== itemId);
    }
    return list.map((it) => {
      if (it.kind !== 'fragment') return it;
      return {
        ...it,
        operands: it.operands.map((op) => ({
          ...op,
          items: removeFromTree(op.items, op.id),
        })),
      };
    });
  };

  // Helper to insert item into the target container
  const insertIntoTree = (list: SequenceTimelineItem[], containerId: string): SequenceTimelineItem[] => {
    if (containerId === targetContainerId) {
      let insertIdx = targetIndex;
      if (sourceLoc.containerId === targetContainerId) {
        if (targetIndex > sourceLoc.index) {
          insertIdx = targetIndex - 1;
        }
      }
      const clampedIdx = Math.max(0, Math.min(insertIdx, list.length));
      return [...list.slice(0, clampedIdx), itemToMove, ...list.slice(clampedIdx)];
    }
    return list.map((it) => {
      if (it.kind !== 'fragment') return it;
      return {
        ...it,
        operands: it.operands.map((op) => ({
          ...op,
          items: insertIntoTree(op.items, op.id),
        })),
      };
    });
  };

  const withoutItem = removeFromTree(items, 'root');
  return insertIntoTree(withoutItem, 'root');
};

/**
 * Inserta varios elementos en un contenedor ('root' o id de operando) y posición dados.
 * Si el contenedor no existe, los agrega al final de la raíz.
 */
export const insertTimelineItemsAt = (
  items: SequenceTimelineItem[],
  containerId: string,
  index: number,
  itemsToInsert: SequenceTimelineItem[],
): SequenceTimelineItem[] => {
  if (itemsToInsert.length === 0) return items;
  if (containerId === 'root') {
    const clamped = Math.max(0, Math.min(index, items.length));
    return [...items.slice(0, clamped), ...itemsToInsert, ...items.slice(clamped)];
  }
  let inserted = false;
  const insertInto = (current: SequenceTimelineItem[]): SequenceTimelineItem[] => current.map((item) => {
    if (item.kind !== 'fragment') return item;
    return {
      ...item,
      operands: item.operands.map((operand) => {
        if (operand.id === containerId) {
          inserted = true;
          const clamped = Math.max(0, Math.min(index, operand.items.length));
          return { ...operand, items: [...operand.items.slice(0, clamped), ...itemsToInsert, ...operand.items.slice(clamped)] };
        }
        return { ...operand, items: insertInto(operand.items) };
      }),
    };
  });
  const next = insertInto(items);
  return inserted ? next : [...items, ...itemsToInsert];
};

/**
 * Reubica un bloque de primer nivel en un contenedor e índice destino (puro, sin validar).
 * Devuelve null si el bloque está vacío o no existe en el árbol.
 */
export const moveSequenceItemsBlockToSlot = (
  items: SequenceTimelineItem[],
  ids: string[],
  targetContainerId: string,
  targetIndex: number,
): SequenceTimelineItem[] | null => {
  const topIds = getTopLevelBlockIds(items, ids);
  if (topIds.length === 0) return null;
  const locations = topIds.map((id) => findSequenceItemLocation(items, id));
  if (locations.some((loc) => loc === null)) return null;
  const sourceContainerId = locations[0]!.containerId;
  if (!locations.every((loc) => loc!.containerId === sourceContainerId)) return null;

  const withoutResult = topIds.reduce(
    (acc, id) => {
      const result = removeSequenceItem(acc.items, id);
      if (result.removed !== null) {
        return { items: result.items, removed: [...acc.removed, result.removed] };
      }
      return acc;
    },
    { items, removed: [] as SequenceTimelineItem[] },
  );
  if (withoutResult.removed.length !== topIds.length) return null;

  let adjustedIndex = targetIndex;
  if (targetContainerId === sourceContainerId) {
    const removedBefore = locations.filter((loc) => loc!.index < targetIndex).length;
    adjustedIndex = targetIndex - removedBefore;
  }
  return insertTimelineItemsAt(withoutResult.items, targetContainerId, adjustedIndex, withoutResult.removed);
};

/**
 * Compuerta semántica compartida: solo rechaza un candidato si introduce
 * errores nuevos de ciclo de vida respecto del contenido actual.
 */
const validateCandidateItems = (
  content: SequenceDiagramContent,
  candidateItems: SequenceTimelineItem[],
  options?: { existingArtifactIds?: Set<string> },
): MoveSequenceItemValidation => {
  const sameTree = JSON.stringify(candidateItems) === JSON.stringify(content.items);
  if (sameTree) {
    return { valid: true, isNoop: true, newContent: content };
  }

  const candidateContent: SequenceDiagramContent = {
    ...content,
    items: candidateItems,
  };

  const currentSemantics = analyzeSequenceDiagramSemantics(content, options);
  const candidateSemantics = analyzeSequenceDiagramSemantics(candidateContent, options);

  const currentErrors = new Set(
    currentSemantics.problems
      .filter((p) => p.severity === 'error')
      .map((p) => `${p.code}:${p.messageId ?? ''}:${p.participantId ?? ''}`),
  );

  const newErrors = candidateSemantics.problems.filter(
    (p) =>
      p.severity === 'error' &&
      !currentErrors.has(`${p.code}:${p.messageId ?? ''}:${p.participantId ?? ''}`),
  );

  if (newErrors.length > 0) {
    const primaryError = newErrors[0];
    return {
      valid: false,
      reason: primaryError.message,
      problemCode: primaryError.code,
      newContent: candidateContent,
    };
  }

  return {
    valid: true,
    newContent: candidateContent,
  };
};

/**
 * Valida el movimiento de un bloque con la misma compuerta semántica que el
 * movimiento simple: solo rechaza si aparecen errores nuevos de ciclo de vida.
 */
export const validateSequenceItemsBlockMove = (
  content: SequenceDiagramContent,
  ids: string[],
  targetContainerId: string,
  targetIndex: number,
  options?: { existingArtifactIds?: Set<string> },
): MoveSequenceItemValidation => {
  const topIds = getTopLevelBlockIds(content.items, ids);
  if (topIds.length === 0) {
    return { valid: false, reason: 'No hay elementos del bloque en el diagrama.' };
  }
  const newItems = moveSequenceItemsBlockToSlot(content.items, topIds, targetContainerId, targetIndex);
  if (!newItems) {
    return { valid: false, reason: 'No se pudo mover el bloque en la estructura.' };
  }

  return validateCandidateItems(content, newItems, options);
};

export type BlockDropTarget = {
  containerId: string;
  index: number;
};

const collectNestedOperandIds = (item: SequenceTimelineItem, into: Set<string>): void => {
  if (item.kind !== 'fragment') return;
  for (const operand of item.operands) {
    into.add(operand.id);
    for (const child of operand.items) {
      collectNestedOperandIds(child, into);
    }
  }
};

/**
 * Indica si soltar el bloque en ese contenedor lo anidaría dentro de sí mismo.
 */
export const isBlockDropForbidden = (
  items: SequenceTimelineItem[],
  ids: string[],
  containerId: string,
): boolean => {
  if (containerId === 'root') return false;
  const forbidden = new Set<string>();
  for (const id of getTopLevelBlockIds(items, ids)) {
    const item = findSequenceItem(items, id);
    if (item) collectNestedOperandIds(item, forbidden);
  }
  return forbidden.has(containerId);
};

/**
 * Nombre visible del contenedor destino para la guía de inserción.
 */
export const getBlockContainerName = (
  items: SequenceTimelineItem[],
  containerId: string,
): string => {
  if (containerId === 'root') return 'Secuencia principal';
  const fragments = flattenSequenceItems(items).filter((entry) => entry.item.kind === 'fragment');
  for (const entry of fragments) {
    if (entry.item.kind !== 'fragment') continue;
    const operandIndex = entry.item.operands.findIndex((operand) => operand.id === containerId);
    if (operandIndex >= 0) {
      const guard = entry.item.operands[operandIndex].guard;
      return guard
        ? `${entry.item.operator} [${guard}]`
        : `${entry.item.operator} (rama ${operandIndex + 1})`;
    }
  }
  return 'fragmento';
};

/**
 * Mapea el puntero a un hueco de inserción para el grupo arrastrado.
 *
 * - El contenedor es el operando más profundo (del layout visible) que
 *   contiene al puntero; si no, la secuencia principal.
 * - Si el puntero sigue dentro de las filas del grupo en su contenedor de
 *   origen, el destino es su posición actual (noop): agarrar nunca salta.
 * - Si no, se cuentan las filas por encima del puntero en el árbol sin el
 *   grupo, donde los huecos son estables.
 * El índice se devuelve en términos del árbol sin el grupo, listo para
 * insertar con `insertTimelineItemsAt`.
 */
export const findBlockDropTarget = (
  items: SequenceTimelineItem[],
  layout: SequenceLayout,
  groupIds: string[],
  withoutItems: SequenceTimelineItem[],
  withoutLayout: SequenceLayout,
  pointer: { x: number; y: number },
): BlockDropTarget => {
  const groupSet = new Set(groupIds);

  const sourceContainers = new Set(
    groupIds
      .map((id) => findSequenceItemLocation(items, id)?.containerId)
      .filter((container): container is string => container !== undefined),
  );
  const sourceContainer = sourceContainers.size === 1 ? [...sourceContainers][0] : null;

  let best: { containerId: string; fragmentId: string; depth: number } | null = null;
  for (const [fragmentId, fragmentBox] of layout.fragmentLayouts) {
    if (pointer.x < fragmentBox.x || pointer.x > fragmentBox.x + fragmentBox.width) continue;
    for (const operand of fragmentBox.operands) {
      if (pointer.y >= operand.top && pointer.y <= operand.bottom) {
        if (!best || fragmentBox.depth > best.depth) {
          best = { containerId: operand.id, fragmentId, depth: fragmentBox.depth };
        }
      }
    }
  }
  const containerId = best?.containerId ?? 'root';

  // Zona de agarre: dentro de las filas del grupo en su origen no hay movimiento.
  if (sourceContainer !== null && containerId === sourceContainer) {
    const sourceList = sourceContainer === 'root'
      ? items
      : (() => {
        const fragment = best ? findSequenceItem(items, best.fragmentId) : null;
        return fragment && fragment.kind === 'fragment'
          ? (fragment.operands.find((operand) => operand.id === sourceContainer)?.items ?? [])
          : [];
      })();
    let spanTop = Number.POSITIVE_INFINITY;
    let spanBottom = Number.NEGATIVE_INFINITY;
    let minIndex = 0;
    let found = false;
    sourceList.forEach((item, index) => {
      const bounds = item.kind === 'message'
        ? (() => {
          const box = layout.messageLayouts.get(item.id);
          return box ? { top: box.y - box.height / 2, bottom: box.y + box.height / 2 } : undefined;
        })()
        : (() => {
          const box = layout.fragmentLayouts.get(item.id);
          return box ? { top: box.y, bottom: box.y + box.height } : undefined;
        })();
      if (!bounds) return;
      if (groupSet.has(item.id)) {
        if (!found) {
          minIndex = index;
          found = true;
        }
        spanTop = Math.min(spanTop, bounds.top);
        spanBottom = Math.max(spanBottom, bounds.bottom);
      }
    });
    if (found && pointer.y >= spanTop && pointer.y <= spanBottom) {
      const groupBefore = sourceList
        .slice(0, minIndex)
        .filter((item) => groupSet.has(item.id)).length;
      return { containerId: sourceContainer, index: Math.max(0, minIndex - groupBefore) };
    }
  }

  // Fuera de la zona de agarre: huecos estables del árbol sin el grupo.
  let list: SequenceTimelineItem[];
  if (best) {
    const fragment = findSequenceItem(withoutItems, best.fragmentId);
    list = fragment && fragment.kind === 'fragment'
      ? (fragment.operands.find((operand) => operand.id === best!.containerId)?.items ?? [])
      : [];
  } else {
    list = withoutItems;
  }

  let index = 0;
  for (const item of list) {
    const center = item.kind === 'message'
      ? withoutLayout.messageLayouts.get(item.id)?.y
      : (() => {
        const box = withoutLayout.fragmentLayouts.get(item.id);
        return box ? box.y + box.height / 2 : undefined;
      })();
    if (center === undefined || center >= pointer.y) break;
    index += 1;
  }
  return { containerId, index };
};

/**
 * Valida un candidato ya construido (remover el bloque e insertarlo en el
 * destino) con la compuerta semántica habitual.
 */
export const validateBlockCandidate = (
  content: SequenceDiagramContent,
  candidateItems: SequenceTimelineItem[],
  ids: string[],
  containerId: string,
  options?: { existingArtifactIds?: Set<string> },
): MoveSequenceItemValidation => {
  if (isBlockDropForbidden(content.items, ids, containerId)) {
    return { valid: false, reason: 'No se puede soltar el bloque dentro de sí mismo.' };
  }
  return validateCandidateItems(content, candidateItems, options);
};

/**
 * Validates whether moving an item introduces lifecycle or semantic errors.
 */
export const validateSequenceItemMove = (
  content: SequenceDiagramContent,
  itemId: string,
  targetContainerId: string,
  targetIndex: number,
  options?: { existingArtifactIds?: Set<string> },
): MoveSequenceItemValidation => {
  const sourceLoc = findSequenceItemLocation(content.items, itemId);
  if (!sourceLoc) {
    return { valid: false, reason: 'Elemento no encontrado en el diagrama.' };
  }

  // Check if moving to exact same position (no-op)
  if (sourceLoc.containerId === targetContainerId) {
    if (targetIndex === sourceLoc.index || targetIndex === sourceLoc.index + 1) {
      return { valid: true, newContent: content };
    }
  }

  const newItems = moveTimelineItemInTree(content.items, itemId, targetContainerId, targetIndex);
  if (!newItems) {
    return { valid: false, reason: 'No se pudo mover el elemento en la estructura.' };
  }

  return validateCandidateItems(content, newItems, options);
};

/**
 * Computes all available insertion slots and evaluates their validity for the given timeline item (message or fragment).
 * Supports root-level reordering and inserting inside any fragment branch (operand).
 */
export const calculateTimelineItemInsertionSlots = (
  content: SequenceDiagramContent,
  layout: SequenceLayout,
  itemId: string,
  options?: { existingArtifactIds?: Set<string> },
): InsertionSlot[] => {
  const sourceLoc = findSequenceItemLocation(content.items, itemId);
  if (!sourceLoc) return [];

  // Prevent dropping a fragment inside itself or any of its descendants
  const forbiddenContainerIds = new Set<string>();
  if (sourceLoc.item.kind === 'fragment') {
    forbiddenContainerIds.add(sourceLoc.item.id);
    const collectForbidden = (frag: SequenceFragment) => {
      frag.operands.forEach((op) => {
        forbiddenContainerIds.add(op.id);
        op.items.forEach((it) => {
          if (it.kind === 'fragment') {
            forbiddenContainerIds.add(it.id);
            collectForbidden(it);
          }
        });
      });
    };
    collectForbidden(sourceLoc.item);
  }

  const slots: InsertionSlot[] = [];

  // Helper to get Y bounds of an item from layout
  const getItemBounds = (item: SequenceTimelineItem): { top: number; bottom: number; y: number } | null => {
    if (item.kind === 'message') {
      const msgLayout = layout.messageLayouts.get(item.id);
      if (!msgLayout) return null;
      return {
        top: msgLayout.y - 16,
        bottom: msgLayout.y + 16,
        y: msgLayout.y,
      };
    }
    const fragLayout = layout.fragmentLayouts.get(item.id);
    if (!fragLayout) return null;
    return {
      top: fragLayout.y,
      bottom: fragLayout.y + fragLayout.height,
      y: fragLayout.y + fragLayout.height / 2,
    };
  };

  const addSlotsForContainer = (
    cId: string,
    cName: string,
    cList: SequenceTimelineItem[],
    cBounds?: { x: number; width: number; top: number; bottom: number },
    opContentTop?: number,
    opBottom?: number,
  ) => {
    for (let slotIndex = 0; slotIndex <= cList.length; slotIndex += 1) {
      const isNoop =
        sourceLoc.containerId === cId &&
        (slotIndex === sourceLoc.index || slotIndex === sourceLoc.index + 1);

      let slotY: number;
      if (cList.length === 0) {
        if (opContentTop !== undefined && opBottom !== undefined) {
          slotY = (opContentTop + opBottom) / 2;
        } else {
          slotY = layout.timelineStart + 20;
        }
      } else if (slotIndex === 0) {
        const firstBounds = getItemBounds(cList[0]);
        if (opContentTop !== undefined) {
          slotY = firstBounds
            ? Math.max(opContentTop + 8, (opContentTop + firstBounds.top) / 2)
            : opContentTop + 14;
        } else {
          slotY = firstBounds
            ? Math.max(layout.timelineStart + 10, firstBounds.top - 20)
            : layout.timelineStart + 20;
        }
      } else if (slotIndex === cList.length) {
        const lastBounds = getItemBounds(cList[cList.length - 1]);
        if (opBottom !== undefined) {
          slotY = lastBounds
            ? Math.min(opBottom - 8, (lastBounds.bottom + opBottom) / 2)
            : opBottom - 14;
        } else {
          slotY = lastBounds ? lastBounds.bottom + 20 : layout.height - 40;
        }
      } else {
        const prevBounds = getItemBounds(cList[slotIndex - 1]);
        const nextBounds = getItemBounds(cList[slotIndex]);
        if (prevBounds && nextBounds) {
          slotY = (prevBounds.bottom + nextBounds.top) / 2;
        } else {
          slotY = (prevBounds?.bottom ?? 100) + 20;
        }
      }

      const validation = isNoop
        ? { valid: true }
        : validateSequenceItemMove(content, itemId, cId, slotIndex, options);

      slots.push({
        containerId: cId,
        containerName: cName,
        containerBounds: cBounds,
        index: slotIndex,
        y: Math.round(slotY),
        isValid: validation.valid,
        reason: validation.reason,
        isNoop,
      });
    }
  };

  // 1. Root level container
  addSlotsForContainer('root', 'Secuencia principal', content.items);

  // 2. All fragment operands in diagram
  const allFragments = flattenSequenceItems(content.items).filter(
    (entry) => entry.item.kind === 'fragment',
  );

  allFragments.forEach((entry) => {
    const frag = entry.item as SequenceFragment;
    if (forbiddenContainerIds.has(frag.id)) return;
    const fragLayout = layout.fragmentLayouts.get(frag.id);
    frag.operands.forEach((operand, opIdx) => {
      if (forbiddenContainerIds.has(operand.id)) return;
      const opLayout = fragLayout?.operands.find((o) => o.id === operand.id);
      const cBounds =
        fragLayout && opLayout
          ? {
              x: fragLayout.x,
              width: fragLayout.width,
              top: opLayout.top,
              bottom: opLayout.bottom,
            }
          : undefined;
      const cName = `${frag.operator}${operand.guard ? ` [${operand.guard}]` : ` (rama ${opIdx + 1})`}`;
      addSlotsForContainer(
        operand.id,
        cName,
        operand.items,
        cBounds,
        opLayout?.contentTop,
        opLayout?.bottom,
      );
    });
  });

  return slots;
};

/**
 * Backward-compatible alias for calculateTimelineItemInsertionSlots.
 */
export const calculateMessageInsertionSlots = calculateTimelineItemInsertionSlots;

/**
 * Finds the insertion slot closest to pointer position.
 * If pointerX is provided, prioritizes slots within that container's horizontal/vertical bounds.
 */
export const findClosestInsertionSlot = (
  slots: InsertionSlot[],
  pointerY: number,
  pointerX?: number,
): InsertionSlot | null => {
  if (slots.length === 0) return null;

  if (pointerX !== undefined) {
    const inside = slots.filter((slot) => {
      if (!slot.containerBounds) return false;
      const b = slot.containerBounds;
      return (
        pointerX >= b.x &&
        pointerX <= b.x + b.width &&
        pointerY >= b.top &&
        pointerY <= b.bottom
      );
    });
    if (inside.length > 0) {
      let closest = inside[0];
      let minDiff = Math.abs(inside[0].y - pointerY);
      for (let i = 1; i < inside.length; i += 1) {
        const diff = Math.abs(inside[i].y - pointerY);
        if (diff < minDiff) {
          minDiff = diff;
          closest = inside[i];
        }
      }
      return closest;
    }
  }

  let closest = slots[0];
  let minDiff = Math.abs(slots[0].y - pointerY);
  for (let i = 1; i < slots.length; i += 1) {
    const diff = Math.abs(slots[i].y - pointerY);
    if (diff < minDiff) {
      minDiff = diff;
      closest = slots[i];
    }
  }
  return closest;
};

/**
 * Reorders a fragment vertically among sibling items based on a target Y coordinate.
 */
export const reorderFragmentByY = (
  items: SequenceTimelineItem[],
  fragmentId: string,
  targetY: number,
  layout: SequenceLayout,
): SequenceTimelineItem[] => {
  const loc = findSequenceItemLocation(items, fragmentId);
  if (!loc) return items;

  const list = loc.parentList;
  const currentIdx = loc.index;
  const fragItem = list[currentIdx];
  if (!fragItem || fragItem.kind !== 'fragment') return items;

  const otherItems = list.filter((_, idx) => idx !== currentIdx);
  if (otherItems.length === 0) return items;

  let newIdx = 0;
  for (let i = 0; i < otherItems.length; i += 1) {
    const it = otherItems[i];
    const itY =
      it.kind === 'message'
        ? (layout.messageLayouts.get(it.id)?.y ?? 0)
        : (layout.fragmentLayouts.get(it.id)?.y ?? 0);
    if (targetY > itY) {
      newIdx = i + 1;
    }
  }

  if (newIdx === currentIdx) {
    return items;
  }

  const reorderedList = [
    ...otherItems.slice(0, newIdx),
    fragItem,
    ...otherItems.slice(newIdx),
  ];

  const updateTree = (current: SequenceTimelineItem[]): SequenceTimelineItem[] => {
    if (loc.containerId === 'root') {
      return reorderedList;
    }
    return current.map((it) => {
      if (it.kind !== 'fragment') return it;
      return {
        ...it,
        operands: it.operands.map((op) => ({
          ...op,
          items: op.id === loc.containerId ? reorderedList : updateTree(op.items),
        })),
      };
    });
  };

  return updateTree(items);
};
