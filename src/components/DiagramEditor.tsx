import { ClassGroupColorPicker } from './ClassGroupColorPicker';
import type { ClassGroupColor } from '../constants/classGroupColors';
import { ClassAlignmentGuides } from './ClassAlignmentGuides';
import { DiagramSelectionTools } from './DiagramSelectionTools';
import { DiagramReviewPanel } from './DiagramReviewPanel';
import { arrangeClasses, duplicateClasses, moveClass, type ClassArrangement, type ClassSize } from '../utils/classDiagramOperations';
import { reviewClassDiagram, type DiagramIssue } from '../utils/classDiagramReview';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type SyntheticEvent } from 'react';
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
  reconnectEdge,
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
  FileText,
  FileUp,
  Grid3X3,
  ImageDown,
  Magnet,
  Map,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  Undo2,
} from 'lucide-react';
import type {
  AssociationEdgeData,
  ClassAttribute,
  ClassDiagramArtifact,
  ClassDiagramEdge,
  ClassDiagramNode,
  ClassMethod,
  DiagramContent,
  DiagramProject,
  ParametricValue,
  ParametricValuesNoteConnectionMode,
  ParametricValuesNoteHandle,
} from '../types/diagram';
import { themes, type DiagramTheme, type DiagramThemeId } from '../theme/themes';
import { createId } from '../utils/id';
import { reorderItemsByIds } from '../utils/reorder';
import { useDiagramImageExport } from '../hooks/useDiagramImageExport';
import { readUiPreference, writeUiPreference } from '../storage/uiPreferences';
import { getAssociationMarker, normalizeAssociationData, normalizeAssociationEdge } from '../utils/association';
import {
  oppositeConnectionSide,
  resolveAutomaticNoteHandles,
} from '../utils/associationRouting';
import { normalizeClassNode, normalizeDiagramContent, normalizeDiagramProject } from '../utils/diagramNormalization';
import { AssociationEdge } from './AssociationEdge';
import { AssociationConnectionPreview } from './AssociationConnectionPreview';
import { AssociationInspector } from './AssociationInspector';
import { ClassInspector } from './ClassInspector';
import { ClassNode } from './ClassNode';
import { ParametricValuesNote } from './ParametricValuesNote';
import { EditorIdentity } from './EditorIdentity';

type DiagramEditorProps = {
  artifact: ClassDiagramArtifact;
  canRedo: boolean;
  canUndo: boolean;
  project: DiagramProject;
  theme: DiagramTheme;
  themeId: DiagramThemeId;
  onChangeContent: (content: DiagramContent, options?: ContentChangeOptions) => void;
  onImportProject: (project: DiagramProject) => void;
  onRedo: () => void;
  onThemeChange: (themeId: DiagramThemeId) => void;
  onUndo: () => void;
};

type ContentChangeOptions = {
  separateHistoryEntry?: boolean;
};

