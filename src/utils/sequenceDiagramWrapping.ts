import type {
  SequenceDiagramContent,
  SequenceFragment,
  SequenceFragmentOperator,
  SequenceTimelineItem,
} from '../types/diagram';
import { createId } from './id';
import { analyzeSequenceDiagramSemantics } from './sequenceDiagram';
import type { SequenceLayout } from './sequenceDiagramLayout';
import { areItemsContiguous, findSequenceItemLocation } from './sequenceDiagramSelection';

export type WrapSequenceItemsResult = {
  items: SequenceTimelineItem[];
  createdFragment: SequenceFragment;
};

const defaultFragmentName = (operator: SequenceFragmentOperator): string => {
  switch (operator) {
    case 'alt':
      return 'Alternativa';
    case 'loop':
      return 'Bucle';
    case 'opt':
      return 'Opcional';
    case 'par':
      return 'Paralelo';
    case 'critical':
      return 'Región crítica';
    default:
      return 'Fragmento';
  }
};

const defaultFragmentGuard = (operator: SequenceFragmentOperator): string => {
  switch (operator) {
    case 'loop':
      return 'mientras condición';
    case 'alt':
    case 'opt':
      return 'condición';
    default:
      return '';
  }
};

export const wrapSequenceItems = (
  items: SequenceTimelineItem[],
  selectedIds: string[],
  operator: SequenceFragmentOperator,
  fragmentName?: string,
  guard?: string,
): WrapSequenceItemsResult | null => {
  if (!areItemsContiguous(items, selectedIds)) return null;

  const firstLoc = findSequenceItemLocation(items, selectedIds[0]);
  if (!firstLoc) return null;

  const selectedSet = new Set(selectedIds);
  const orderedSelectedItems = firstLoc.parentList.filter((item) => selectedSet.has(item.id));
  if (orderedSelectedItems.length === 0) return null;

  const primaryOperand = {
    id: createId(),
    guard: guard ?? defaultFragmentGuard(operator),
    items: orderedSelectedItems,
  };

  const operands = operator === 'alt'
    ? [primaryOperand, { id: createId(), guard: 'else', items: [] }]
    : [primaryOperand];

  const createdFragment: SequenceFragment = {
    id: createId(),
    kind: 'fragment',
    operator,
    name: fragmentName ?? defaultFragmentName(operator),
    operands,
  };

  const replaceInList = (list: SequenceTimelineItem[], containerId: string): SequenceTimelineItem[] => {
    if (containerId === firstLoc.containerId) {
      // Find range of selected items in this list
      let firstIndex = -1;
      let lastIndex = -1;
      for (let i = 0; i < list.length; i += 1) {
        if (selectedSet.has(list[i].id)) {
          if (firstIndex === -1) firstIndex = i;
          lastIndex = i;
        }
      }
      if (firstIndex !== -1 && lastIndex !== -1) {
        return [
          ...list.slice(0, firstIndex),
          createdFragment,
          ...list.slice(lastIndex + 1),
        ];
      }
    }

    // Traverse recursively into fragments
    return list.map((item) => {
      if (item.kind !== 'fragment') return item;
      return {
        ...item,
        operands: item.operands.map((operand) => ({
          ...operand,
          items: replaceInList(operand.items, operand.id),
        })),
      };
    });
  };

  const newItems = replaceInList(items, 'root');
  return { items: newItems, createdFragment };
};

export type FragmentBoundaryChanges = {
  fragmentId: string;
  edge: 'top' | 'bottom';
  targetOperandId: string;
  itemsToAbsorb: SequenceTimelineItem[];
  itemsToEject: SequenceTimelineItem[];
};

const itemFitsFragmentHorizontalFrame = (
  item: SequenceTimelineItem,
  layout: SequenceLayout,
  fragmentBox: { x: number; width: number },
): boolean => {
  const left = fragmentBox.x;
  const right = fragmentBox.x + fragmentBox.width;
  if (item.kind === 'message') {
    const sourceX = layout.participantX.get(item.sourceId);
    const targetX = layout.participantX.get(item.targetId);
    return sourceX !== undefined && targetX !== undefined
      && sourceX >= left && sourceX <= right
      && targetX >= left && targetX <= right;
  }
  const box = layout.fragmentLayouts.get(item.id);
  return box !== undefined && box.x >= left && box.x + box.width <= right;
};

