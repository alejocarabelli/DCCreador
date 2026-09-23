import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type SyntheticEvent } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  getNodesBounds,
  getViewportForBounds,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
  type XYPosition,
} from 'reactflow';
import {
  Crosshair,
  FileDown,
  FileText,
  FileUp,
  Grid3X3,
  ImageDown,
  Magnet,
  Maximize2,
  Plus,
  SquareDashed,
  UserRound,
} from 'lucide-react';
import type {
  DiagramContent,
  DiagramProject,
  UseCaseEdgeData,
  UseCaseModelArtifact,
  UseCaseModelContent,
  UseCaseModelEdge,
  UseCaseModelNode,
  UseCaseNodeKind,
  UseCaseRelationType,
} from '../types/diagram';
import { IMPORT_INVALID_MESSAGE, IMPORT_UNREADABLE_MESSAGE, isImportableProject } from '../utils/projectImport';
import type { DiagramTheme, DiagramThemeId } from '../theme/themes';
import { createId } from '../utils/id';
import { createPdfFromJpegDataUrl, downloadBlob, downloadDataUrl } from '../utils/pdfExport';
import { applyExportThemeVariables } from '../hooks/useTheme';
import { readUiPreference, writeUiPreference } from '../storage/uiPreferences';
import { normalizeDiagramProject, normalizeUseCaseModelContent } from '../utils/diagramNormalization';
import { CanvasControls } from './CanvasControls';
import { CanvasStartCard } from './CanvasStartCard';
import { SystemBoundaryNode, UseCaseActorNode, UseCaseOvalNode } from './useCaseNodes';
import { UseCaseRelationEdge } from './UseCaseRelationEdge';
import { EditorIdentity } from './EditorIdentity';
import { ToolbarHistory } from './ToolbarHistory';
import type { DiagramSaveStatus } from '../hooks/useProjects';
import { findFreeClassPosition } from '../utils/classPlacement';

const GRID_ENABLED_KEY = 'class-diagram-grid-enabled';
const SNAP_ENABLED_KEY = 'class-diagram-snap-enabled';
const PNG_WIDTH = 1600;
const PNG_HEIGHT = 1000;

const isEditableElement = (element: Element | null): boolean =>
  element !== null && element.closest('[contenteditable="true"], input, select, textarea, button') !== null;

type UseCaseModelEditorProps = {
  artifact: UseCaseModelArtifact;
  canRedo: boolean;
  saveStatus?: DiagramSaveStatus;
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
  screenPosition: XYPosition;
  flowPosition: XYPosition;
};

const nodeTypes = {
  systemBoundary: SystemBoundaryNode,
  useCaseActor: UseCaseActorNode,
  useCaseOval: UseCaseOvalNode,
};

