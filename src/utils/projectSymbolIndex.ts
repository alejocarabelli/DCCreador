import type { ClassDiagramArtifact, ClassDiagramNode } from '../types/diagram';

export type ProjectSymbolClass = {
  name: string;
  attributes: { name: string; type: string }[];
  methods: { name: string; returnType?: string }[];
  parametricValues: string[];
  relatedClasses: string[];
};

export type ProjectSymbolIndex = {
  classes: ProjectSymbolClass[];
};

const clean = (value: string | undefined): string => value?.trim() ?? '';

const getNodeName = (node: ClassDiagramNode | undefined): string => clean(node?.data.name);

export const buildProjectSymbolIndex = (artifact: ClassDiagramArtifact | undefined): ProjectSymbolIndex => {
  if (artifact === undefined) {
    return { classes: [] };
  }

  const nodeById = new Map(artifact.content.nodes.map((node) => [node.id, node]));
  const relatedByClassName = new Map<string, Set<string>>();

  artifact.content.nodes.forEach((node) => {
    const name = getNodeName(node);
    if (name.length > 0) {
      relatedByClassName.set(name, new Set());
    }
  });

  artifact.content.edges.forEach((edge) => {
    const sourceName = getNodeName(nodeById.get(edge.source));
    const targetName = getNodeName(nodeById.get(edge.target));

    if (sourceName.length === 0 || targetName.length === 0 || sourceName === targetName) {
      return;
    }

    relatedByClassName.get(sourceName)?.add(targetName);
    relatedByClassName.get(targetName)?.add(sourceName);
  });

  // A subclass has its parents' attributes and methods too: a flow that names them is right.
  const parentIds = new Map<string, string[]>();
  artifact.content.edges.forEach((edge) => {
    if (edge.data?.relationType !== 'generalization') return;
    const parent = edge.data.triangleEnd === 'source' ? edge.source : edge.target;
    const child = parent === edge.source ? edge.target : edge.source;
    parentIds.set(child, [...(parentIds.get(child) ?? []), parent]);
  });
  const lineage = (nodeId: string): ClassDiagramNode[] => {
    const seen = new Set<string>();
    const result: ClassDiagramNode[] = [];
    const visit = (id: string): void => {
      if (seen.has(id)) return; // an inheritance cycle stops here
      seen.add(id);
      const node = nodeById.get(id);
      if (node === undefined) return;
      result.push(node);
      (parentIds.get(id) ?? []).forEach(visit);
    };
    visit(nodeId);
    return result;
  };
  const uniqueByName = <Item extends { name: string }>(items: Item[]): Item[] => {
    const names = new Set<string>();
    return items.filter((item) => {
      if (item.name.length === 0 || names.has(item.name)) return false;
      names.add(item.name);
      return true;
    });
  };

  const classes: ProjectSymbolClass[] = [];

  artifact.content.nodes.forEach((node) => {
    const name = clean(node.data.name);

    if (name.length === 0) {
      return;
    }

    const family = lineage(node.id);
    classes.push({
      name,
      attributes: uniqueByName(family.flatMap((member) => member.data.attributes
        .map((attribute) => ({ name: clean(attribute.name), type: clean(attribute.type) })))),
      methods: uniqueByName(family.flatMap((member) => member.data.methods
        .map((method) => ({ name: clean(method.name), returnType: clean(method.returnType) || undefined })))),
      parametricValues: (node.data.parametricValues ?? [])
        .map((value) => clean(value.value))
        .filter((value) => value.length > 0),
      relatedClasses: Array.from(relatedByClassName.get(name) ?? []),
    });
  });

  return { classes };
};
