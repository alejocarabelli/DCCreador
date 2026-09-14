export const reorderItemsByIds = <T extends { id: string }>(items: T[], orderedIds: string[]): T[] => {
  if (orderedIds.length !== items.length || new Set(orderedIds).size !== orderedIds.length) {
    return items;
  }

  const itemsById = new Map(items.map((item) => [item.id, item]));

  if (orderedIds.some((id) => !itemsById.has(id))) {
    return items;
  }

  if (orderedIds.every((id, index) => id === items[index]?.id)) {
    return items;
  }

  return orderedIds.map((id) => itemsById.get(id) as T);
};