type ContextMenuState = {
  nodeId?: string;
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
const MINIMAP_ENABLED_KEY = 'class-diagram-minimap-enabled';
const NOTE_NODE_OFFSET = { x: 24, y: 116 };
const NOTE_EDGE_SUFFIX = '__values-edge';
const NOTE_NODE_SUFFIX = '__values-note';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isImportableProject = (value: unknown): value is DiagramProject => {
  if (!isRecord(value) || typeof value.name !== 'string') {
    return false;
  }

  if (isRecord(value.content)) {
    return Array.isArray(value.content.nodes) && Array.isArray(value.content.edges);
  }

  return Array.isArray(value.artifacts);
};

const downloadTextFile = (filename: string, text: string, type: string): void => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const getDefaultNotePosition = (node: ClassDiagramNode): XYPosition => ({
  x: node.position.x + NOTE_NODE_OFFSET.x,
  y: node.position.y + NOTE_NODE_OFFSET.y,
});

const getClassNodeIdFromNoteId = (nodeId: string): string | null =>
  nodeId.endsWith(NOTE_NODE_SUFFIX) ? nodeId.slice(0, -NOTE_NODE_SUFFIX.length) : null;

const getChangedNodeId = (change: NodeChange): string | null =>
  'id' in change && typeof change.id === 'string' ? change.id : null;

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
  artifact,
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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const setSelectedNodeId = useCallback((id: string | null) => setSelectedNodeIds(id === null ? [] : [id]), []);
  const [nodeSizes, setNodeSizes] = useState<Record<string, ClassSize>>({});
  const [movingNodeIds, setMovingNodeIds] = useState<string[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [hideAttributes, setHideAttributes] = useState(() => readUiPreference('class-diagram-hide-attributes') === 'true');
  const [hideGroupColors, setHideGroupColors] = useState(() => readUiPreference('class-diagram-hide-group-colors') === 'true');
  const [hideMethods, setHideMethods] = useState(() => readUiPreference('class-diagram-hide-methods') === 'true');
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(
    () => readUiPreference(INSPECTOR_COLLAPSED_KEY) === 'true',
  );
  const [isGridEnabled, setIsGridEnabled] = useState(() => readUiPreference(GRID_ENABLED_KEY) !== 'false');
  const [isSnapEnabled, setIsSnapEnabled] = useState(() => readUiPreference(SNAP_ENABLED_KEY) === 'true');
  const [isMiniMapEnabled, setIsMiniMapEnabled] = useState(
    () => readUiPreference(MINIMAP_ENABLED_KEY) !== 'false',
  );
  const [nameEditingNodeId, setNameEditingNodeId] = useState<string | null>(null);
  const [attributeEditingRequest, setAttributeEditingRequest] = useState<{ nodeId: string; attributeId: string } | null>(null);
  const [valueEditingRequest, setValueEditingRequest] = useState<{ nodeId: string; valueId: string } | null>(null);
  const [methodEditingRequest, setMethodEditingRequest] = useState<{ nodeId: string; methodId: string } | null>(null);
  const [selectedNoteNodeId, setSelectedNoteNodeId] = useState<string | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [connectionSourceNodeId, setConnectionSourceNodeId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);
  const normalizedContent = useMemo(() => normalizeDiagramContent(artifact.content), [artifact.content]);
  const { nodes, edges } = normalizedContent;
  const activeSelectedIds = selectedNodeIds.filter(id => nodes.some(node => node.id === id));
  const selectedNodeId = activeSelectedIds.length === 1 ? activeSelectedIds[0] : null;
  const selectionColors = new Set(nodes.filter(node => activeSelectedIds.includes(node.id)).map(node => node.data.groupColor));
  const selectionColor = selectionColors.size > 1 ? 'mixed' : [...selectionColors][0];
  const reviewIssues = useMemo(() => reviewClassDiagram(normalizedContent), [normalizedContent]);

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
    (nextNodes: ClassDiagramNode[], options?: ContentChangeOptions): void => {
      onChangeContent({ nodes: nextNodes.map(normalizeClassNode), edges }, options);
    },
    [edges, onChangeContent],
  );

  const updateEdges = useCallback(
    (nextEdges: ClassDiagramEdge[], options?: ContentChangeOptions): void => {
      onChangeContent({ nodes, edges: nextEdges.map(normalizeAssociationEdge) }, options);
    },
    [nodes, onChangeContent],
  );

  const deleteSelectedElement = useCallback((): void => {
    if (selectedNoteNodeId !== null) {
      onChangeContent(
        {
          nodes: nodes.map((node) =>
            node.id === selectedNoteNodeId
              ? normalizeClassNode({
                  ...node,
                  data: {
                    ...node.data,
                    hasParametricValuesNote: false,
                    parametricValuesNotePosition: undefined,
                    parametricValues: [],
                  },
                })
              : normalizeClassNode(node),
          ),
          edges: normalizedEdges.map(normalizeAssociationEdge),
        },
        { separateHistoryEntry: true },
      );
      setSelectedNoteNodeId(null);
      setSelectedNodeId(null);
      setContextMenu(null);
      return;
    }

    if (selectedEdgeId !== null) {
      updateEdges(normalizedEdges.filter((edge) => edge.id !== selectedEdgeId), { separateHistoryEntry: true });
      setSelectedEdgeId(null);
      setContextMenu(null);
      return;
    }

    const deletingIds = new Set(selectedNodeIds);
    if (!nodes.some(node => deletingIds.has(node.id))) return;
    onChangeContent({
      nodes: nodes.filter(node => !deletingIds.has(node.id)).map(normalizeClassNode),
      edges: normalizedEdges.filter(edge => !deletingIds.has(edge.source) && !deletingIds.has(edge.target)).map(normalizeAssociationEdge),
    }, { separateHistoryEntry: true });
    setSelectedNodeId(null);
    setContextMenu(null);
  }, [nodes, normalizedEdges, onChangeContent, selectedEdgeId, selectedNodeIds, selectedNoteNodeId, updateEdges, setSelectedNodeId]);

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
      const selections = changes.filter(change => change.type === 'select');
      if (selections.length > 0) {
        if (selections.some(change => change.type === 'select' && change.selected)) {
          setSelectedEdgeId(null);
          setSelectedNoteNodeId(null);
        }
        setSelectedNodeIds(current => {
          const next = new Set(current.filter(id => nodes.some(node => node.id === id)));
          for (const change of selections) if (change.type === 'select' && getClassNodeIdFromNoteId(change.id) === null) {
            if (change.selected) next.add(change.id); else next.delete(change.id);
          }
          return next.size === current.length && current.every(id => next.has(id)) ? current : [...next];
        });
      }
      const dimensions = changes.filter(change => change.type === 'dimensions');
      if (dimensions.length > 0) setNodeSizes(current => {
        const next = { ...current };
        let changed = false;
        for (const change of dimensions) if (change.type === 'dimensions' && change.dimensions) {
          if (current[change.id]?.width !== change.dimensions.width || current[change.id]?.height !== change.dimensions.height) {
            next[change.id] = change.dimensions;
            changed = true;
          }
        }
        return changed ? next : current;
      });
      const classChanges = changes.filter((change) => {
        const changedNodeId = getChangedNodeId(change);
        return (
          change.type !== 'select' &&
          change.type !== 'dimensions' &&
          (changedNodeId === null || getClassNodeIdFromNoteId(changedNodeId) === null)
        );
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

      if (classChanges.length === 0 && notePositionChanges.length === 0) {
        return;
      }

      let nextNodes = (applyNodeChanges(classChanges, nodes) as ClassDiagramNode[]).map(node => {
        const previous = nodes.find(item => item.id === node.id);
        return previous && (previous.position.x !== node.position.x || previous.position.y !== node.position.y)
          ? { ...node, data: moveClass(previous, node.position).data } : node;
      });

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
      const durableChanges = changes.filter((change) => change.type !== 'select');

      if (durableChanges.length === 0) {
        return;
      }

      updateEdges(applyEdgeChanges(durableChanges, normalizedEdges) as ClassDiagramEdge[]);
    },
    [normalizedEdges, updateEdges],
  );

  const handleConnect = useCallback(
    (connection: Connection): void => {
      const navigability = 'none';
      updateEdges(
        addEdge(
          {
            ...connection,
            id: createId(),
            type: 'association',
            data: normalizeAssociationData({
              navigability,
              lineStyle: 'automatic',
              sourceSide: 'automatic',
              targetSide: 'automatic',
            }),
            markerStart: getAssociationMarker(navigability, 'source', 'association'),
            markerEnd: getAssociationMarker(navigability, 'target', 'association'),
          },
          normalizedEdges,
        ) as ClassDiagramEdge[],
        { separateHistoryEntry: true },
      );
      setConnectionSourceNodeId(null);
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
        methods: [],
        hasParametricValuesNote: false,
        parametricValuesNoteConnectionMode: 'automatic',
        parametricValuesNotePosition: undefined,
        parametricValues: [],
      },
    };

    updateNodes([...nodes, newNode], { separateHistoryEntry: true });
    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(null);
    setSelectedNoteNodeId(null);
    setNameEditingNodeId(newNode.id);
    window.setTimeout(() => {
      const nodeElement = Array.from(
        canvasRef.current?.querySelectorAll<HTMLElement>('.react-flow__node-classNode') ?? [],
      ).find((element) => element.dataset.id === newNode.id);
      const input = nodeElement?.querySelector<HTMLInputElement>('input[aria-label="Nombre de la clase"]');
      input?.focus();
      input?.select();
    }, 50);
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

  const updateClassDescription = (description: string): void => {
    if (selectedNode === null) {
      return;
    }

    updateNodes(
      nodes.map((node) =>
        node.id === selectedNode.id ? { ...node, data: { ...node.data, description } } : node,
      ),
    );
  };

  const addAttribute = (): void => {
    if (selectedNode === null) {
      return;
    }

    const attribute: ClassAttribute = {
      id: createId(),
      name: '',
      type: '',
    };

    updateNodes(
      nodes.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, attributes: [...node.data.attributes, attribute] } }
          : node,
      ),
    );
    setAttributeEditingRequest({ nodeId: selectedNode.id, attributeId: attribute.id });
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

  const reorderAttributes = (attributeIds: string[]): void => {
    if (selectedNode === null) {
      return;
    }

    const reorderedAttributes = reorderItemsByIds(selectedNode.data.attributes, attributeIds);

    if (reorderedAttributes === selectedNode.data.attributes) {
      return;
    }

    updateNodes(
      nodes.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, attributes: reorderedAttributes } }
          : node,
      ),
      { separateHistoryEntry: true },
    );
  };

  const createMethodByNodeId = useCallback(
    (nodeId: string, method: ClassMethod): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, methods: [...node.data.methods, method] } } : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const deleteMethodByNodeId = useCallback(
    (nodeId: string, methodId: string): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  methods: node.data.methods.filter((method) => method.id !== methodId),
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const deleteAttributeAndCreateMethodByNodeId = useCallback(
    (nodeId: string, attributeId: string, method: ClassMethod): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  attributes: node.data.attributes.filter((attribute) => attribute.id !== attributeId),
                  methods: [...node.data.methods, method],
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const updateMethodFieldsByNodeId = useCallback(
    (nodeId: string, methodId: string, values: Omit<ClassMethod, 'id'>): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  methods: node.data.methods.map((method) =>
                    method.id === methodId ? { ...method, ...values } : method,
                  ),
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const updateMethodFieldsAndCreateMethodByNodeId = useCallback(
    (nodeId: string, methodId: string, values: Omit<ClassMethod, 'id'>, nextMethod: ClassMethod): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  methods: [
                    ...node.data.methods.map((method) => (method.id === methodId ? { ...method, ...values } : method)),
                    nextMethod,
                  ],
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const addMethod = (): void => {
    if (selectedNode === null) {
      return;
    }

    addMethodAndStartEditing(selectedNode.id);
  };

  const addMethodAndStartEditing = (nodeId: string): void => {
    const method: ClassMethod = {
      id: createId(),
      visibility: '',
      name: '',
      parameters: '',
      returnType: '',
    };

    createMethodByNodeId(nodeId, method);
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setSelectedNoteNodeId(null);
    setMethodEditingRequest({ nodeId, methodId: method.id });
  };

  const updateMethod = (methodId: string, values: Omit<ClassMethod, 'id'>): void => {
    if (selectedNode !== null) {
      updateMethodFieldsByNodeId(selectedNode.id, methodId, values);
    }
  };

  const deleteMethod = (methodId: string): void => {
    if (selectedNode !== null) {
      deleteMethodByNodeId(selectedNode.id, methodId);
    }
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
                  parametricValuesNoteConnectionMode: enabled
                    ? node.data.parametricValuesNoteConnectionMode ?? 'automatic'
                    : node.data.parametricValuesNoteConnectionMode,
                  parametricValuesNotePosition: enabled
                    ? node.data.parametricValuesNotePosition ?? getDefaultNotePosition(node)
                    : undefined,
                  parametricValues: enabled ? node.data.parametricValues ?? [] : [],
                },
              }
            : node,
        ),
        { separateHistoryEntry: true },
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
                parametricValuesNoteConnectionMode: 'automatic',
                parametricValuesNoteHandle: node.data.parametricValuesNoteHandle ?? 'bottom',
                parametricValuesNoteTargetHandle: node.data.parametricValuesNoteTargetHandle ?? 'top',
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

  const updateParametricValuesNoteConnection = (
    nodeId: string,
    values: {
      mode?: ParametricValuesNoteConnectionMode;
      handle?: ParametricValuesNoteHandle;
      changedEnd?: 'class' | 'note';
    },
  ): void => {
    updateNodes(
      nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                parametricValuesNoteConnectionMode:
                  values.mode ?? node.data.parametricValuesNoteConnectionMode ?? 'automatic',
                ...(values.handle !== undefined && values.changedEnd === 'class'
                  ? {
                      parametricValuesNoteHandle: values.handle,
                      parametricValuesNoteTargetHandle: oppositeConnectionSide(values.handle),
                    }
                  : {}),
                ...(values.handle !== undefined && values.changedEnd === 'note'
                  ? {
                      parametricValuesNoteHandle: oppositeConnectionSide(values.handle),
                      parametricValuesNoteTargetHandle: values.handle,
                    }
                  : {}),
              },
            }
          : node,
      ),
      { separateHistoryEntry: true },
    );
  };

  const duplicateSelection = (ids = activeSelectedIds): void => {
    const result = duplicateClasses(normalizedContent, ids);
    if (result.ids.length === 0) return;
    onChangeContent(result.content, { separateHistoryEntry: true });
    setSelectedNodeIds(result.ids);
    setSelectedEdgeId(null);
    setSelectedNoteNodeId(null);
    setContextMenu(null);
    showFeedback(`${result.ids.length} clase(s) duplicada(s)`);
  };

  const duplicateClassNode = (id: string): void => duplicateSelection([id]);

  const arrangeSelection = (action: ClassArrangement): void => {
    const next = arrangeClasses(nodes, activeSelectedIds, action, new globalThis.Map(Object.entries(nodeSizes)));
    if (next !== nodes) updateNodes(next, { separateHistoryEntry: true });
  };

  const focusIssue = (issue: DiagramIssue): void => {
    const edge = normalizedEdges.find(item => item.id === issue.edgeId);
    const targets = nodes.filter(node => node.id === issue.nodeId || node.id === edge?.source || node.id === edge?.target);
    setSelectedNodeId(issue.nodeId ?? null);
    setSelectedEdgeId(issue.edgeId ?? null);
    setSelectedNoteNodeId(null);
    if (targets.length) void reactFlowInstance?.fitView({ nodes: targets, padding: 0.5, maxZoom: 1.2, duration: 250 });
  };

  const setSelectionColor = (groupColor: ClassGroupColor | undefined): void => {
    const selected = new Set(activeSelectedIds);
    const changed = nodes.some(node => selected.has(node.id) && node.data.groupColor !== groupColor);
    if (changed) updateNodes(nodes.map(node => selected.has(node.id) ? {
      ...node, data: { ...node.data, groupColor },
    } : node), { separateHistoryEntry: true });
    if (groupColor !== undefined) setHideGroupColors(false);
    setContextMenu(null);
  };

  const toggleClassDetail = (field: 'hideAttributes' | 'hideMethods'): void => {
    const selected = new Set(activeSelectedIds);
    const allHidden = nodes.filter(node => selected.has(node.id)).every(node => node.data[field]);
    updateNodes(nodes.map(node => selected.has(node.id) ? { ...node, data: { ...node.data, [field]: !allHidden } } : node), { separateHistoryEntry: true });
  };

  const updateAssociation = useCallback((edgeId: string, values: Partial<AssociationEdgeData>): void => {
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
  }, [normalizedEdges, updateEdges]);

  const updateAssociationMultiplicity = useCallback(
    (edgeId: string, end: 'source' | 'target', value: string): void => {
      updateAssociation(edgeId, end === 'source' ? { sourceMultiplicity: value } : { targetMultiplicity: value });
    },
    [updateAssociation],
  );

  const handleReconnect = useCallback(
    (renderedEdge: Edge, connection: Connection): void => {
      const storedEdge = normalizedEdges.find((edge) => edge.id === renderedEdge.id);

      if (storedEdge === undefined) {
        return;
      }

      const sourceChanged =
        storedEdge.source !== connection.source || storedEdge.sourceHandle !== connection.sourceHandle;
      const targetChanged =
        storedEdge.target !== connection.target || storedEdge.targetHandle !== connection.targetHandle;
      const reconnectableEdge: ClassDiagramEdge = {
        ...storedEdge,
        data: normalizeAssociationData({
          ...storedEdge.data,
          ...(sourceChanged ? { sourceSide: 'automatic' as const } : {}),
          ...(targetChanged ? { targetSide: 'automatic' as const } : {}),
        }),
      };
      const edgesWithReconnectableSource = normalizedEdges.map((edge) =>
        edge.id === storedEdge.id ? reconnectableEdge : edge,
      );
      const nextEdges = reconnectEdge(
        reconnectableEdge,
        connection,
        edgesWithReconnectableSource,
        { shouldReplaceId: false },
      ) as ClassDiagramEdge[];

      updateEdges(nextEdges, { separateHistoryEntry: true });
      setSelectedEdgeId(storedEdge.id);
      setSelectedNodeId(null);
      setSelectedNoteNodeId(null);
      showFeedback('Punto de conexión actualizado');
    },
    [normalizedEdges, showFeedback, updateEdges, setSelectedNodeId],
  );

  const handleClassContextMenu = useCallback((nodeId: string, event: MouseEvent<HTMLElement>): void => {
    if (canvasRef.current === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const bounds = canvasRef.current.getBoundingClientRect();

    setSelectedNodeIds(current => current.includes(nodeId) ? current : [nodeId]);
    setSelectedEdgeId(null);
    setSelectedNoteNodeId(null);
    setContextMenu({
      nodeId,
      screenPosition: {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      },
      flowPosition: reactFlowInstance?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 0, y: 0 },
    });
  }, [reactFlowInstance]);

  const renderedNodes = useMemo<Node[]>(
    () => {
      const classNodes = nodes.map((node) => {
        const measuredNode = nodeSizes[node.id];
        const measuredDimensions =
          typeof measuredNode?.width === 'number' && measuredNode.width > 0 &&
          typeof measuredNode?.height === 'number' && measuredNode.height > 0
            ? { width: measuredNode.width, height: measuredNode.height }
            : {};

        return {
          ...node,
          ...measuredDimensions,
          selected: selectedNodeIds.includes(node.id) && selectedNoteNodeId === null,
          data: {
            ...node.data,
            groupColor: hideGroupColors ? undefined : node.data.groupColor,
            hideAttributes: hideAttributes || node.data.hideAttributes,
            hideMethods: hideMethods || node.data.hideMethods,
            isConnectionInProgress: connectionSourceNodeId !== null,
            isConnectionSource: connectionSourceNodeId === node.id,
            shouldStartNameEditing: node.id === nameEditingNodeId,
            shouldStartAttributeEditing:
              node.id === attributeEditingRequest?.nodeId ? attributeEditingRequest.attributeId : undefined,
            shouldStartMethodEditing:
              node.id === methodEditingRequest?.nodeId ? methodEditingRequest.methodId : undefined,
            onAttributeEditingStarted: (nodeId: string) => {
              if (nodeId === attributeEditingRequest?.nodeId) {
                setAttributeEditingRequest(null);
              }
            },
            onCreateAttribute: createAttributeByNodeId,
            onCreateMethod: createMethodByNodeId,
            onDeleteAttribute: deleteAttributeByNodeId,
            onDeleteAttributeAndCreateMethod: deleteAttributeAndCreateMethodByNodeId,
            onDeleteMethod: deleteMethodByNodeId,
            onMethodEditingStarted: (nodeId: string) => {
              if (nodeId === methodEditingRequest?.nodeId) {
                setMethodEditingRequest(null);
              }
            },
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
            onUpdateMethodFields: updateMethodFieldsByNodeId,
            onUpdateMethodFieldsAndCreateMethod: updateMethodFieldsAndCreateMethodByNodeId,
            onUpdateParametricValues: updateParametricValuesByNodeId,
          },
        };
      });

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
          selected: node.id === selectedNoteNodeId,
          width: 180,
          height: 90,
        }));

      return [...classNodes, ...noteNodes];
    },
    [
      nodes,
      connectionSourceNodeId,
      attributeEditingRequest,
      createAttributeByNodeId,
      createMethodByNodeId,
      deleteAttributeByNodeId,
      deleteAttributeAndCreateMethodByNodeId,
      deleteMethodByNodeId,
      handleClassContextMenu,
      methodEditingRequest,
      nameEditingNodeId,
      renameClassById,
      renameClassAndCreateAttributeByNodeId,
      selectedNodeIds,
      hideAttributes,
      hideMethods,
      hideGroupColors,
      nodeSizes,
      selectedNoteNodeId,
      setParametricValuesNoteByNodeId,
      updateAttributeByNodeId,
      updateAttributeFieldsByNodeId,
      updateAttributeFieldsAndCreateAttributeByNodeId,
      updateMethodFieldsByNodeId,
      updateMethodFieldsAndCreateMethodByNodeId,
      updateParametricValuesByNodeId,
      valueEditingRequest,
    ],
  );

  const renderedEdges = useMemo<Edge[]>(
    () => {
      const associationEdges = normalizedEdges.map((edge) => {
        return {
          ...edge,
          selected: edge.id === selectedEdgeId,
          reconnectable: edge.id === selectedEdgeId,
          data: {
            ...edge.data,
            onUpdateMultiplicity: updateAssociationMultiplicity,
            onUpdateLabel: updateAssociation,
            routingObstacles: nodes.map(node => {
              // Handles sit one pixel inside the class border. Other classes get an 8px clearance.
              const inset = node.id === edge.source || node.id === edge.target ? 2 : -8;
              return {
                x: node.position.x + inset, y: node.position.y + inset,
                width: (nodeSizes[node.id]?.width ?? 220) - inset * 2,
                height: (nodeSizes[node.id]?.height ?? 100) - inset * 2,
              };
            }),
          },
        };
      });

      const noteEdges = nodes
        .filter((node) => node.data.hasParametricValuesNote)
        .map((node) => {
          const classNode = reactFlowInstance?.getNode(node.id) ?? node;
          const notePosition = node.data.parametricValuesNotePosition ?? getDefaultNotePosition(node);
          const automaticHandles = resolveAutomaticNoteHandles(classNode, {
            position: notePosition,
            width: 180,
            height: 90,
          });
          const isAutomatic = node.data.parametricValuesNoteConnectionMode === 'automatic';

          return {
            id: `${node.id}${NOTE_EDGE_SUFFIX}`,
            source: node.id,
            sourceHandle: isAutomatic
              ? automaticHandles.sourceHandle
              : node.data.parametricValuesNoteHandle ?? 'bottom',
            target: `${node.id}${NOTE_NODE_SUFFIX}`,
            targetHandle: isAutomatic
              ? automaticHandles.targetHandle
              : node.data.parametricValuesNoteTargetHandle ?? 'top',
            selectable: true,
            focusable: false,
            reconnectable: false,
            style: {
              stroke: 'var(--note-connection-line)',
              strokeDasharray: 'var(--note-connection-dash)',
              strokeWidth: 1.2,
            },
            interactionWidth: 12,
            type: 'straight',
          };
        });

      return [...associationEdges, ...noteEdges];
    },
    [nodes, nodeSizes, normalizedEdges, reactFlowInstance, selectedEdgeId, updateAssociationMultiplicity, updateAssociation],
  );

  useEffect(() => { writeUiPreference('class-diagram-hide-attributes', String(hideAttributes)); }, [hideAttributes]);
  useEffect(() => { writeUiPreference('class-diagram-hide-group-colors', String(hideGroupColors)); }, [hideGroupColors]);
  useEffect(() => { writeUiPreference('class-diagram-hide-methods', String(hideMethods)); }, [hideMethods]);

  useEffect(() => {
    writeUiPreference(INSPECTOR_COLLAPSED_KEY, String(isInspectorCollapsed));
  }, [isInspectorCollapsed]);

  useEffect(() => {
    writeUiPreference(GRID_ENABLED_KEY, String(isGridEnabled));
  }, [isGridEnabled]);

  useEffect(() => {
    writeUiPreference(SNAP_ENABLED_KEY, String(isSnapEnabled));
  }, [isSnapEnabled]);

  useEffect(() => {
    writeUiPreference(MINIMAP_ENABLED_KEY, String(isMiniMapEnabled));
  }, [isMiniMapEnabled]);

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

      if (selectedNodeIds.length === 0 && selectedEdgeId === null && selectedNoteNodeId === null) {
        return;
      }

      event.preventDefault();
      deleteSelectedElement();
    };

    document.addEventListener('keydown', handleDeleteKey);

    return () => {
      document.removeEventListener('keydown', handleDeleteKey);
    };
  }, [deleteSelectedElement, selectedEdgeId, selectedNodeIds, selectedNoteNodeId]);

  const getDiagramBounds = useCallback(() => {
    const renderedNodeIds = new Set(renderedNodes.map((node) => node.id));
    const measuredNodes = reactFlowInstance
      ?.getNodes()
      .filter((node) => renderedNodeIds.has(node.id));

    return getNodesBounds(measuredNodes !== undefined && measuredNodes.length > 0 ? measuredNodes : renderedNodes);
  }, [reactFlowInstance, renderedNodes]);

  const centerDiagram = (): void => {
    if (reactFlowInstance === null || renderedNodes.length === 0) {
      return;
    }

    const bounds = getDiagramBounds();
    reactFlowInstance.setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, {
      duration: 300,
      zoom: reactFlowInstance.getZoom(),
    });
  };

  const fitDiagram = (): void => {
    if (reactFlowInstance === null || canvasRef.current === null || renderedNodes.length === 0) {
      return;
    }

    const bounds = getDiagramBounds();
    const { width, height } = canvasRef.current.getBoundingClientRect();
    const viewport = getViewportForBounds(bounds, width, height, 0.2, 1.5, 0.18);
    reactFlowInstance.setViewport(viewport, { duration: 300 });
  };

  const exportProjectJson = (): void => {
    const exportProject = normalizeDiagramProject({
      ...project,
      artifacts: project.artifacts.map((currentArtifact) =>
        currentArtifact.id === artifact.id ? { ...artifact, content: normalizedContent } : currentArtifact,
      ),
    });
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

  const { exportPng, exportPdf, isExporting } = useDiagramImageExport({
    canvasRef,
    hasNodes: renderedNodes.length > 0,
    getDiagramBounds,
    projectName: project.name,
    artifactName: artifact.name,
    showFeedback,
  });

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

  const selectedContextNode = contextMenu?.nodeId
    ? nodes.find((node) => node.id === contextMenu.nodeId) ?? null
    : null;

  const closeToolbarMenus = (except?: HTMLDetailsElement): void => {
    toolbarRef.current?.querySelectorAll<HTMLDetailsElement>('details.toolbar-menu').forEach((details) => {
      if (details !== except) {
        details.removeAttribute('open');
      }
    });
  };

  const handleToolbarMenuToggle = (event: SyntheticEvent<HTMLDetailsElement>): void => {
    if (event.currentTarget.open) {
      closeToolbarMenus(event.currentTarget);
    }
  };

  useLayoutEffect(() => {
    if (contextMenu === null || contextMenuRef.current === null || canvasRef.current === null) {
      return;
    }

    const padding = 8;
    const menuBounds = contextMenuRef.current.getBoundingClientRect();
    const canvasBounds = canvasRef.current.getBoundingClientRect();
    const nextX = Math.min(
      Math.max(padding, contextMenu.screenPosition.x),
      Math.max(padding, canvasBounds.width - menuBounds.width - padding),
    );
    const nextY = Math.min(
      Math.max(padding, contextMenu.screenPosition.y),
      Math.max(padding, canvasBounds.height - menuBounds.height - padding),
    );

    if (nextX !== contextMenu.screenPosition.x || nextY !== contextMenu.screenPosition.y) {
      setContextMenu((currentMenu) =>
        currentMenu === null
          ? null
          : { ...currentMenu, screenPosition: { x: nextX, y: nextY } },
      );
    }
  }, [contextMenu]);

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

  useEffect(() => {
    const closeOnOutsideClick = (event: globalThis.MouseEvent): void => {
      if (toolbarRef.current?.contains(event.target as globalThis.Node)) {
        return;
      }

      closeToolbarMenus();
    };

    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeToolbarMenus();
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick, true);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <main className="diagram-editor class-diagram-editor">
      <header className="editor-toolbar" ref={toolbarRef}>
        <EditorIdentity artifactKind="Diagrama de clases" artifactName={artifact.name} projectName={project.name} />
        <div className="editor-toolbar-actions">
          <button className="toolbar-icon-action" aria-label="Deshacer" type="button" disabled={!canUndo} onClick={() => { closeToolbarMenus(); onUndo(); }} title="Deshacer última acción (⌘Z)">
            <Undo2 size={17} />
          </button>
          <button className="toolbar-icon-action" aria-label="Rehacer" type="button" disabled={!canRedo} onClick={() => { closeToolbarMenus(); onRedo(); }} title="Rehacer acción deshecha (⇧⌘Z)">
            <Redo2 size={17} />
          </button>
          <span className="toolbar-divider" aria-hidden="true" />
          <button
            className="toolbar-primary-action"
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.currentTarget.blur();
              closeToolbarMenus();
              addClassNode();
            }}
          >
            <Plus size={18} />
            Crear clase
          </button>
          <button className="toolbar-icon-action" aria-label="Centrar vista" type="button" onClick={() => { closeToolbarMenus(); centerDiagram(); }} title="Centrar vista">
            <Crosshair size={17} />
          </button>
          <button className="toolbar-icon-action" aria-label="Ver todo" type="button" onClick={() => { closeToolbarMenus(); fitDiagram(); }} title="Ajustar para ver todo">
            <Maximize2 size={17} />
          </button>
          <DiagramSelectionTools count={activeSelectedIds.length} onArrange={arrangeSelection}
            onDuplicate={() => { duplicateSelection(); closeToolbarMenus(); }}
            onSelectAll={() => { setSelectedNodeIds(nodes.map(node => node.id)); setSelectedEdgeId(null); setSelectedNoteNodeId(null); closeToolbarMenus(); }}
            onToggle={handleToolbarMenuToggle} />
          <button type="button" aria-pressed={reviewOpen} onClick={() => { closeToolbarMenus(); setReviewOpen(open => !open); }}>Revisar</button>
          <details className="toolbar-menu" onToggle={handleToolbarMenuToggle}>
            <summary>Vista</summary>
            <div className="toolbar-menu-content">
              {nodes.some(node => node.data.groupColor) ? <button type="button" aria-pressed={!hideGroupColors}
                onClick={() => setHideGroupColors(hidden => !hidden)}>{hideGroupColors ? 'Mostrar' : 'Ocultar'} colores de grupo</button> : null}
              <button type="button" aria-pressed={!hideAttributes} onClick={() => setHideAttributes(hidden => !hidden)}>{hideAttributes ? 'Mostrar' : 'Ocultar'} todos los atributos</button>
              <button type="button" aria-pressed={!hideMethods} onClick={() => setHideMethods(hidden => !hidden)}>{hideMethods ? 'Mostrar' : 'Ocultar'} todos los métodos</button>
              <button type="button" disabled={activeSelectedIds.length === 0} onClick={() => toggleClassDetail('hideAttributes')}>Alternar atributos de la selección</button>
              <button type="button" disabled={activeSelectedIds.length === 0} onClick={() => toggleClassDetail('hideMethods')}>Alternar métodos de la selección</button>
              <hr />
              <button
                aria-pressed={isGridEnabled}
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
                aria-pressed={isSnapEnabled}
                type="button"
                className={isSnapEnabled ? 'active-tool' : ''}
                onClick={(event) => {
                  setIsSnapEnabled((enabled) => !enabled);
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
                title="Ajustar elementos a la grilla"
              >
                <Magnet size={17} />
                Ajustar a la grilla
              </button>
              <button
                aria-pressed={isMiniMapEnabled}
                type="button"
                className={isMiniMapEnabled ? 'active-tool' : ''}
                onClick={(event) => {
                  setIsMiniMapEnabled((enabled) => !enabled);
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
                title="Mostrar u ocultar minimapa"
              >
                <Map size={17} />
                Minimapa
              </button>
            </div>
          </details>
          <details className="toolbar-menu" onToggle={handleToolbarMenuToggle}>
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
                disabled={isExporting}
                type="button"
                onClick={(event) => {
                  void exportPng();
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
              >
                <ImageDown size={17} />
                Exportar PNG
              </button>
              <button
                disabled={isExporting}
                type="button"
                onClick={(event) => {
                  void exportPdf();
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
              >
                <FileText size={17} />
                Exportar PDF
              </button>
            </div>
          </details>
          <details className="toolbar-menu" onToggle={handleToolbarMenuToggle}>
            <summary title={theme.description}>Tema</summary>
            <div className="toolbar-menu-content theme-menu">
              {themes.map((availableTheme) => (
                <button
                  aria-current={availableTheme.id === themeId ? 'true' : undefined}
                  key={availableTheme.id}
                  type="button"
                  className={availableTheme.id === themeId ? 'active-tool' : ''}
                  onClick={(event) => {
                    onThemeChange(availableTheme.id as DiagramThemeId);
                    event.currentTarget.closest('details')?.removeAttribute('open');
                  }}
                >
                  {availableTheme.name}
                </button>
              ))}
            </div>
          </details>
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
        <div
          className={`canvas-shell class-diagram-canvas ${connectionSourceNodeId !== null ? 'is-connecting' : ''}`}
          ref={canvasRef}
        >
          <ReactFlow
            nodes={renderedNodes}
            edges={renderedEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={setReactFlowInstance}
            onNodesChange={handleNodesChange}
            onNodeDragStart={(_, node, group) => {
              setSelectedEdgeId(null);
              setSelectedNoteNodeId(null);
              setMovingNodeIds(group.length ? group.map(item => item.id) : [node.id]);
            }}
            onNodeDragStop={() => setMovingNodeIds([])}
            onSelectionDragStart={(_, group) => setMovingNodeIds(group.map(node => node.id))}
            onSelectionDragStop={() => setMovingNodeIds([])}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onConnectStart={(_, params) => {
              window.getSelection()?.removeAllRanges();
              setConnectionSourceNodeId(params.nodeId ?? null);
            }}
            onConnectEnd={() => setConnectionSourceNodeId(null)}
            onReconnect={handleReconnect}
            onReconnectStart={(_, edge) => {
              window.getSelection()?.removeAllRanges();
              setConnectionSourceNodeId(edge.source);
            }}
            onReconnectEnd={() => setConnectionSourceNodeId(null)}
            reconnectRadius={12}
            edgesUpdatable={false}
            connectionLineComponent={AssociationConnectionPreview}
            connectionLineStyle={{
              stroke: 'var(--association-stroke)',
              strokeWidth: 'var(--association-stroke-width)',
            }}
            onEdgeClick={(_, edge) => {
              const noteClassNodeId = edge.id.endsWith(NOTE_EDGE_SUFFIX)
                ? edge.id.slice(0, -NOTE_EDGE_SUFFIX.length)
                : null;

              if (noteClassNodeId !== null) {
                setContextMenu(null);
                setSelectedEdgeId(null);
                setSelectedNodeId(noteClassNodeId);
                setSelectedNoteNodeId(noteClassNodeId);
                return;
              }

              setContextMenu(null);
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
              setSelectedNoteNodeId(null);
            }}
            onEdgeContextMenu={(event) => event.stopPropagation()}
            onNodeClick={(event, node) => {
              const noteClassNodeId = getClassNodeIdFromNoteId(node.id);
              const classNodeId = noteClassNodeId ?? node.id;

              setContextMenu(null);
              setSelectedEdgeId(null);
              if (noteClassNodeId !== null) setSelectedNodeId(classNodeId);
              else if (event.metaKey || event.ctrlKey) {
                // Use the selection from before this click; React Flow may also emit selection changes.
                setSelectedNodeIds(activeSelectedIds.includes(node.id)
                  ? activeSelectedIds.filter(id => id !== node.id)
                  : [...activeSelectedIds, node.id]);
              }
              setSelectedNoteNodeId(noteClassNodeId);
            }}
            onPaneClick={() => {
              setContextMenu(null);
              setSelectedEdgeId(null);
              setSelectedNodeId(null);
              setSelectedNoteNodeId(null);
            }}
            onPaneContextMenu={handlePaneContextMenu}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={36}
            deleteKeyCode={null}
            multiSelectionKeyCode={['Meta', 'Control']}
            selectNodesOnDrag={false}
            nodeDragThreshold={3}
            selectionKeyCode="Shift"
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
            <ClassAlignmentGuides movingIds={movingNodeIds} />
            <Controls />
            {isMiniMapEnabled ? <MiniMap pannable zoomable /> : null}
          </ReactFlow>
          {reviewOpen ? <DiagramReviewPanel issues={reviewIssues} onFocus={focusIssue} onClose={() => setReviewOpen(false)} /> : null}
          {contextMenu !== null ? (
            <div
              className="canvas-context-menu"
              ref={contextMenuRef}
              style={{ left: contextMenu.screenPosition.x, top: contextMenu.screenPosition.y }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {contextMenu.nodeId === undefined ? (
                <button type="button" onClick={createClassFromContextMenu}>
                  Crear clase
                </button>
              ) : (
                <>
                  <ClassGroupColorPicker value={selectionColor} count={activeSelectedIds.length} onChange={setSelectionColor} />
                  <button
                    type="button"
                    onClick={() => {
                      if (activeSelectedIds.length > 1) duplicateSelection(); else duplicateClassNode(contextMenu.nodeId ?? '');
                      setContextMenu(null);
                    }}
                  >
                    {activeSelectedIds.length > 1 ? 'Duplicar selección' : 'Duplicar clase'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addMethodAndStartEditing(contextMenu.nodeId ?? '');
                      setContextMenu(null);
                    }}
                  >
                    Agregar método
                  </button>
                  {selectedContextNode?.data.hasParametricValuesNote ? (
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
                onAddMethod={addMethod}
                onDeleteAttribute={deleteAttribute}
                onDeleteMethod={deleteMethod}
                onReorderAttributes={reorderAttributes}
                onRenameClass={renameClass}
                onSetParametricValuesNote={(nodeId, enabled) => {
                  if (enabled) {
                    addParametricValuesNoteAndStartEditing(nodeId);
                  } else {
                    setParametricValuesNoteByNodeId(nodeId, false);
                  }
                }}
                onUpdateDescription={updateClassDescription}
                onUpdateAttribute={updateAttribute}
                onUpdateMethod={updateMethod}
                onUpdateParametricValues={updateParametricValuesByNodeId}
                onUpdateParametricValuesNoteConnection={updateParametricValuesNoteConnection}
              />
            )}
          </aside>
        ) : null}
      </div>
    </main>
  );
}
