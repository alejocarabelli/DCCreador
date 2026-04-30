import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  getNodesBounds,
  getViewportForBounds,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type Node,
  type ReactFlowInstance,
  type XYPosition,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Crosshair,
  FileDown,
  FileUp,
  Grid3X3,
  ImageDown,
  Magnet,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  Undo2,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import type {
  AssociationEdgeData,
  AssociationConnectionSide,
  ClassAttribute,
  ClassDiagramEdge,
  ClassDiagramNode,
  DiagramContent,
  DiagramProject,
  ParametricValue,
  ParametricValuesNoteHandle,
} from '../types/diagram';
import { themes, type DiagramTheme, type DiagramThemeId } from '../theme/themes';
import { createId } from '../utils/id';
import { getAssociationMarker, normalizeAssociationData, normalizeAssociationEdge } from '../utils/association';
import { normalizeClassNode, normalizeDiagramContent, normalizeDiagramProject } from '../utils/diagramNormalization';
import { AssociationEdge } from './AssociationEdge';
import { AssociationInspector } from './AssociationInspector';
import { ClassInspector } from './ClassInspector';
import { ClassNode } from './ClassNode';
import { ParametricValuesNote } from './ParametricValuesNote';

type DiagramEditorProps = {
  canRedo: boolean;
  canUndo: boolean;
  project: DiagramProject;
  theme: DiagramTheme;
  themeId: DiagramThemeId;
  onChangeContent: (content: DiagramContent) => void;
  onImportProject: (project: DiagramProject) => void;
  onRedo: () => void;
  onThemeChange: (themeId: DiagramThemeId) => void;
  onUndo: () => void;
};

type ContextMenuState = {
  nodeId?: string;
  noteEdgeNodeId?: string;
  screenPosition: XYPosition;
  flowPosition: XYPosition;
};

const nodeTypes = {
  classNode: ClassNode,
  parametricValuesNote: ParametricValuesNote,
};

const edgeTypes = {
  association: AssociationEdge,
};

const INSPECTOR_COLLAPSED_KEY = 'class-diagram-inspector-collapsed';
const GRID_ENABLED_KEY = 'class-diagram-grid-enabled';
const SNAP_ENABLED_KEY = 'class-diagram-snap-enabled';
const NOTE_NODE_OFFSET = { x: 24, y: 116 };
const NOTE_EDGE_SUFFIX = '__values-edge';
const NOTE_NODE_SUFFIX = '__values-note';
const NOTE_HANDLE_OPTIONS: Array<{ label: string; value: ParametricValuesNoteHandle }> = [
  { label: '↑', value: 'top' },
  { label: '→', value: 'right' },
  { label: '↓', value: 'bottom' },
  { label: '←', value: 'left' },
];
const OPPOSITE_NOTE_HANDLE: Record<ParametricValuesNoteHandle, ParametricValuesNoteHandle> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
};
const PNG_WIDTH = 1600;
const PNG_HEIGHT = 1000;
const ASSOCIATION_CONNECTION_SIDES = ['top', 'right', 'bottom', 'left'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isImportableProject = (value: unknown): value is DiagramProject => {
  if (!isRecord(value) || typeof value.name !== 'string' || !isRecord(value.content)) {
    return false;
  }

  return Array.isArray(value.content.nodes) && Array.isArray(value.content.edges);
};

const downloadTextFile = (filename: string, text: string, type: string): void => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const getDefaultNotePosition = (node: ClassDiagramNode): XYPosition => ({
  x: node.position.x + NOTE_NODE_OFFSET.x,
  y: node.position.y + NOTE_NODE_OFFSET.y,
});

const getClassNodeIdFromNoteId = (nodeId: string): string | null =>
  nodeId.endsWith(NOTE_NODE_SUFFIX) ? nodeId.slice(0, -NOTE_NODE_SUFFIX.length) : null;

const getChangedNodeId = (change: NodeChange): string | null =>
  'id' in change && typeof change.id === 'string' ? change.id : null;

const getEffectiveBackgroundColor = (element: HTMLElement): string => {
  let currentElement: HTMLElement | null = element;

  while (currentElement !== null) {
    const backgroundColor = getComputedStyle(currentElement).backgroundColor;

    if (backgroundColor !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'transparent') {
      return backgroundColor;
    }

    currentElement = currentElement.parentElement;
  }

  return '#f5f7f8';
};

const getAssociationConnectionSide = (handleId: string | null | undefined): AssociationConnectionSide =>
  ASSOCIATION_CONNECTION_SIDES.some((side) => side === handleId) ? (handleId as AssociationConnectionSide) : 'automatic';

const isEditableElement = (element: Element | null): boolean => {
  if (element === null) {
    return false;
  }

  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLButtonElement ||
    element.closest('[contenteditable="true"], input, select, textarea, button') !== null
  );
};

