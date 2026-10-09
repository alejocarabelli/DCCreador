import type { UseCaseModelContent } from '../types/diagram';

export type UseCaseSelection = {
  nodeIds: readonly string[];
  edgeIds: readonly string[];
};

/**
 * Removes every selected node and relation, plus each relation that touches a
 * removed node, in one step.
 */
export const deleteUseCaseSelection = (content: UseCaseModelContent, selection: UseCaseSelection): UseCaseModelContent => {
  const removedNodeIds = new Set(selection.nodeIds);
  const removedEdgeIds = new Set(selection.edgeIds);

  return {
    nodes: content.nodes.filter((node) => !removedNodeIds.has(node.id)),
    edges: content.edges.filter(
      (edge) => !removedEdgeIds.has(edge.id) && !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target),
    ),
  };
};