/**
 * Calculates items to absorb or eject when a fragment boundary is dragged.
 * - Top handle: expands up to absorb preceding siblings, or shrinks down to eject items from first operand.
 * - Bottom handle: expands down to absorb following siblings, or shrinks up to eject items from last operand.
 */
export const calculateFragmentBoundaryChanges = (
  items: SequenceTimelineItem[],
  layout: SequenceLayout,
  fragmentId: string,
  targetY: number,
  targetHeight: number,
  handle: 'nw' | 'ne' | 'se' | 'sw' | 'e' | 's' | 'w' | 'n',
): FragmentBoundaryChanges | null => {
  const loc = findSequenceItemLocation(items, fragmentId);
  if (!loc || loc.item.kind !== 'fragment') return null;

  const fragment = loc.item;
  const fragmentBox = layout.fragmentLayouts.get(fragmentId);
  if (!fragmentBox) return null;
  const isTop = handle === 'n' || handle === 'nw' || handle === 'ne';
  const isBottom = handle === 's' || handle === 'se' || handle === 'sw';
  if (!isTop && !isBottom) return null;

  const targetBottom = targetY + targetHeight;

  const getItemCenterY = (item: SequenceTimelineItem): number | null => {
    if (item.kind === 'message') {
      const msgLayout = layout.messageLayouts.get(item.id);
      return msgLayout ? msgLayout.y : null;
    }
    const fragLayout = layout.fragmentLayouts.get(item.id);
    return fragLayout ? fragLayout.y + fragLayout.height / 2 : null;
  };

  const HYSTERESIS = 8;

  if (isTop) {
    const targetOperand = fragment.operands[0];
    if (!targetOperand) return null;

    const itemsToAbsorb: SequenceTimelineItem[] = [];
    // Preceding siblings in loc.parentList
    for (let i = loc.index - 1; i >= 0; i -= 1) {
      const sibling = loc.parentList[i];
      const y = getItemCenterY(sibling);
      if (y !== null && targetY <= y - HYSTERESIS && itemFitsFragmentHorizontalFrame(sibling, layout, fragmentBox)) {
        itemsToAbsorb.unshift(sibling);
      } else {
        break;
      }
    }

    const itemsToEject: SequenceTimelineItem[] = [];
    // Items from start of targetOperand.items
    for (let i = 0; i < targetOperand.items.length; i += 1) {
      const opItem = targetOperand.items[i];
      const y = getItemCenterY(opItem);
      if (y !== null && targetY >= y + HYSTERESIS) {
        itemsToEject.push(opItem);
      } else {
        break;
      }
    }

    if (itemsToAbsorb.length === 0 && itemsToEject.length === 0) return null;

    return {
      fragmentId,
      edge: 'top',
      targetOperandId: targetOperand.id,
      itemsToAbsorb,
      itemsToEject,
    };
  }

  if (isBottom) {
    const lastOpIdx = fragment.operands.length - 1;
    const targetOperand = fragment.operands[lastOpIdx];
    if (!targetOperand) return null;

    const itemsToAbsorb: SequenceTimelineItem[] = [];
    // Following siblings in loc.parentList
    for (let i = loc.index + 1; i < loc.parentList.length; i += 1) {
      const sibling = loc.parentList[i];
      const y = getItemCenterY(sibling);
      if (y !== null && targetBottom >= y + HYSTERESIS && itemFitsFragmentHorizontalFrame(sibling, layout, fragmentBox)) {
        itemsToAbsorb.push(sibling);
      } else {
        break;
      }
    }

    const itemsToEject: SequenceTimelineItem[] = [];
    // Items from end of targetOperand.items
    for (let i = targetOperand.items.length - 1; i >= 0; i -= 1) {
      const opItem = targetOperand.items[i];
      const y = getItemCenterY(opItem);
      if (y !== null && targetBottom <= y - HYSTERESIS) {
        itemsToEject.unshift(opItem);
      } else {
        break;
      }
    }

    if (itemsToAbsorb.length === 0 && itemsToEject.length === 0) return null;

    return {
      fragmentId,
      edge: 'bottom',
      targetOperandId: targetOperand.id,
      itemsToAbsorb,
      itemsToEject,
    };
  }

  return null;
};

