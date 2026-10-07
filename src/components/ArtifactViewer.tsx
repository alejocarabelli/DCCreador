import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, BackgroundVariant, ConnectionMode, ReactFlowProvider, type Edge, type Node, type NodeChange, type ReactFlowInstance } from 'reactflow';
import 'reactflow/dist/style.css';
import { SquarePen } from 'lucide-react';
import { CanvasControls } from './CanvasControls';
import { ClassNode } from './ClassNode';
import { AssociationEdge } from './AssociationEdge';
import { useGentleWheelZoom } from '../hooks/useGentleWheelZoom';
import { useTheme } from '../hooks/useTheme';
import { loadProjects } from '../storage/projectsStorage';
import { focusArtifactInMainWindow, isViewableArtifact, type ViewableArtifact } from '../storage/nativeWindows';
import { normalizeAssociationEdge } from '../utils/association';
import { normalizeDiagramContent } from '../utils/diagramNormalization';
import type { DiagramProject } from '../types/diagram';

const nodeTypes = { classNode: ClassNode };
const edgeTypes = { association: AssociationEdge };
const POLL_INTERVAL_MS = 1000;
const STORAGE_KEY = 'design-projects:v2';

const readRaw = (): string | null => {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
};

/**
 * Keeps the diagram as the main window last saved it. This window never writes
 * the projects: it only re-reads them, so it can never overwrite an edit.
 */
const useLiveProjects = (): DiagramProject[] => {
  const [state, setState] = useState(() => ({ raw: readRaw(), projects: loadProjects().projects }));
  const refresh = useCallback((): void => {
    const raw = readRaw();
    setState((current) => raw === current.raw ? current : { raw, projects: loadProjects().projects });
  }, []);
  useEffect(() => {
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);
  return state.projects;
};

function ViewerCanvas({ artifact }: { artifact: ViewableArtifact }) {
  const { theme } = useTheme();
  const [nodeSizes, setNodeSizes] = useState<Record<string, { width: number; height: number }>>({});
  const content = useMemo(() => normalizeDiagramContent(artifact.content), [artifact.content]);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  // The trackpad pinch arrives as Ctrl + wheel; the app's own zoom handles it.
  useGentleWheelZoom(canvasRef, instance, 0.1, 2);

  const nodes = useMemo<Node[]>(() => {
    const knownClassNames = content.nodes.map((node) => node.data.name.trim()).filter((name) => name.length > 0);
    return content.nodes.map((node) => ({
      ...node,
      ...(nodeSizes[node.id] ?? {}),
      draggable: false,
      selectable: false,
      data: { ...node.data, knownClassNames },
    }));
  }, [content.nodes, nodeSizes]);

  const edges = useMemo<Edge[]>(() => content.edges.map((rawEdge) => {
    const edge = normalizeAssociationEdge(rawEdge);
    return {
      ...edge,
      selectable: false,
      data: {
        ...edge.data,
        routingObstacles: content.nodes.map((node) => {
          // Same clearance the editor uses: 2px inside the ends, 8px around the rest.
          const inset = node.id === edge.source || node.id === edge.target ? 2 : -8;
          return {
            x: node.position.x + inset,
            y: node.position.y + inset,
            width: (nodeSizes[node.id]?.width ?? 220) - inset * 2,
            height: (nodeSizes[node.id]?.height ?? 100) - inset * 2,
          };
        }),
      },
    };
  }), [content.edges, content.nodes, nodeSizes]);

  const handleNodesChange = useCallback((changes: NodeChange[]): void => {
    const measured = changes.filter((change) => change.type === 'dimensions' && change.dimensions);
    if (measured.length === 0) return;
    setNodeSizes((current) => {
      const next = { ...current };
      let changed = false;
      for (const change of measured) {
        if (change.type !== 'dimensions' || !change.dimensions) continue;
        const { width, height } = change.dimensions;
        if (current[change.id]?.width !== width || current[change.id]?.height !== height) {
          next[change.id] = { width, height };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);

  return (
    <div className="artifact-viewer-flow" ref={canvasRef}>
    <ReactFlow
      onInit={setInstance}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={handleNodesChange}
      // Class handles are all of type source; Loose lets either end of an association attach to them.
      connectionMode={ConnectionMode.Loose}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      edgesUpdatable={false}
      deleteKeyCode={null}
      selectionKeyCode={null}
      panOnScroll
      zoomOnDoubleClick={false}
      minZoom={0.1}
      maxZoom={2}
      fitView
      fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
    >
      <Background color={theme.canvas.paperLine} gap={20} id="viewer-paper-fine" lineWidth={1} variant={BackgroundVariant.Lines} />
      <Background color={theme.canvas.paperLineStrong} gap={100} id="viewer-paper-strong" lineWidth={1} variant={BackgroundVariant.Lines} />
      <CanvasControls label="Zoom del diagrama" />
    </ReactFlow>
    </div>
  );
}

export function ArtifactViewer({ projectId, artifactId }: { projectId: string; artifactId: string }) {
  const { theme, themeStyle } = useTheme();
  const projects = useLiveProjects();
  const project = projects.find((candidate) => candidate.id === projectId);
  const artifact = project?.artifacts.find((candidate) => candidate.id === artifactId);

  useEffect(() => {
    document.title = artifact ? `${artifact.name} · vista` : 'Modelador de Sistemas';
  }, [artifact]);

  return (
    <div className="app-shell artifact-viewer" data-theme={theme.id} data-ui-version="refined" style={themeStyle}>
      <header className="artifact-viewer-bar">
        <div className="artifact-viewer-title">
          <strong>{artifact?.name ?? 'Diagrama no disponible'}</strong>
          {project ? <span>{project.name} · solo lectura</span> : null}
        </div>
        <button
          type="button"
          className="secondary-action"
          disabled={!artifact}
          onClick={() => focusArtifactInMainWindow(projectId, artifactId)}
        >
          <SquarePen aria-hidden="true" size={14} />Editar en la ventana principal
        </button>
      </header>
      <div className="artifact-viewer-canvas">
        {artifact && isViewableArtifact(artifact) ? (
          <ReactFlowProvider>
            <ViewerCanvas artifact={artifact} />
          </ReactFlowProvider>
        ) : (
          <p className="artifact-viewer-empty">
            {artifact ? 'Este tipo de diagrama todavía no se puede ver en una ventana aparte.' : 'Este diagrama ya no existe en el proyecto. Podés cerrar esta ventana.'}
          </p>
        )}
      </div>
    </div>
  );
}