const edgeTypes = {
  useCaseRelation: UseCaseRelationEdge,
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

const getEffectiveBackgroundColor = (element: HTMLElement): string => {
  const color = window.getComputedStyle(element).backgroundColor;
  return color === 'rgba(0, 0, 0, 0)' ? '#ffffff' : color;
};

const canConnectNodes = (
  sourceNode: UseCaseModelNode | undefined,
  targetNode: UseCaseModelNode | undefined,
): UseCaseRelationType | null => {
  if (sourceNode === undefined || targetNode === undefined || sourceNode.id === targetNode.id) {
    return null;
  }

  const sourceKind = sourceNode.data.kind;
  const targetKind = targetNode.data.kind;

  if (sourceKind === 'system-boundary' || targetKind === 'system-boundary') {
    return null;
  }

  if (
    (sourceKind === 'actor' && targetKind === 'use-case') ||
    (sourceKind === 'use-case' && targetKind === 'actor')
  ) {
    return 'association';
  }

  if (sourceKind === 'actor' && targetKind === 'actor') {
    return 'generalization';
  }

  return 'include';
};

const allowedRelationTypes = (
  sourceNode: UseCaseModelNode | undefined,
  targetNode: UseCaseModelNode | undefined,
): UseCaseRelationType[] => {
  if (sourceNode?.data.kind === 'actor' && targetNode?.data.kind === 'actor') {
    return ['generalization'];
  }

  if (sourceNode?.data.kind === 'use-case' && targetNode?.data.kind === 'use-case') {
    return ['include', 'extend', 'generalization'];
  }

  return ['association'];
};

export function UseCaseModelEditor({
  artifact,
  canRedo,
  saveStatus = 'saved',
  canUndo,
  project,
  onChangeContent,
  onImportProject,
  onRedo,
  onUndo,
}: UseCaseModelEditorProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isGridEnabled, setIsGridEnabled] = useState(() => readUiPreference(GRID_ENABLED_KEY) !== 'false');
  const [isSnapEnabled, setIsSnapEnabled] = useState(() => readUiPreference(SNAP_ENABLED_KEY) === 'true');
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);
  const normalizedContent = useMemo(() => normalizeUseCaseModelContent(artifact.content), [artifact.content]);
  const { nodes, edges } = normalizedContent;

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find((edge) => edge.id === selectedEdgeId) ?? null, [edges, selectedEdgeId]);

  const showFeedback = (message: string): void => {
    setFeedbackMessage(message);
    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current);
    }
    feedbackTimeoutRef.current = window.setTimeout(() => setFeedbackMessage(null), 1800);
  };

  const commitContent = useCallback(
    (content: UseCaseModelContent): void => {
      onChangeContent(normalizeUseCaseModelContent(content));
    },
    [onChangeContent],
  );

  const updateNodes = useCallback((nextNodes: UseCaseModelNode[]): void => {
    commitContent({ nodes: nextNodes, edges });
  }, [commitContent, edges]);

  const updateEdges = useCallback((nextEdges: UseCaseModelEdge[]): void => {
    commitContent({ nodes, edges: nextEdges });
  }, [commitContent, nodes]);

  const deleteSelectedElement = useCallback((): void => {
    if (selectedEdgeId !== null) {
      commitContent({ nodes, edges: edges.filter((edge) => edge.id !== selectedEdgeId) });
      setSelectedEdgeId(null);
      return;
    }

    if (selectedNodeId !== null) {
      commitContent({
        nodes: nodes.filter((node) => node.id !== selectedNodeId),
        edges: edges.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId),
      });
      setSelectedNodeId(null);
    }
  }, [commitContent, edges, nodes, selectedEdgeId, selectedNodeId]);

  const renameNode = useCallback((nodeId: string, name: string): void => {
    updateNodes(nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, name } } : node)));
  }, [nodes, updateNodes]);

  const openNodeContextMenu = useCallback((nodeId: string, event: MouseEvent<HTMLElement>): void => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (bounds === undefined || reactFlowInstance === null) {
      return;
    }
    setContextMenu({
      nodeId,
      screenPosition: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      flowPosition: reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    });
  }, [reactFlowInstance]);

  const renderedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onOpenContextMenu: openNodeContextMenu,
          onRename: renameNode,
        },
        zIndex: node.data.kind === 'system-boundary' ? 0 : 10,
      })),
    [nodes, openNodeContextMenu, renameNode],
  );

  const addNode = (kind: UseCaseNodeKind, position: XYPosition): void => {
    const id = createId();
    const type = kind === 'actor' ? 'useCaseActor' : kind === 'system-boundary' ? 'systemBoundary' : 'useCaseOval';
    const baseNode: UseCaseModelNode = {
      id,
      type,
      position,
      data: {
        kind,
        name: '',
      },
    };
    const nextNode =
      kind === 'system-boundary'
        ? { ...baseNode, style: { width: 520, height: 340 }, zIndex: 0 }
        : { ...baseNode, zIndex: 10 };
    commitContent({ nodes: [...nodes, nextNode], edges });
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  };

  // Toolbar additions used fixed points, so a second actor landed exactly on the
  // first. Boundaries are containers and are meant to hold other nodes, so they
  // never count as occupied.
  const freeSlotFor = (kind: UseCaseNodeKind, preferred: XYPosition): XYPosition => {
    if (kind === 'system-boundary') return preferred;
    const size = kind === 'actor' ? { width: 90, height: 120 } : { width: 180, height: 80 };
    const occupied = nodes.filter((node) => node.data.kind !== 'system-boundary');
    return findFreeClassPosition(occupied, preferred, size);
  };

  const duplicateNode = (nodeId: string): void => {
    const node = nodes.find((currentNode) => currentNode.id === nodeId);
    if (node === undefined) {
      return;
    }
    const copy: UseCaseModelNode = {
      ...node,
      id: createId(),
      position: { x: node.position.x + 36, y: node.position.y + 36 },
      selected: false,
      data: { ...node.data, name: `${node.data.name} Copia` },
    };
    commitContent({ nodes: [...nodes, copy], edges });
    setContextMenu(null);
  };

  const deleteNode = (nodeId: string): void => {
    commitContent({
      nodes: nodes.filter((node) => node.id !== nodeId),
      edges: edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    });
    setContextMenu(null);
  };

  const onNodesChange = (changes: NodeChange[]): void => {
    commitContent({ nodes: applyNodeChanges(changes, nodes) as UseCaseModelNode[], edges });
  };

  const onEdgesChange = (changes: EdgeChange[]): void => {
    commitContent({ nodes, edges: applyEdgeChanges(changes, edges) as UseCaseModelEdge[] });
  };

  const onConnect = (connection: Connection): void => {
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    const relationType = canConnectNodes(sourceNode, targetNode);

    if (relationType === null) {
      return;
    }

    const edge: UseCaseModelEdge = {
      id: createId(),
      source: connection.source ?? '',
      sourceHandle: connection.sourceHandle,
      target: connection.target ?? '',
      targetHandle: connection.targetHandle,
      type: 'useCaseRelation',
      data: { relationType, label: relationType === 'association' ? '' : undefined },
    };

    updateEdges(addEdge(edge, edges) as UseCaseModelEdge[]);
  };

  const updateSelectedEdge = (values: Partial<UseCaseEdgeData>): void => {
    if (selectedEdge === null) {
      return;
    }

    updateEdges(
      edges.map((edge) =>
        edge.id === selectedEdge.id
          ? {
              ...edge,
              data: {
                relationType: edge.data?.relationType ?? 'association',
                label: edge.data?.label,
                ...values,
              },
            }
          : edge,
      ),
    );
  };

  const invertSelectedEdge = (): void => {
    if (selectedEdge === null) {
      return;
    }

    updateEdges(
      edges.map((edge) =>
        edge.id === selectedEdge.id
          ? {
              ...edge,
              source: edge.target,
              sourceHandle: edge.targetHandle,
              target: edge.source,
              targetHandle: edge.sourceHandle,
            }
          : edge,
      ),
    );
  };

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
    reactFlowInstance.setViewport(getViewportForBounds(bounds, width, height, 0.2, 1.5, 0.18), { duration: 300 });
  };

  const exportProjectJson = (): void => {
    const exportProject = normalizeDiagramProject({
      ...project,
      artifacts: project.artifacts.map((currentArtifact) =>
        currentArtifact.id === artifact.id ? { ...artifact, content: normalizedContent } : currentArtifact,
      ),
    });
    downloadTextFile(`${project.name.trim() || 'diagrama'}.json`, JSON.stringify(exportProject, null, 2), 'application/json');
    showFeedback('JSON exportado');
  };

  const importProjectJson = async (file: File): Promise<void> => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isImportableProject(parsed)) {
        showFeedback(IMPORT_INVALID_MESSAGE);
        return;
      }
      onImportProject(normalizeDiagramProject(parsed));
      showFeedback('JSON importado');
    } catch {
      showFeedback(IMPORT_UNREADABLE_MESSAGE);
    } finally {
      if (fileInputRef.current !== null) {
        fileInputRef.current.value = '';
      }
    }
  };

  const captureDiagramImage = async (format: 'jpeg' | 'png'): Promise<string | null> => {
    if (canvasRef.current === null || renderedNodes.length === 0) {
      showFeedback('No hay diagrama para exportar');
      return null;
    }
    const viewport = canvasRef.current.querySelector<HTMLElement>('.react-flow__viewport');
    const flowRoot = canvasRef.current.querySelector<HTMLElement>('.react-flow');
    if (viewport === null || flowRoot === null) {
      return null;
    }
    // Exports are documents: capture them on the light palette even in dark mode.
    const restoreTheme = applyExportThemeVariables(canvasRef.current);
    const transform = getViewportForBounds(getNodesBounds(renderedNodes), PNG_WIDTH, PNG_HEIGHT, 0.5, 2, 0.16);
    const backgroundColor = getEffectiveBackgroundColor(flowRoot);
    const edgePathStyleBackups = Array.from(viewport.querySelectorAll<SVGPathElement>('.react-flow__edge-path')).map(
      (path) => ({
        path,
        style: path.getAttribute('style'),
      }),
    );
    canvasRef.current.classList.add('exporting-png');
    try {
      const { toJpeg, toPng } = await import('html-to-image');
      edgePathStyleBackups.forEach(({ path }) => {
        const computedStyle = window.getComputedStyle(path);
        path.style.stroke = computedStyle.stroke;
        path.style.strokeWidth = computedStyle.strokeWidth;
        path.style.strokeDasharray = computedStyle.strokeDasharray;
      });
      const imageOptions = {
        backgroundColor,
        cacheBust: true,
        filter: (node: HTMLElement) => {
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
      };

      return format === 'png'
        ? await toPng(viewport, imageOptions)
        : await toJpeg(viewport, { ...imageOptions, quality: 0.95 });
    } finally {
      edgePathStyleBackups.forEach(({ path, style }) => {
        if (style === null) {
          path.removeAttribute('style');
        } else {
          path.setAttribute('style', style);
        }
      });
      canvasRef.current.classList.remove('exporting-png');
      restoreTheme();
    }
  };

  const exportPng = async (): Promise<void> => {
    const dataUrl = await captureDiagramImage('png');

    if (dataUrl === null) {
      return;
    }

    downloadDataUrl(`${project.name.trim() || 'diagrama'} - ${artifact.name.trim() || 'artefacto'}.png`, dataUrl);
    showFeedback('PNG exportado');
  };

  const exportPdf = async (): Promise<void> => {
    const dataUrl = await captureDiagramImage('jpeg');

    if (dataUrl === null) {
      return;
    }

    const pdf = createPdfFromJpegDataUrl(dataUrl, PNG_WIDTH, PNG_HEIGHT);
    downloadBlob(`${project.name.trim() || 'diagrama'} - ${artifact.name.trim() || 'artefacto'}.pdf`, pdf);
    showFeedback('PDF exportado');
  };

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

  useEffect(() => {
    writeUiPreference(GRID_ENABLED_KEY, String(isGridEnabled));
  }, [isGridEnabled]);

  useEffect(() => {
    writeUiPreference(SNAP_ENABLED_KEY, String(isSnapEnabled));
  }, [isSnapEnabled]);

  useEffect(() => {
    const closeOnOutsideClick = (event: globalThis.MouseEvent): void => {
      if (!toolbarRef.current?.contains(event.target as globalThis.Node)) {
        closeToolbarMenus();
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeToolbarMenus();
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useEffect(() => {
    const handleDeleteKey = (event: globalThis.KeyboardEvent): void => {
      if ((event.key !== 'Delete' && event.key !== 'Backspace') || isEditableElement(document.activeElement)) {
        return;
      }

      if (selectedNodeId === null && selectedEdgeId === null) {
        return;
      }

      event.preventDefault();
      deleteSelectedElement();
    };

    document.addEventListener('keydown', handleDeleteKey);
    return () => document.removeEventListener('keydown', handleDeleteKey);
  }, [deleteSelectedElement, selectedEdgeId, selectedNodeId]);

  const relationOptions =
    selectedEdge !== null
      ? allowedRelationTypes(
          nodes.find((node) => node.id === selectedEdge.source),
          nodes.find((node) => node.id === selectedEdge.target),
        )
      : [];

  return (
    <main className="diagram-editor use-case-editor">
      <header className="editor-toolbar" ref={toolbarRef}>
        <EditorIdentity artifactKind="Modelo de casos de uso" artifactType={'use-case-model'} artifactName={artifact.name} projectName={project.name} />
        <div className="editor-toolbar-actions">
          <ToolbarHistory canRedo={canRedo} canUndo={canUndo} saveStatus={saveStatus} onRedo={onRedo} onUndo={onUndo} />
          <div className="toolbar-group">
          <details className="toolbar-menu add-element-menu" onToggle={handleToolbarMenuToggle}>
            <summary><Plus size={16} />Agregar elemento</summary>
            <div className="toolbar-menu-content">
              <button type="button" onClick={(event) => { addNode('actor', freeSlotFor('actor', { x: 80, y: 120 })); event.currentTarget.closest('details')?.removeAttribute('open'); }}><UserRound size={16} />Actor</button>
              <button type="button" onClick={(event) => { addNode('use-case', freeSlotFor('use-case', { x: 240, y: 140 })); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Plus size={16} />Caso de uso</button>
              <button type="button" onClick={(event) => { addNode('system-boundary', { x: 180, y: 90 }); event.currentTarget.closest('details')?.removeAttribute('open'); }}><SquareDashed size={16} />Límite del sistema</button>
            </div>
          </details>
          </div>
          <div className="toolbar-group">
          <button className="toolbar-icon-action" aria-label="Centrar vista" title="Centrar vista" type="button" onClick={centerDiagram}><Crosshair size={16} /></button>
          <button className="toolbar-icon-action" aria-label="Ver todo" title="Ajustar para ver todo" type="button" onClick={fitDiagram}><Maximize2 size={16} /></button>
          <details className="toolbar-menu" onToggle={handleToolbarMenuToggle}>
            <summary>Vista</summary>
            <div className="toolbar-menu-content">
              <button type="button" className={isGridEnabled ? 'active-tool' : ''} onClick={(event) => { setIsGridEnabled((enabled) => !enabled); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Grid3X3 size={17} />Grilla</button>
              <button type="button" className={isSnapEnabled ? 'active-tool' : ''} onClick={(event) => { setIsSnapEnabled((enabled) => !enabled); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Magnet size={17} />Ajustar a la grilla</button>
            </div>
          </details>
          </div>
          <div className="toolbar-group">
          <details className="toolbar-menu" onToggle={handleToolbarMenuToggle}>
            <summary>Archivo</summary>
            <div className="toolbar-menu-content file-menu">
              <button type="button" onClick={(event) => { exportProjectJson(); event.currentTarget.closest('details')?.removeAttribute('open'); }}><FileDown size={17} />Exportar JSON</button>
              <button type="button" onClick={(event) => { fileInputRef.current?.click(); event.currentTarget.closest('details')?.removeAttribute('open'); }}><FileUp size={17} />Importar JSON</button>
              <button type="button" onClick={(event) => { void exportPng(); event.currentTarget.closest('details')?.removeAttribute('open'); }}><ImageDown size={17} />Exportar PNG</button>
              <button type="button" onClick={(event) => { void exportPdf(); event.currentTarget.closest('details')?.removeAttribute('open'); }}><FileText size={17} />Exportar PDF</button>
            </div>
          </details>
          </div>
          <input ref={fileInputRef} accept="application/json,.json" className="hidden-file-input" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file !== undefined) void importProjectJson(file); }} />
        </div>
      </header>

      <div className={`editor-body ${selectedNode === null && selectedEdge === null ? 'inspector-hidden' : ''}`}>
        <div className="flow-canvas" ref={canvasRef}>
          <ReactFlow
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={null}
            edgeTypes={edgeTypes}
            edges={edges}
            maxZoom={2}
            minZoom={0.2}
            nodeTypes={nodeTypes}
            nodes={renderedNodes}
            nodesConnectable
            onConnect={onConnect}
            onEdgesChange={onEdgesChange}
            onInit={setReactFlowInstance}
            onNodesChange={onNodesChange}
            onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); setContextMenu(null); }}
            onPaneContextMenu={(event) => {
              if (reactFlowInstance === null || canvasRef.current === null) return;
              event.preventDefault();
              const bounds = canvasRef.current.getBoundingClientRect();
              setContextMenu({
                screenPosition: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
                flowPosition: reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
              });
            }}
            onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
              setSelectedNodeId(selectedNodes[0]?.id ?? null);
              setSelectedEdgeId(selectedEdges[0]?.id ?? null);
            }}
            proOptions={{ hideAttribution: true }}
            snapGrid={[20, 20]}
            snapToGrid={isSnapEnabled}
          >
            {isGridEnabled ? (
              <Background color="var(--canvas-grid-color, #e3e7ee)" gap={24} size={2} variant={BackgroundVariant.Dots} />
            ) : null}
            {renderedNodes.length === 0 ? (
              <CanvasStartCard
                title="Empezá por un actor"
                action={(
                  <>
                    <button className="secondary-action" type="button" onClick={() => addNode('actor', { x: 80, y: 120 })}>
                      <UserRound size={14} />Crear actor
                    </button>
                    <button className="secondary-action" type="button" onClick={() => addNode('use-case', { x: 240, y: 140 })}>
                      <Plus size={14} />Crear caso de uso
                    </button>
                  </>
                )}
              >
                Ubicá quién usa el sistema y qué puede hacer. Después uní actores con casos
                de uso, y agregá el límite del sistema para encerrarlos.
              </CanvasStartCard>
            ) : null}
            <CanvasControls label="Controles del modelo de casos de uso" />
            <MiniMap aria-label="Minimapa del modelo" pannable zoomable />
          </ReactFlow>
          {contextMenu !== null ? (
            <div className="canvas-context-menu" style={{ left: contextMenu.screenPosition.x, top: contextMenu.screenPosition.y }}>
              {contextMenu.nodeId === undefined ? (
                <>
                  <button type="button" onClick={() => { addNode('actor', contextMenu.flowPosition); setContextMenu(null); }}>Crear actor</button>
                  <button type="button" onClick={() => { addNode('use-case', contextMenu.flowPosition); setContextMenu(null); }}>Crear caso de uso</button>
                  <button type="button" onClick={() => { addNode('system-boundary', contextMenu.flowPosition); setContextMenu(null); }}>Crear límite del sistema</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => duplicateNode(contextMenu.nodeId ?? '')}>Duplicar</button>
                  <button type="button" onClick={() => deleteNode(contextMenu.nodeId ?? '')}>Eliminar</button>
                </>
              )}
            </div>
          ) : null}
        </div>

        {selectedNode !== null || selectedEdge !== null ? (
          <aside className="inspector">
            {selectedNode !== null ? (
              <section className="inspector-section">
                <p className="eyebrow">Propiedades</p>
                <h2>
                  {selectedNode.data.kind === 'actor' ? 'Actor' : selectedNode.data.kind === 'system-boundary' ? 'Límite del sistema' : 'Caso de uso'}
                </h2>
                <label className="field">
                  Nombre
                  <input value={selectedNode.data.name} onChange={(event) => renameNode(selectedNode.id, event.target.value)} />
                </label>
              </section>
            ) : null}
            {selectedEdge !== null ? (
              <section className="inspector-section">
                <p className="eyebrow">Propiedades</p>
                <h2>Relación</h2>
                <label className="field">
                  Tipo
                  <select
                    value={selectedEdge.data?.relationType ?? 'association'}
                    onChange={(event) => updateSelectedEdge({ relationType: event.target.value as UseCaseRelationType })}
                  >
                    {relationOptions.map((option) => (
                      <option key={option} value={option}>
                        {option === 'association' ? 'Asociación' : option === 'include' ? 'Include' : option === 'extend' ? 'Extend' : 'Generalización'}
                      </option>
                    ))}
                  </select>
                </label>
                {(selectedEdge.data?.relationType ?? 'association') === 'association' ? (
                  <label className="field">
                    Etiqueta
                    <input value={selectedEdge.data?.label ?? ''} onChange={(event) => updateSelectedEdge({ label: event.target.value })} placeholder="<i>" />
                  </label>
                ) : null}
                <button type="button" onClick={invertSelectedEdge}>Invertir dirección</button>
              </section>
            ) : null}
          </aside>
        ) : null}
      </div>
      {feedbackMessage !== null ? <div className="editor-feedback">{feedbackMessage}</div> : null}
    </main>
  );
}