/**
 * Applies boundary absorption and ejection mutations to the item tree.
 */
export const applyFragmentBoundaryChanges = (
  items: SequenceTimelineItem[],
  changes: FragmentBoundaryChanges,
): SequenceTimelineItem[] => {
  const loc = findSequenceItemLocation(items, changes.fragmentId);
  if (!loc || loc.item.kind !== 'fragment') return items;

  const fragment = loc.item;
  const absorbSet = new Set(changes.itemsToAbsorb.map((it) => it.id));
  const ejectSet = new Set(changes.itemsToEject.map((it) => it.id));

  const filterOut = (list: SequenceTimelineItem[], idsToRemove: Set<string>): SequenceTimelineItem[] =>
    list.filter((item) => !idsToRemove.has(item.id));

  const updatedOperands = fragment.operands.map((op) => {
    if (op.id !== changes.targetOperandId) return op;

    let opItems = filterOut(op.items, ejectSet);
    if (changes.itemsToAbsorb.length > 0) {
      if (changes.edge === 'top') {
        opItems = [...changes.itemsToAbsorb, ...opItems];
      } else {
        opItems = [...opItems, ...changes.itemsToAbsorb];
      }
    }
    return { ...op, items: opItems };
  });

  const updatedFragment: SequenceFragment = {
    ...fragment,
    operands: updatedOperands,
  };

  const updateContainerList = (list: SequenceTimelineItem[], containerId: string): SequenceTimelineItem[] => {
    if (containerId === loc.containerId) {
      const withoutAbsorbed = filterOut(list, absorbSet);
      const fragIdx = withoutAbsorbed.findIndex((it) => it.id === changes.fragmentId);
      if (fragIdx === -1) return list;

      const beforeFrag = withoutAbsorbed.slice(0, fragIdx);
      const afterFrag = withoutAbsorbed.slice(fragIdx + 1);

      if (changes.itemsToEject.length > 0) {
        if (changes.edge === 'top') {
          return [...beforeFrag, ...changes.itemsToEject, updatedFragment, ...afterFrag];
        }
        return [...beforeFrag, updatedFragment, ...changes.itemsToEject, ...afterFrag];
      }

      return [...beforeFrag, updatedFragment, ...afterFrag];
    }

    return list.map((it) => {
      if (it.kind !== 'fragment') return it;
      return {
        ...it,
        operands: it.operands.map((op) => ({
          ...op,
          items: updateContainerList(op.items, op.id),
        })),
      };
    });
  };

  return updateContainerList(items, 'root');
};

/**
 * Validates whether boundary changes introduce lifecycle or semantic errors.
 */
export const validateFragmentBoundaryChanges = (
  content: SequenceDiagramContent,
  changes: FragmentBoundaryChanges,
  options?: { existingArtifactIds?: Set<string> },
): { valid: boolean; reason?: string; newItems?: SequenceTimelineItem[] } => {
  const newItems = applyFragmentBoundaryChanges(content.items, changes);
  const candidateContent: SequenceDiagramContent = {
    ...content,
    items: newItems,
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
    return {
      valid: false,
      reason: newErrors[0].message,
      newItems,
    };
  }

  return {
    valid: true,
    newItems,
  };
};

export type UnwrapSequenceFragmentResult = {
  items: SequenceTimelineItem[];
  unwrappedItems: SequenceTimelineItem[];
};

/**
 * Removes a fragment container and inlines all its contained items into the
 * parent list (root or enclosing fragment operand) at the fragment's position.
 */