export function DiagramEditor({
  canRedo,
  canUndo,
  project,
  theme,
  themeId,
  onChangeContent,
  onImportProject,
  onRedo,
  onThemeChange,
  onUndo,
}: DiagramEditorProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(
    () => localStorage.getItem(INSPECTOR_COLLAPSED_KEY) === 'true',
  );
  const [isGridEnabled, setIsGridEnabled] = useState(() => localStorage.getItem(GRID_ENABLED_KEY) !== 'false');
  const [isSnapEnabled, setIsSnapEnabled] = useState(() => localStorage.getItem(SNAP_ENABLED_KEY) === 'true');
  const [nameEditingNodeId, setNameEditingNodeId] = useState<string | null>(null);
  const [valueEditingRequest, setValueEditingRequest] = useState<{ nodeId: string; valueId: string } | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);
  const normalizedContent = useMemo(() => normalizeDiagramContent(project.content), [project.content]);
  const { nodes, edges } = normalizedContent;

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const normalizedEdges = useMemo(
    () => edges.map((edge) => normalizeAssociationEdge(edge)),
    [edges],
  );

  const selectedEdge = useMemo(
    () => normalizedEdges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [normalizedEdges, selectedEdgeId],
  );
  const hasInspectorSelection = selectedNode !== null || selectedEdge !== null;

  const updateNodes = useCallback(
    (nextNodes: ClassDiagramNode[]): void => {
      onChangeContent({ nodes: nextNodes.map(normalizeClassNode), edges });
    },
    [edges, onChangeContent],
  );

  const updateEdges = useCallback(
    (nextEdges: ClassDiagramEdge[]): void => {
      onChangeContent({ nodes, edges: nextEdges.map(normalizeAssociationEdge) });
    },
    [nodes, onChangeContent],
  );

  const deleteSelectedElement = useCallback((): void => {
    if (selectedEdgeId !== null) {
      updateEdges(normalizedEdges.filter((edge) => edge.id !== selectedEdgeId));
      setSelectedEdgeId(null);
      setContextMenu(null);
      return;
    }

    if (selectedNodeId !== null) {
      const selectedClassNode = nodes.find((node) => node.id === selectedNodeId);

      if (selectedClassNode === undefined) {
        return;
      }

      onChangeContent({
        nodes: nodes.filter((node) => node.id !== selectedNodeId).map(normalizeClassNode),
        edges: normalizedEdges
          .filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId)
          .map(normalizeAssociationEdge),
      });
      setSelectedNodeId(null);
      setContextMenu(null);
    }
  }, [nodes, normalizedEdges, onChangeContent, selectedEdgeId, selectedNodeId, updateEdges]);

  const showFeedback = useCallback((message: string): void => {
    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current);
    }

    setFeedbackMessage(message);
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setFeedbackMessage(null);
      feedbackTimeoutRef.current = null;
    }, 1800);
  }, []);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]): void => {
      const classChanges = changes.filter((change) => {
        const changedNodeId = getChangedNodeId(change);
        return changedNodeId === null || getClassNodeIdFromNoteId(changedNodeId) === null;
      });
      const notePositionChanges = changes.filter(
        (change) => {
          const changedNodeId = getChangedNodeId(change);
          return (
            changedNodeId !== null &&
            getClassNodeIdFromNoteId(changedNodeId) !== null &&
            'position' in change &&
            change.position !== undefined
          );
        },
      );
      let nextNodes = applyNodeChanges(classChanges, nodes) as ClassDiagramNode[];

      if (notePositionChanges.length > 0) {
        nextNodes = nextNodes.map((node) => {
          const noteChange = notePositionChanges.find((change) => {
            const changedNodeId = getChangedNodeId(change);
            return changedNodeId !== null && getClassNodeIdFromNoteId(changedNodeId) === node.id;
          });

          if (noteChange === undefined || !('position' in noteChange) || noteChange.position === undefined) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              parametricValuesNotePosition: noteChange.position,
            },
          };
        });
      }

      updateNodes(nextNodes);
    },
    [nodes, updateNodes],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]): void => {
      updateEdges(applyEdgeChanges(changes, normalizedEdges) as ClassDiagramEdge[]);
    },
    [normalizedEdges, updateEdges],
  );

  const handleConnect = useCallback(
    (connection: Connection): void => {
      const navigability = 'none';
      const sourceSide = getAssociationConnectionSide(connection.sourceHandle);
      const targetSide = getAssociationConnectionSide(connection.targetHandle);
      updateEdges(
        addEdge(
          {
            ...connection,
            id: createId(),
            type: 'association',
            data: normalizeAssociationData({ navigability, sourceSide, targetSide }),
            markerStart: getAssociationMarker(navigability, 'source', 'association'),
            markerEnd: getAssociationMarker(navigability, 'target', 'association'),
          },
          normalizedEdges,
        ) as ClassDiagramEdge[],
      );
    },
    [normalizedEdges, updateEdges],
  );

  const addClassNode = (position?: XYPosition): void => {
    const newNode: ClassDiagramNode = {
      id: createId(),
      type: 'classNode',
      position: position ?? { x: 120 + nodes.length * 28, y: 120 + nodes.length * 28 },
      data: {
        name: '',
        attributes: [],
        hasParametricValuesNote: false,
        parametricValuesNotePosition: undefined,
        parametricValues: [],
      },
    };

    updateNodes([...nodes, newNode]);
    setSelectedNodeId(newNode.id);
    setNameEditingNodeId(newNode.id);
  };

  const renameClassById = useCallback((nodeId: string, name: string): void => {
    updateNodes(nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, name } } : node)));
  }, [nodes, updateNodes]);

  const renameClassAndCreateAttributeByNodeId = useCallback(
    (nodeId: string, name: string, attribute: ClassAttribute): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  name,
                  attributes: [...node.data.attributes, attribute],
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const renameClass = (name: string): void => {
    if (selectedNode !== null) {
      renameClassById(selectedNode.id, name);
    }
  };

  const addAttribute = (): void => {
    if (selectedNode === null) {
      return;
    }

    const attribute: ClassAttribute = {
      id: createId(),
      name: 'nuevoAtributo',
      type: 'string',
    };

    updateNodes(
      nodes.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, attributes: [...node.data.attributes, attribute] } }
          : node,
      ),
    );
  };

  const updateAttributeByNodeId = useCallback(
    (nodeId: string, attributeId: string, field: keyof Omit<ClassAttribute, 'id'>, value: string): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  attributes: node.data.attributes.map((attribute) =>
                    attribute.id === attributeId ? { ...attribute, [field]: value } : attribute,
                  ),
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const createAttributeByNodeId = useCallback(
    (nodeId: string, attribute: ClassAttribute): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, attributes: [...node.data.attributes, attribute] } }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const deleteAttributeByNodeId = useCallback(
    (nodeId: string, attributeId: string): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  attributes: node.data.attributes.filter((attribute) => attribute.id !== attributeId),
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const updateAttributeFieldsByNodeId = useCallback(
    (nodeId: string, attributeId: string, values: Pick<ClassAttribute, 'name' | 'type'>): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  attributes: node.data.attributes.map((attribute) =>
                    attribute.id === attributeId ? { ...attribute, ...values } : attribute,
                  ),
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const updateAttributeFieldsAndCreateAttributeByNodeId = useCallback(
    (
      nodeId: string,
      attributeId: string,
      values: Pick<ClassAttribute, 'name' | 'type'>,
      nextAttribute: ClassAttribute,
    ): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  attributes: [
                    ...node.data.attributes.map((attribute) =>
                      attribute.id === attributeId ? { ...attribute, ...values } : attribute,
                    ),
                    nextAttribute,
                  ],
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const updateAttribute = (
    attributeId: string,
    field: keyof Omit<ClassAttribute, 'id'>,
    value: string,
  ): void => {
    if (selectedNode !== null) {
      updateAttributeByNodeId(selectedNode.id, attributeId, field, value);
    }
  };

  const deleteAttribute = (attributeId: string): void => {
    if (selectedNode === null) {
      return;
    }

    updateNodes(
      nodes.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                attributes: node.data.attributes.filter((attribute) => attribute.id !== attributeId),
              },
            }
          : node,
      ),
    );
  };

  const setParametricValuesNoteByNodeId = useCallback(
    (nodeId: string, enabled: boolean): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  hasParametricValuesNote: enabled,
                  parametricValuesNotePosition: enabled
                    ? node.data.parametricValuesNotePosition ?? getDefaultNotePosition(node)
                    : undefined,
                  parametricValues: enabled ? node.data.parametricValues ?? [] : [],
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const addParametricValuesNoteAndStartEditing = (nodeId: string): void => {
    const firstValue = { id: createId(), value: '' };

    updateNodes(
      nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                hasParametricValuesNote: true,
                parametricValuesNoteHandle: node.data.parametricValuesNoteHandle ?? 'bottom',
                parametricValuesNotePosition: node.data.parametricValuesNotePosition ?? getDefaultNotePosition(node),
                parametricValues: [
                  ...(node.data.parametricValues ?? []).filter((value) => value.value.trim().length > 0),
                  firstValue,
                ],
              },
            }
          : node,
      ),
    );
    setValueEditingRequest({ nodeId, valueId: firstValue.id });
  };

  const updateParametricValuesByNodeId = useCallback(
    (nodeId: string, values: ParametricValue[]): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  hasParametricValuesNote: true,
                  parametricValues: values,
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const updateParametricValuesNoteConnectionHandles = (
    nodeId: string,
    handle: ParametricValuesNoteHandle,
    changedEnd: 'class' | 'note',
  ): void => {
    updateNodes(
      nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                parametricValuesNoteHandle: changedEnd === 'class' ? handle : OPPOSITE_NOTE_HANDLE[handle],
                parametricValuesNoteTargetHandle: changedEnd === 'note' ? handle : OPPOSITE_NOTE_HANDLE[handle],
              },
            }
          : node,
      ),
    );
  };

  const duplicateClassNode = (nodeId: string): void => {
    const node = nodes.find((currentNode) => currentNode.id === nodeId);

    if (node === undefined) {
      return;
    }

    const duplicatedNode: ClassDiagramNode = {
      ...node,
      id: createId(),
      selected: false,
      position: { x: node.position.x + 36, y: node.position.y + 36 },
      data: {
        ...node.data,
        name: `${node.data.name || 'Clase sin nombre'} Copia`,
        attributes: node.data.attributes.map((attribute) => ({ ...attribute, id: createId() })),
        parametricValuesNotePosition: node.data.hasParametricValuesNote
          ? {
              x: (node.data.parametricValuesNotePosition ?? getDefaultNotePosition(node)).x + 36,
              y: (node.data.parametricValuesNotePosition ?? getDefaultNotePosition(node)).y + 36,
            }
          : undefined,
        parametricValues: (node.data.parametricValues ?? []).map((value) => ({ ...value, id: createId() })),
      },
    };

    updateNodes([...nodes, duplicatedNode]);
    setSelectedNodeId(duplicatedNode.id);
    setSelectedEdgeId(null);
  };

  const updateAssociation = (edgeId: string, values: Partial<AssociationEdgeData>): void => {
    updateEdges(
      normalizedEdges.map((edge) => {
        if (edge.id !== edgeId) {
          return edge;
        }

        const data = normalizeAssociationData({ ...edge.data, ...values });

        return {
          ...edge,
          sourceHandle: data.sourceSide === 'automatic' ? edge.sourceHandle : data.sourceSide,
          targetHandle: data.targetSide === 'automatic' ? edge.targetHandle : data.targetSide,
          data,
          markerStart: getAssociationMarker(data.navigability, 'source', data.relationType),
          markerEnd: getAssociationMarker(data.navigability, 'target', data.relationType),
        };
      }),
    );
  };

  const updateAssociationMultiplicity = useCallback(
    (edgeId: string, end: 'source' | 'target', value: string): void => {
      updateAssociation(edgeId, end === 'source' ? { sourceMultiplicity: value } : { targetMultiplicity: value });
    },
    [normalizedEdges, updateEdges],
  );

  const renderedNodes = useMemo<Node[]>(
    () => {
      const classNodes = nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          shouldStartNameEditing: node.id === nameEditingNodeId,
          onCreateAttribute: createAttributeByNodeId,
          onDeleteAttribute: deleteAttributeByNodeId,
          onNameEditingStarted: (nodeId: string) => {
            if (nodeId === nameEditingNodeId) {
              setNameEditingNodeId(null);
            }
          },
          onOpenContextMenu: handleClassContextMenu,
          onRenameClass: renameClassById,
          onRenameClassAndCreateAttribute: renameClassAndCreateAttributeByNodeId,
          onSetParametricValuesNote: setParametricValuesNoteByNodeId,
          onUpdateAttribute: updateAttributeByNodeId,
          onUpdateAttributeFields: updateAttributeFieldsByNodeId,
          onUpdateAttributeFieldsAndCreateAttribute: updateAttributeFieldsAndCreateAttributeByNodeId,
          onUpdateParametricValues: updateParametricValuesByNodeId,
        },
      }));

      const noteNodes = nodes
        .filter((node) => node.data.hasParametricValuesNote)
        .map((node) => ({
          id: `${node.id}${NOTE_NODE_SUFFIX}`,
          type: 'parametricValuesNote',
          position: {
            x: (node.data.parametricValuesNotePosition ?? getDefaultNotePosition(node)).x,
            y: (node.data.parametricValuesNotePosition ?? getDefaultNotePosition(node)).y,
          },
          data: {
            classNodeId: node.id,
            startEditingValueId: node.id === valueEditingRequest?.nodeId ? valueEditingRequest.valueId : undefined,
            values: node.data.parametricValues ?? [],
            onValueEditingStarted: (nodeId: string) => {
              if (nodeId === valueEditingRequest?.nodeId) {
                setValueEditingRequest(null);
              }
            },
            onUpdateValues: updateParametricValuesByNodeId,
          },
          draggable: true,
          selectable: false,
          connectable: false,
          width: 180,
          height: 90,
        }));

      return [...classNodes, ...noteNodes];
    },
    [
      nodes,
      createAttributeByNodeId,
      deleteAttributeByNodeId,
      nameEditingNodeId,
      renameClassById,
      renameClassAndCreateAttributeByNodeId,
      setParametricValuesNoteByNodeId,
      updateAttributeByNodeId,
      updateAttributeFieldsByNodeId,
      updateAttributeFieldsAndCreateAttributeByNodeId,
      updateParametricValuesByNodeId,
      valueEditingRequest,
    ],
  );

  const renderedEdges = useMemo<Edge[]>(
    () => {
      const associationEdges = normalizedEdges.map((edge) => ({
        ...edge,
        data: {
          ...edge.data,
          onUpdateMultiplicity: updateAssociationMultiplicity,
        },
      }));

      const noteEdges = nodes
        .filter((node) => node.data.hasParametricValuesNote)
        .map((node) => ({
          id: `${node.id}${NOTE_EDGE_SUFFIX}`,
          source: node.id,
          sourceHandle: node.data.parametricValuesNoteHandle ?? 'bottom',
          target: `${node.id}${NOTE_NODE_SUFFIX}`,
          targetHandle: node.data.parametricValuesNoteTargetHandle ?? 'top',
          selectable: true,
          focusable: false,
          style: {
            stroke: 'var(--note-connection-line)',
            strokeDasharray: 'var(--note-connection-dash)',
            strokeWidth: 1.2,
          },
          interactionWidth: 8,
          type: 'straight',
        }));

      return [...associationEdges, ...noteEdges];
    },
    [nodes, normalizedEdges, updateAssociationMultiplicity],
  );

  useEffect(() => {
    localStorage.setItem(INSPECTOR_COLLAPSED_KEY, String(isInspectorCollapsed));
  }, [isInspectorCollapsed]);

  useEffect(() => {
    localStorage.setItem(GRID_ENABLED_KEY, String(isGridEnabled));
  }, [isGridEnabled]);

  useEffect(() => {
    localStorage.setItem(SNAP_ENABLED_KEY, String(isSnapEnabled));
  }, [isSnapEnabled]);

  useEffect(
    () => () => {
      if (feedbackTimeoutRef.current !== null) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const handleDeleteKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }

      if (isEditableElement(document.activeElement)) {
        return;
      }

      if (selectedNodeId === null && selectedEdgeId === null) {
        return;
      }

      event.preventDefault();
      deleteSelectedElement();
    };

    document.addEventListener('keydown', handleDeleteKey);

    return () => {
      document.removeEventListener('keydown', handleDeleteKey);
    };
  }, [deleteSelectedElement, selectedEdgeId, selectedNodeId]);

  const centerDiagram = (): void => {
    if (reactFlowInstance === null || renderedNodes.length === 0) {
      return;
    }

    const bounds = getNodesBounds(renderedNodes);
    reactFlowInstance.setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, {
      duration: 300,
      zoom: reactFlowInstance.getZoom(),
    });
  };

  const fitDiagram = (): void => {
    if (reactFlowInstance === null || canvasRef.current === null || renderedNodes.length === 0) {
      return;
    }

    const bounds = getNodesBounds(renderedNodes);
    const { width, height } = canvasRef.current.getBoundingClientRect();
    const viewport = getViewportForBounds(bounds, width, height, 0.2, 1.5, 0.18);
    reactFlowInstance.setViewport(viewport, { duration: 300 });
  };

  const exportProjectJson = (): void => {
    const exportProject = normalizeDiagramProject({ ...project, content: normalizedContent });
    downloadTextFile(
      `${project.name.trim() || 'diagrama'}.json`,
      JSON.stringify(exportProject, null, 2),
      'application/json',
    );
    showFeedback('JSON exportado');
  };

  const importProjectJson = async (file: File): Promise<void> => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;

      if (!isImportableProject(parsed)) {
        window.alert('El archivo no tiene la estructura de un proyecto de diagrama.');
        return;
      }

      onImportProject(normalizeDiagramProject(parsed));
      showFeedback('JSON importado');
    } catch {
      window.alert('No se pudo importar el JSON.');
    } finally {
      if (fileInputRef.current !== null) {
        fileInputRef.current.value = '';
      }
    }
  };

  const exportPng = async (): Promise<void> => {
    if (canvasRef.current === null || renderedNodes.length === 0) {
      showFeedback('No hay diagrama para exportar');
      return;
    }

    const viewport = canvasRef.current.querySelector<HTMLElement>('.react-flow__viewport');
    const flowRoot = canvasRef.current.querySelector<HTMLElement>('.react-flow');

    if (viewport === null || flowRoot === null) {
      return;
    }

    const nodesBounds = getNodesBounds(renderedNodes);
    const transform = getViewportForBounds(nodesBounds, PNG_WIDTH, PNG_HEIGHT, 0.5, 2, 0.16);
    const backgroundColor = getEffectiveBackgroundColor(flowRoot);
    canvasRef.current.classList.add('exporting-png');

    try {
      const dataUrl = await toPng(viewport, {
        backgroundColor,
        cacheBust: true,
        filter: (node) => {
          if (!(node instanceof Element)) {
            return true;
          }

          return (
            !node.classList.contains('react-flow__handle') &&
            !node.classList.contains('react-flow__background') &&
            !node.classList.contains('react-flow__controls') &&
            !node.classList.contains('react-flow__minimap')
          );
        },
        height: PNG_HEIGHT,
        style: {
          height: `${PNG_HEIGHT}px`,
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
          width: `${PNG_WIDTH}px`,
        },
        width: PNG_WIDTH,
      });
      const link = document.createElement('a');
      link.download = `${project.name.trim() || 'diagrama'}.png`;
      link.href = dataUrl;
      link.click();
      showFeedback('PNG exportado');
    } finally {
      canvasRef.current.classList.remove('exporting-png');
    }
  };

  const handlePaneContextMenu = (event: MouseEvent<Element>): void => {
    if (reactFlowInstance === null || canvasRef.current === null) {
      return;
    }

    event.preventDefault();
    const bounds = canvasRef.current.getBoundingClientRect();

    setContextMenu({
      screenPosition: {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      },
      flowPosition: reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }),
    });
  };

  const createClassFromContextMenu = (): void => {
    if (contextMenu !== null) {
      addClassNode(contextMenu.flowPosition);
      setContextMenu(null);
    }
  };

  const openNoteEdgeMenu = (nodeId: string, event: MouseEvent<Element>): void => {
    if (canvasRef.current === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const bounds = canvasRef.current.getBoundingClientRect();
    setSelectedEdgeId(null);
    setSelectedNodeId(nodeId);
    setContextMenu({
      noteEdgeNodeId: nodeId,
      screenPosition: {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      },
      flowPosition: reactFlowInstance?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 0, y: 0 },
    });
  };

  function handleClassContextMenu(nodeId: string, event: MouseEvent<HTMLElement>): void {
    if (canvasRef.current === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const bounds = canvasRef.current.getBoundingClientRect();

    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setContextMenu({
      nodeId,
      screenPosition: {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      },
      flowPosition: reactFlowInstance?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 0, y: 0 },
    });
  }

  const selectedContextNode = contextMenu?.nodeId
    ? nodes.find((node) => node.id === contextMenu.nodeId) ?? null
    : null;
  const noteEdgeContextNode = contextMenu?.noteEdgeNodeId
    ? nodes.find((node) => node.id === contextMenu.noteEdgeNodeId) ?? null
    : null;

  useEffect(() => {
    if (contextMenu === null) {
      return;
    }

    const closeOnClick = (event: globalThis.MouseEvent): void => {
      if (contextMenuRef.current?.contains(event.target as globalThis.Node)) {
        return;
      }

      setContextMenu(null);
    };

    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', closeOnClick);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('mousedown', closeOnClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu]);

  return (
    <main className="diagram-editor">
      <header className="editor-toolbar">
        <div>
          <p className="eyebrow">Proyecto abierto</p>
          <h2>{project.name}</h2>
        </div>
        <div className="editor-toolbar-actions">
          <button type="button" disabled={!canUndo} onClick={onUndo} title="Deshacer última acción">
            <Undo2 size={17} />
            Deshacer
          </button>
          <button type="button" disabled={!canRedo} onClick={onRedo} title="Rehacer acción deshecha">
            <Redo2 size={17} />
            Rehacer
          </button>
          <button type="button" onClick={() => addClassNode()}>
            <Plus size={18} />
            Crear clase
          </button>
          <button type="button" onClick={centerDiagram} title="Centrar vista">
            <Crosshair size={17} />
            Centrar
          </button>
          <button type="button" onClick={fitDiagram} title="Ajustar para ver todo">
            <Maximize2 size={17} />
            Ver todo
          </button>
          <details className="toolbar-menu">
            <summary>Vista</summary>
            <div className="toolbar-menu-content">
              <button
                type="button"
                className={isGridEnabled ? 'active-tool' : ''}
                onClick={(event) => {
                  setIsGridEnabled((enabled) => !enabled);
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
                title="Activar o desactivar grilla"
              >
                <Grid3X3 size={17} />
                Grilla
              </button>
              <button
                type="button"
                className={isSnapEnabled ? 'active-tool' : ''}
                onClick={(event) => {
                  setIsSnapEnabled((enabled) => !enabled);
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
                title="Activar o desactivar snap"
              >
                <Magnet size={17} />
                Snap
              </button>
            </div>
          </details>
          <details className="toolbar-menu">
            <summary>Archivo</summary>
            <div className="toolbar-menu-content file-menu">
              <button
                type="button"
                onClick={(event) => {
                  exportProjectJson();
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
              >
                <FileDown size={17} />
                Exportar JSON
              </button>
              <button
                type="button"
                onClick={(event) => {
                  fileInputRef.current?.click();
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
              >
                <FileUp size={17} />
                Importar JSON
              </button>
              <button
                type="button"
                onClick={(event) => {
                  void exportPng();
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
              >
                <ImageDown size={17} />
                Exportar PNG
              </button>
            </div>
          </details>
          <label className="theme-selector compact-theme-selector">
            Tema
            <select
              value={themeId}
              onChange={(event) => onThemeChange(event.target.value as DiagramThemeId)}
              title={theme.description}
            >
              {themes.map((availableTheme) => (
                <option key={availableTheme.id} value={availableTheme.id}>
                  {availableTheme.name}
                </option>
              ))}
            </select>
          </label>
          <input
            ref={fileInputRef}
            accept="application/json,.json"
            className="hidden-file-input"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file !== undefined) {
                void importProjectJson(file);
              }
            }}
          />
        </div>
      </header>
      {feedbackMessage !== null ? (
        <div className="editor-feedback" role="status" aria-live="polite">
          {feedbackMessage}
        </div>
      ) : null}

      <div
        className={`editor-body ${hasInspectorSelection ? '' : 'inspector-hidden'} ${
          hasInspectorSelection && isInspectorCollapsed ? 'inspector-collapsed' : ''
        }`}
      >
        <div className="canvas-shell" ref={canvasRef}>
          <ReactFlow
            nodes={renderedNodes}
            edges={renderedEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={setReactFlowInstance}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onEdgeClick={(_, edge) => {
              const noteClassNodeId = edge.id.endsWith(NOTE_EDGE_SUFFIX)
                ? edge.id.slice(0, -NOTE_EDGE_SUFFIX.length)
                : null;

              if (noteClassNodeId !== null) {
                openNoteEdgeMenu(noteClassNodeId, _);
                return;
              }

              setContextMenu(null);
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
            }}
            onEdgeContextMenu={(event) => event.stopPropagation()}
            onNodeClick={(_, node) => {
              const classNodeId = getClassNodeIdFromNoteId(node.id) ?? node.id;

              setContextMenu(null);
              setSelectedEdgeId(null);
              setSelectedNodeId(classNodeId);
            }}
            onPaneClick={() => {
              setContextMenu(null);
              setSelectedEdgeId(null);
              setSelectedNodeId(null);
            }}
            onPaneContextMenu={handlePaneContextMenu}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={36}
            deleteKeyCode={null}
            multiSelectionKeyCode={null}
            selectNodesOnDrag={false}
            selectionKeyCode={null}
            selectionOnDrag={false}
            snapGrid={[20, 20]}
            snapToGrid={isSnapEnabled}
            fitView
          >
            {isGridEnabled ? (
              <Background
                color={theme.canvas.gridColorStrong}
                gap={20}
                lineWidth={1}
                size={1.4}
                variant={BackgroundVariant.Dots}
              />
            ) : null}
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
          {contextMenu !== null ? (
            <div
              className="canvas-context-menu"
              ref={contextMenuRef}
              style={{ left: contextMenu.screenPosition.x, top: contextMenu.screenPosition.y }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {contextMenu.noteEdgeNodeId !== undefined ? (
                <>
                  <p className="context-menu-title">Clase</p>
                  {NOTE_HANDLE_OPTIONS.map((option) => (
                    <button
                      key={`source-${option.value}`}
                      type="button"
                      className={noteEdgeContextNode?.data.parametricValuesNoteHandle === option.value ? 'active-context-option' : ''}
                      onClick={() => {
                        updateParametricValuesNoteConnectionHandles(
                          contextMenu.noteEdgeNodeId ?? '',
                          option.value,
                          'class',
                        );
                        setContextMenu(null);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                  <p className="context-menu-title">Nota</p>
                  {NOTE_HANDLE_OPTIONS.map((option) => (
                    <button
                      key={`target-${option.value}`}
                      type="button"
                      className={
                        noteEdgeContextNode?.data.parametricValuesNoteTargetHandle === option.value
                          ? 'active-context-option'
                          : ''
                      }
                      onClick={() => {
                        updateParametricValuesNoteConnectionHandles(
                          contextMenu.noteEdgeNodeId ?? '',
                          option.value,
                          'note',
                        );
                        setContextMenu(null);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </>
              ) : contextMenu.nodeId === undefined ? (
                <button type="button" onClick={createClassFromContextMenu}>
                  Crear clase
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      duplicateClassNode(contextMenu.nodeId ?? '');
                      setContextMenu(null);
                    }}
                  >
                    Duplicar clase
                  </button>
                  {selectedContextNode?.data.hasParametricValuesNote &&
                  (selectedContextNode.data.parametricValues ?? []).some((value) => value.value.trim().length > 0) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setParametricValuesNoteByNodeId(contextMenu.nodeId ?? '', false);
                        setContextMenu(null);
                      }}
                    >
                      Eliminar valores paramétricos
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        addParametricValuesNoteAndStartEditing(contextMenu.nodeId ?? '');
                        setContextMenu(null);
                      }}
                    >
                      Agregar valores paramétricos
                    </button>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
        {hasInspectorSelection ? (
          <aside className={`inspector ${isInspectorCollapsed ? 'collapsed' : ''}`}>
            <button
              className="icon-button inspector-toggle"
              type="button"
              onClick={() => setIsInspectorCollapsed((isCollapsed) => !isCollapsed)}
              title={isInspectorCollapsed ? 'Expandir inspector' : 'Contraer inspector'}
            >
              {isInspectorCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
            </button>
            {isInspectorCollapsed ? null : selectedEdge !== null ? (
              <AssociationInspector edge={selectedEdge} onUpdateAssociation={updateAssociation} />
            ) : (
              <ClassInspector
                node={selectedNode}
                onAddAttribute={addAttribute}
                onDeleteAttribute={deleteAttribute}
                onRenameClass={renameClass}
                onSetParametricValuesNote={setParametricValuesNoteByNodeId}
                onUpdateAttribute={updateAttribute}
                onUpdateParametricValues={updateParametricValuesByNodeId}
              />
            )}
          </aside>
        ) : null}
      </div>
    </main>
  );
}
