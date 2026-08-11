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

  const classes: ProjectSymbolClass[] = [];

  artifact.content.nodes.forEach((node) => {
    const name = clean(node.data.name);

    if (name.length === 0) {
      return;
    }

    classes.push({
      name,
      attributes: node.data.attributes
        .map((attribute) => ({ name: clean(attribute.name), type: clean(attribute.type) }))
        .filter((attribute) => attribute.name.length > 0),
      methods: node.data.methods
        .map((method) => ({ name: clean(method.name), returnType: clean(method.returnType) || undefined }))
        .filter((method) => method.name.length > 0),
      parametricValues: (node.data.parametricValues ?? [])
        .map((value) => clean(value.value))
        .filter((value) => value.length > 0),
      relatedClasses: Array.from(relatedByClassName.get(name) ?? []),
    });
  });

  return { classes };
};