export const unwrapSequenceFragment = (
  items: SequenceTimelineItem[],
  fragmentId: string,
): UnwrapSequenceFragmentResult | null => {
  const loc = findSequenceItemLocation(items, fragmentId);
  if (!loc || loc.item.kind !== 'fragment') return null;

  const fragment = loc.item;
  const unwrappedItems = fragment.operands.flatMap((op) => op.items);

  const replaceInTree = (list: SequenceTimelineItem[]): SequenceTimelineItem[] =>
    list.flatMap((item) => {
      if (item.id === fragmentId) {
        return unwrappedItems;
      }
      if (item.kind === 'fragment') {
        return [{
          ...item,
          operands: item.operands.map((op) => ({
            ...op,
            items: replaceInTree(op.items),
          })),
        }];
      }
      return [item];
    });

  return {
    items: replaceInTree(items),
    unwrappedItems,
  };
};

export type FragmentMoveChanges = {
  fragmentId: string;
  itemsToAbsorb: SequenceTimelineItem[];
  itemsToEject: SequenceTimelineItem[];
  operandItems: { operandId: string; items: SequenceTimelineItem[] }[];
  itemsBefore: SequenceTimelineItem[];
  itemsAfter: SequenceTimelineItem[];
  hasHierarchyChanged: boolean;
};

/**
 * Calculates sliding window / scanner changes when dragging a fragment.
 * Items inside the window [targetY, targetY + targetHeight] are absorbed into
 * the appropriate operand compartment; items outside are released in chronological order.
 */
