import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type SyntheticEvent } from 'react';
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
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
  type XYPosition,
} from 'reactflow';
import { toPng } from 'html-to-image';
import {
  Crosshair,
  FileDown,
  FileUp,
  Grid3X3,
  ImageDown,
  Magnet,
  Maximize2,
  Plus,
  Redo2,
  Undo2,
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
import { themes, type DiagramTheme, type DiagramThemeId } from '../theme/themes';
import { createId } from '../utils/id';
import { normalizeDiagramProject, normalizeUseCaseModelContent } from '../utils/diagramNormalization';
import { SystemBoundaryNode, UseCaseActorNode, UseCaseOvalNode } from './useCaseNodes';
import { UseCaseRelationEdge } from './UseCaseRelationEdge';

const GRID_ENABLED_KEY = 'class-diagram-grid-enabled';
const SNAP_ENABLED_KEY = 'class-diagram-snap-enabled';
const PNG_WIDTH = 1600;
const PNG_HEIGHT = 1000;

type UseCaseModelEditorProps = {
  artifact: UseCaseModelArtifact;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isImportableProject = (value: unknown): value is DiagramProject =>
  isRecord(value) && typeof value.name === 'string' && (Array.isArray(value.artifacts) || isRecord(value.content));

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
  canUndo,
  project,
  theme,
  themeId,
  onChangeContent,
  onImportProject,
  onRedo,
  onThemeChange,
  onUndo,
}: UseCaseModelEditorProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isGridEnabled, setIsGridEnabled] = useState(() => localStorage.getItem(GRID_ENABLED_KEY) !== 'false');
  const [isSnapEnabled, setIsSnapEnabled] = useState(() => localStorage.getItem(SNAP_ENABLED_KEY) === 'true');
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

  const updateNodes = (nextNodes: UseCaseModelNode[]): void => {
    commitContent({ nodes: nextNodes, edges });
  };

  const updateEdges = (nextEdges: UseCaseModelEdge[]): void => {
    commitContent({ nodes, edges: nextEdges });
  };

  const renameNode = (nodeId: string, name: string): void => {
    updateNodes(nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, name } } : node)));
  };

  const renderedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onOpenContextMenu: (nodeId: string, event: MouseEvent<HTMLElement>) => {
            const bounds = canvasRef.current?.getBoundingClientRect();
            if (bounds === undefined || reactFlowInstance === null) {
              return;
            }
            setContextMenu({
              nodeId,
              screenPosition: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
              flowPosition: reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
            });
          },
          onRename: renameNode,
        },
        zIndex: node.data.kind === 'system-boundary' ? 0 : 10,
      })),
    [nodes, reactFlowInstance],
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
    reactFlowInstance?.setCenter(0, 0, { duration: 300, zoom: reactFlowInstance.getZoom() });
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
        window.alert('El archivo no tiene la estructura de un proyecto.');
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
      edgePathStyleBackups.forEach(({ path }) => {
        const computedStyle = window.getComputedStyle(path);
        path.style.stroke = computedStyle.stroke;
        path.style.strokeWidth = computedStyle.strokeWidth;
        path.style.strokeDasharray = computedStyle.strokeDasharray;
      });
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
      link.download = `${project.name.trim() || 'diagrama'} - ${artifact.name.trim() || 'artefacto'}.png`;
      link.href = dataUrl;
      link.click();
      showFeedback('PNG exportado');
    } finally {
      edgePathStyleBackups.forEach(({ path, style }) => {
        if (style === null) {
          path.removeAttribute('style');
        } else {
          path.setAttribute('style', style);
        }
      });
      canvasRef.current.classList.remove('exporting-png');
    }
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
    localStorage.setItem(GRID_ENABLED_KEY, String(isGridEnabled));
  }, [isGridEnabled]);

  useEffect(() => {
    localStorage.setItem(SNAP_ENABLED_KEY, String(isSnapEnabled));
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
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

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
        <div className="editor-title-group">
          <p className="eyebrow">Proyecto abierto</p>
          <div className="project-artifact-header">
            <h2>{project.name}</h2>
            <span className="artifact-title-divider">/</span>
            <span className="active-artifact-title">{artifact.name}</span>
          </div>
        </div>
        <div className="editor-toolbar-actions">
          <button type="button" disabled={!canUndo} onClick={onUndo}><Undo2 size={17} />Deshacer</button>
          <button type="button" disabled={!canRedo} onClick={onRedo}><Redo2 size={17} />Rehacer</button>
          <button type="button" onClick={() => addNode('actor', { x: 80, y: 120 })}><Plus size={17} />Actor</button>
          <button type="button" onClick={() => addNode('use-case', { x: 240, y: 140 })}><Plus size={17} />Caso de uso</button>
          <button type="button" onClick={() => addNode('system-boundary', { x: 180, y: 90 })}><Plus size={17} />Límite</button>
          <button type="button" onClick={centerDiagram}><Crosshair size={17} />Centrar</button>
          <button type="button" onClick={fitDiagram}><Maximize2 size={17} />Ver todo</button>
          <details className="toolbar-menu" onToggle={handleToolbarMenuToggle}>
            <summary>Vista</summary>
            <div className="toolbar-menu-content">
              <button type="button" className={isGridEnabled ? 'active-tool' : ''} onClick={(event) => { setIsGridEnabled((enabled) => !enabled); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Grid3X3 size={17} />Grilla</button>
              <button type="button" className={isSnapEnabled ? 'active-tool' : ''} onClick={(event) => { setIsSnapEnabled((enabled) => !enabled); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Magnet size={17} />Snap</button>
            </div>
          </details>
          <details className="toolbar-menu" onToggle={handleToolbarMenuToggle}>
            <summary>Archivo</summary>
            <div className="toolbar-menu-content file-menu">
              <button type="button" onClick={(event) => { exportProjectJson(); event.currentTarget.closest('details')?.removeAttribute('open'); }}><FileDown size={17} />Exportar JSON</button>
              <button type="button" onClick={(event) => { fileInputRef.current?.click(); event.currentTarget.closest('details')?.removeAttribute('open'); }}><FileUp size={17} />Importar JSON</button>
              <button type="button" onClick={(event) => { void exportPng(); event.currentTarget.closest('details')?.removeAttribute('open'); }}><ImageDown size={17} />Exportar PNG</button>
            </div>
          </details>
          <details className="toolbar-menu" onToggle={handleToolbarMenuToggle}>
            <summary title={theme.description}>Tema</summary>
            <div className="toolbar-menu-content theme-menu">
              {themes.map((availableTheme) => (
                <button key={availableTheme.id} type="button" className={availableTheme.id === themeId ? 'active-tool' : ''} onClick={(event) => { onThemeChange(availableTheme.id as DiagramThemeId); event.currentTarget.closest('details')?.removeAttribute('open'); }}>
                  {availableTheme.name}
                </button>
              ))}
            </div>
          </details>
          <input ref={fileInputRef} accept="application/json,.json" className="hidden-file-input" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file !== undefined) void importProjectJson(file); }} />
        </div>
      </header>

      <div className={`editor-body ${selectedNode === null && selectedEdge === null ? 'inspector-hidden' : ''}`}>
        <div className="flow-canvas" ref={canvasRef}>
          <ReactFlow
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={['Backspace', 'Delete']}
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
            <Controls />
            <MiniMap pannable zoomable />
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
                <p className="eyebrow">
                  {selectedNode.data.kind === 'actor' ? 'Actor' : selectedNode.data.kind === 'system-boundary' ? 'Límite del sistema' : 'Caso de uso'}
                </p>
                <label className="field">
                  Nombre
                  <input value={selectedNode.data.name} onChange={(event) => renameNode(selectedNode.id, event.target.value)} />
                </label>
              </section>
            ) : null}
            {selectedEdge !== null ? (
              <section className="inspector-section">
                <p className="eyebrow">Relación MCU</p>
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