export const calculateFragmentMoveChanges = (
  items: SequenceTimelineItem[],
  layout: SequenceLayout,
  fragmentId: string,
  targetY: number,
  targetHeight: number,
  prevChanges?: FragmentMoveChanges | null,
): FragmentMoveChanges | null => {
  const loc = findSequenceItemLocation(items, fragmentId);
  if (!loc || loc.item.kind !== 'fragment') return null;

  const fragment = loc.item;
  const origBox = layout.fragmentLayouts.get(fragmentId);
  if (!origBox) return null;

  const getItemCenterY = (item: SequenceTimelineItem): number | null => {
    if (item.kind === 'message') {
      const msgLayout = layout.messageLayouts.get(item.id);
      return msgLayout ? msgLayout.y : null;
    }
    const fragLayout = layout.fragmentLayouts.get(item.id);
    return fragLayout ? fragLayout.y + fragLayout.height / 2 : null;
  };

  const HYSTERESIS = 8;
  const targetBottom = targetY + targetHeight;

  const origSiblingsBefore = loc.parentList.slice(0, loc.index);
  const origSiblingsAfter = loc.parentList.slice(loc.index + 1);
  const origBeforeIds = new Set(origSiblingsBefore.map((i) => i.id));
  const origAfterIds = new Set(origSiblingsAfter.map((i) => i.id));

  const origInsideItemMap = new Map<string, { operandId: string; operandIndex: number; item: SequenceTimelineItem }>();
  fragment.operands.forEach((op, opIdx) => {
    op.items.forEach((item) => {
      origInsideItemMap.set(item.id, { operandId: op.id, operandIndex: opIdx, item });
    });
  });

  const prevBeforeIds = prevChanges ? new Set(prevChanges.itemsBefore.map((i) => i.id)) : origBeforeIds;
  const prevAfterIds = prevChanges ? new Set(prevChanges.itemsAfter.map((i) => i.id)) : origAfterIds;
  const prevInsideItemMap = prevChanges
    ? (() => {
        const map = new Map<string, { operandId: string; operandIndex: number; item: SequenceTimelineItem }>();
        prevChanges.operandItems.forEach((op, opIdx) => {
          op.items.forEach((item) => {
            map.set(item.id, { operandId: op.operandId, operandIndex: opIdx, item });
          });
        });
        return map;
      })()
    : origInsideItemMap;

  const allCandidateItems: SequenceTimelineItem[] = [
    ...origSiblingsBefore,
    ...fragment.operands.flatMap((op) => op.items),
    ...origSiblingsAfter,
  ];

  const origItemOrder = new Map<string, number>();
  allCandidateItems.forEach((it, idx) => origItemOrder.set(it.id, idx));

  allCandidateItems.sort((a, b) => {
    const yA = getItemCenterY(a);
    const yB = getItemCenterY(b);
    if (yA !== null && yB !== null && yA !== yB) {
      return yA - yB;
    }
    return (origItemOrder.get(a.id) ?? 0) - (origItemOrder.get(b.id) ?? 0);
  });

  const numOperands = fragment.operands.length;
  const dividers: number[] = [];
  if (numOperands > 1) {
    for (let k = 1; k < numOperands; k += 1) {
      const origOp = origBox.operands[k];
      if (origOp && origBox.height > 0) {
        const ratio = (origOp.top - origBox.y) / origBox.height;
        dividers.push(targetY + ratio * targetHeight);
      } else {
        dividers.push(targetY + (k * targetHeight) / numOperands);
      }
    }
  }

  const itemsBefore: SequenceTimelineItem[] = [];
  const itemsAfter: SequenceTimelineItem[] = [];
  const operandBuckets: SequenceTimelineItem[][] = fragment.operands.map(() => []);

  for (const item of allCandidateItems) {
    const y = getItemCenterY(item);
    if (y === null) {
      if (origBeforeIds.has(item.id)) itemsBefore.push(item);
      else if (origAfterIds.has(item.id)) itemsAfter.push(item);
      else {
        const info = origInsideItemMap.get(item.id);
        if (info) operandBuckets[info.operandIndex].push(item);
        else itemsAfter.push(item);
      }
      continue;
    }

    const isCurrentlyBefore = prevBeforeIds.has(item.id);
    const isCurrentlyAfter = prevAfterIds.has(item.id);
    const isCurrentlyInside = prevInsideItemMap.has(item.id);

    if (!origInsideItemMap.has(item.id) && !itemFitsFragmentHorizontalFrame(item, layout, origBox)) {
      if (origBeforeIds.has(item.id)) itemsBefore.push(item);
      else itemsAfter.push(item);
      continue;
    }

    let isAbove = false;
    let isBelow = false;

    if (isCurrentlyBefore) {
      if (targetY > y - HYSTERESIS) {
        isAbove = true;
      }
    } else if (isCurrentlyInside || isCurrentlyAfter) {
      if (targetY >= y + HYSTERESIS) {
        isAbove = true;
      }
    }

    if (!isAbove) {
      if (isCurrentlyAfter) {
        if (targetBottom < y + HYSTERESIS) {
          isBelow = true;
        }
      } else if (isCurrentlyInside || isCurrentlyBefore) {
        if (targetBottom <= y - HYSTERESIS) {
          isBelow = true;
        }
      }
    }

    if (isAbove) {
      itemsBefore.push(item);
    } else if (isBelow) {
      itemsAfter.push(item);
    } else {
      if (numOperands <= 1) {
        operandBuckets[0].push(item);
      } else {
        const insideInfo = prevInsideItemMap.get(item.id);
        let assignedOpIndex = -1;

        if (insideInfo) {
          const prevIdx = insideInfo.operandIndex;
          let staysInPrev = true;
          if (prevIdx > 0) {
            const topDiv = dividers[prevIdx - 1];
            if (y <= topDiv - HYSTERESIS) {
              staysInPrev = false;
            }
          }
          if (prevIdx < numOperands - 1) {
            const bottomDiv = dividers[prevIdx];
            if (y >= bottomDiv + HYSTERESIS) {
              staysInPrev = false;
            }
          }
          if (staysInPrev) {
            assignedOpIndex = prevIdx;
          }
        }

        if (assignedOpIndex === -1) {
          assignedOpIndex = 0;
          for (let k = 0; k < dividers.length; k += 1) {
            if (y >= dividers[k]) {
              assignedOpIndex = k + 1;
            }
          }
        }

        operandBuckets[assignedOpIndex].push(item);
      }
    }
  }

  const currentInsideIds = new Set<string>();
  operandBuckets.forEach((bucket) => {
    bucket.forEach((item) => currentInsideIds.add(item.id));
  });

  const itemsToAbsorb: SequenceTimelineItem[] = [];
  allCandidateItems.forEach((item) => {
    if (currentInsideIds.has(item.id) && !origInsideItemMap.has(item.id)) {
      itemsToAbsorb.push(item);
    }
  });

  const itemsToEject: SequenceTimelineItem[] = [];
  allCandidateItems.forEach((item) => {
    if (origInsideItemMap.has(item.id) && !currentInsideIds.has(item.id)) {
      itemsToEject.push(item);
    }
  });

  let hasHierarchyChanged = itemsToAbsorb.length > 0 || itemsToEject.length > 0;
  if (!hasHierarchyChanged) {
    for (let k = 0; k < numOperands; k += 1) {
      const origOp = fragment.operands[k];
      const newBucket = operandBuckets[k];
      if (origOp.items.length !== newBucket.length) {
        hasHierarchyChanged = true;
        break;
      }
      for (let i = 0; i < origOp.items.length; i += 1) {
        if (origOp.items[i].id !== newBucket[i].id) {
          hasHierarchyChanged = true;
          break;
        }
      }
      if (hasHierarchyChanged) break;
    }
  }

  if (!hasHierarchyChanged) {
    if (itemsBefore.length !== origSiblingsBefore.length) {
      hasHierarchyChanged = true;
    } else {
      for (let i = 0; i < itemsBefore.length; i += 1) {
        if (itemsBefore[i].id !== origSiblingsBefore[i].id) {
          hasHierarchyChanged = true;
          break;
        }
      }
    }
  }

  return {
    fragmentId,
    itemsToAbsorb,
    itemsToEject,
    operandItems: fragment.operands.map((op, idx) => ({
      operandId: op.id,
      items: operandBuckets[idx],
    })),
    itemsBefore,
    itemsAfter,
    hasHierarchyChanged,
  };
};

/**
 * Applies sliding window fragment move changes to the item tree.
 */
export const applyFragmentMoveChanges = (
  items: SequenceTimelineItem[],
  changes: FragmentMoveChanges,
): SequenceTimelineItem[] => {
  const loc = findSequenceItemLocation(items, changes.fragmentId);
  if (!loc || loc.item.kind !== 'fragment') return items;

  const fragment = loc.item;

  const updatedOperands = fragment.operands.map((op) => {
    const matching = changes.operandItems.find((oi) => oi.operandId === op.id);
    return matching ? { ...op, items: matching.items } : op;
  });

  const updatedFragment: SequenceFragment = {
    ...fragment,
    operands: updatedOperands,
  };

  const updateContainerList = (list: SequenceTimelineItem[], containerId: string): SequenceTimelineItem[] => {
    if (containerId === loc.containerId) {
      return [...changes.itemsBefore, updatedFragment, ...changes.itemsAfter];
    }

    return list.map((it) => {
      if (it.kind !== 'fragment') return it;
      return {
        ...it,
        operands: it.operands.map((op) => ({
          ...op,
          items: updateContainerList(op.items, op.id),
        })),
      };
    });
  };

  return updateContainerList(items, 'root');
};

/**
 * Validates whether fragment move changes introduce lifecycle or semantic errors.
 */
export const validateFragmentMoveChanges = (
  content: SequenceDiagramContent,
  changes: FragmentMoveChanges,
  options?: { existingArtifactIds?: Set<string> },
): { valid: boolean; reason?: string; newItems?: SequenceTimelineItem[] } => {
  const newItems = applyFragmentMoveChanges(content.items, changes);
  const candidateContent: SequenceDiagramContent = {
    ...content,
    items: newItems,
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
    return {
      valid: false,
      reason: newErrors[0].message,
      newItems,
    };
  }

  return {
    valid: true,
    newItems,
  };
};
