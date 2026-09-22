import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  BoxSelect,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileDown,
  FileUp,
  ImageDown,
  Focus,
  Keyboard,
  Link2,
  LayoutTemplate,
  ListChecks,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  Ungroup,
  UserRoundPlus,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useEffectEvent, useMemo, useReducer, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type SetStateAction, type SyntheticEvent } from 'react';
import type { DiagramTheme, DiagramThemeId } from '../theme/themes';
import { CanvasStartCard } from './CanvasStartCard';
import { useDialogs } from '../hooks/useDialogs';
import { normalizeDiagramProject } from '../utils/diagramNormalization';
import { IMPORT_INVALID_MESSAGE, IMPORT_UNREADABLE_MESSAGE, isImportableProject } from '../utils/projectImport';
import type {
  ClassModelArtifact,
  ClassMethod,
  DesignProject,
  SequenceActivation,
  SequenceDiagramArtifact,
  SequenceDiagramContent,
  SequenceFragment,
  SequenceFragmentOperator,
  SequenceMessage,
  SequenceMessageType,
  SequenceNote,
  SequenceParticipant,
  SequenceParticipantColorMode,
  SequenceParticipantKind,
  SequenceTimelineItem,
  UseCaseFlowArtifact,
} from '../types/diagram';
import { SEQUENCE_NOTE_COLORS } from '../types/diagram';
import { createId } from '../utils/id';
import {
  createSequenceFragment,
  createSequenceMessage,
  adjustOperandsForOperator,
  analyzeSequenceDiagramSemantics,
  applySequenceDiagramMutation,
  clampParticipantX,
  cloneSequenceTimelineItems,
  duplicateSequenceItem,
  findSequenceItem,
  flattenSequenceItems,
  formatSequenceMessageLabel,
  formatSequenceParticipantName,
  getTopLevelBlockIds,
  insertSequenceItem,
  insertSequenceItemAtY,
  insertSequenceItemBefore,
  moveSequenceItem,
  moveSequenceItemsBlock,
  removeSequenceItem,
  removeSequenceItemsBlock,
  reparentSequenceItem,
  reconcileRemovedSequenceReferences,
  updateSequenceItem,
} from '../utils/sequenceDiagram';
import { getSequenceNoteMinimumHeight, reorderSequenceParticipants, resolveSequenceNoteRect } from '../utils/sequenceDiagramGeometry';
import { hasMeaningfulSequenceNoteDrag, resolveSequenceNoteDragPosition } from '../utils/sequenceNoteInteraction';
import { sequencePointerToCanvas } from '../utils/sequencePointer';
import { buildSequenceLayout, SEQUENCE_HEADER_HEIGHT } from '../utils/sequenceDiagramLayout';
import { defaultSequenceExportOptions, exportSequencePdf, exportSequencePng, type SequenceExportOptions } from '../utils/sequenceDiagramExport';
import {
  createSequenceMessageEditModel,
  buildSequenceMessageFromEditModel,
  formatMessageSignature,
  getSequenceFlowOptions,
  getSequenceMessageReferenceStatus,
  getSequenceMethodOptions,
  parseMessageSignature,
  reconcileMessageLifecycleMarkers,
  sequenceMessageEditModelFromMessage,
  sequenceMessageEditModelToPatch,
  swapSequenceMessageEditModel,
  updateSequenceMessageEditModel,
  type SequenceMessageEditModel,
  type SequenceMethodOption,
} from '../utils/sequenceMessageEditing';
import { areItemsContiguous, areItemsInSameContainer, findSequenceItemLocation, getOrderedSelectionInContainer, pruneSequenceSelection, replaceSequenceSelection, selectSequenceElement, toggleSequenceElement, type SequenceSelectionState, type SequenceSelectionTarget } from '../utils/sequenceDiagramSelection';
import {
  unwrapSequenceFragment,
  wrapSequenceItems,
  calculateFragmentBoundaryChanges,
  applyFragmentBoundaryChanges,
  validateFragmentBoundaryChanges,
  type FragmentBoundaryChanges,
  calculateFragmentMoveChanges,
  applyFragmentMoveChanges,
  validateFragmentMoveChanges,
  type FragmentMoveChanges,
} from '../utils/sequenceDiagramWrapping';
import {
  findBlockDropTarget,
  getBlockDropGuideY,
  getBlockContainerName,
  insertTimelineItemsAt,
  validateBlockCandidate,
} from '../utils/sequenceDiagramReordering';
import { SEQUENCE_TEMPLATES } from '../data/sequenceTemplates';
import type { DiagramSaveStatus } from '../hooks/useProjects';
import { centerSequenceViewportOnTarget, expandSequenceViewportAtEdge, type SequenceViewportTarget } from '../utils/sequenceViewport';
import {
  buildSequenceKeyboardInsertionSlots,
  createInactiveSequenceKeyboardState,
  findCompatibleSequenceReturnCalls,
  findFragmentOperand,
  findSequenceKeyboardSlotAfterItem,
  getSequenceKeyboardInstruction,
  getSequenceParticipantIdsAliveAtSlot,
  parseSequenceCreatedParticipant,
  parseSequenceKeyboardSignature,
  resolveKeyboardTargetMessageType,
  sequenceKeyboardCreateKinds,
  sequenceKeyboardFragmentOperators,
  sequenceKeyboardMessageTypes,
  sequenceKeyboardModeReducer,
} from '../utils/sequenceKeyboardMode';
import {
  createSequenceParticipantFromLabel,
  formatSequenceParticipantLabel,
  parseSequenceParticipantLabel,
  participantLabelIsValid,
} from '../utils/sequenceParticipantEditing';
import { EditorIdentity } from './EditorIdentity';
import { ToolbarHistory } from './ToolbarHistory';
import { SequenceDiagramCanvas } from './SequenceDiagramCanvas';
import { SequenceExportDialog } from './SequenceExportDialog';
import { SequenceKeyboardComposer } from './SequenceKeyboardComposer';
import { SequenceMessageDialog } from './SequenceMessageDialog';
import type { QuickMessageDraft } from '../utils/sequenceMessageDialogCompatibility';
import { SequenceReviewPanel } from './SequenceReviewPanel';
import { useFocusTrap } from '../hooks/useFocusTrap';

type SequenceSelection = SequenceSelectionTarget | null;

type SequenceDiagramEditorProps = {
  artifact: SequenceDiagramArtifact;
  canRedo: boolean;
  canUndo: boolean;
  project: DesignProject;
  theme: DiagramTheme;
  themeId: DiagramThemeId;
  saveStatus?: DiagramSaveStatus;
  onNavigateToArtifact?: (artifactId: string) => void;
  onCreateClassMethod?: (artifactId: string, nodeId: string, method: ClassMethod) => void;
  onCreateSequenceDiagramArtifact?: (name: string, initialContent?: SequenceDiagramContent) => void;
  onChangeContent: (content: SequenceDiagramContent, options?: { separateHistoryEntry?: boolean; alreadyNormalized?: boolean }) => void;
  onRedo: () => void;
  onUndo: () => void;
  onImportProject: (project: DesignProject) => void;
  onThemeChange: (themeId: DiagramThemeId) => void;
};

type MessageDraft = SequenceMessageEditModel;

const participantKindLabels: Record<SequenceParticipantKind, string> = {
  actor: 'Actor',
  boundary: 'Interfaz / boundary',
  control: 'Controlador',
  entity: 'Entidad',
  object: 'Objeto',
};

const messageTypeLabels: Record<SequenceMessageType, string> = {
  synchronous: 'Mensaje síncrono',
  asynchronous: 'Mensaje asíncrono',
  return: 'Retorno',
  create: 'create() · Crear objeto / DTO',
  destroy: 'Destruir línea de vida',
};

const fragmentLabels: Record<SequenceFragmentOperator, string> = {
  alt: 'alt · caminos alternativos',
  loop: 'loop · repetición',
  opt: 'opt · camino opcional',
  par: 'par · ejecución paralela',
  break: 'break · interrupción',
  critical: 'critical · sección crítica',
  ref: 'ref · otra interacción',
};

const sequenceOutlineVisibilityKey = 'modelador.sequence-outline-visible';

const readStoredSequenceOutlineVisibility = (): boolean | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(sequenceOutlineVisibilityKey);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    // The editor remains usable when storage is unavailable.
  }
  return null;
};

const getInitialSequenceOutlineVisibility = (): boolean => {
  const stored = readStoredSequenceOutlineVisibility();
  if (stored !== null) return stored;
  return typeof window === 'undefined' || !window.matchMedia('(max-width: 920px)').matches;
};

const downloadProjectJson = (project: DesignProject): void => {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name.trim() || 'proyecto'}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const updateNestedItemLocation = (
  items: SequenceTimelineItem[],
  itemId: string,
  destinationValue: string,
): SequenceTimelineItem[] => {
  if (destinationValue === 'root') return reparentSequenceItem(items, itemId);
  const [fragmentId, operandId] = destinationValue.split(':');
  return reparentSequenceItem(items, itemId, { fragmentId, operandId });
};

const findParentLocation = (content: SequenceDiagramContent, itemId: string): string => {
  const entry = flattenSequenceItems(content.items).find((candidate) => candidate.item.id === itemId);
  return entry?.parentFragmentId && entry.operandId ? `${entry.parentFragmentId}:${entry.operandId}` : 'root';
};

const countSequenceMessages = (items: SequenceTimelineItem[]): number =>
  flattenSequenceItems(items).filter((entry) => entry.item.kind === 'message').length;

const getSequenceStructuredItemLabel = (
  item: SequenceTimelineItem,
  participantNames: Map<string, string>,
): string => {
  if (item.kind === 'message') {
    const source = participantNames.get(item.sourceId) ?? 'participante no disponible';
    const target = participantNames.get(item.targetId) ?? 'participante no disponible';
    const label = item.type === 'return' ? 'retorno' : formatSequenceMessageLabel(item);
    return `${label}: ${source} a ${target}${item.flowReference ? `, referencia ${item.flowReference}` : ''}`;
  }
  const name = item.name ? `, ${item.name}` : '';
  const branches = item.operands.map((operand) => operand.guard || 'condición').join('; ');
  return `${item.operator}${name}, ramas: ${branches}`;
};

const sequenceItemMatchesSearch = (item: SequenceTimelineItem, query: string): boolean => {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  if (item.kind === 'message') {
    return `${item.name} ${item.arguments} ${item.flowReference}`.toLocaleLowerCase().includes(q);
  }
  const selfMatch = `${item.operator} ${item.name} ${item.operands.map((operand) => operand.guard).join(' ')}`.toLocaleLowerCase().includes(q);
  return selfMatch || item.operands.some((operand) => operand.items.some((child) => sequenceItemMatchesSearch(child, query)));
};

const isKeyboardTextTarget = (target: EventTarget | null): boolean =>
  target instanceof Element
  && target.closest('input, textarea, select, [contenteditable="true"], dialog, .sequence-keyboard-popover') !== null;

const moveCircular = <T,>(items: T[], current: T, direction: -1 | 1): T | undefined => {
  if (items.length === 0) return undefined;
  const currentIndex = Math.max(0, items.indexOf(current));
  return items[(currentIndex + direction + items.length) % items.length];
};

export function SequenceDiagramEditor({
  artifact,
  canRedo,
  canUndo,
  project,
  theme,
  saveStatus = 'saved',
  onNavigateToArtifact,
  onCreateClassMethod,
  onCreateSequenceDiagramArtifact,
  onChangeContent,
  onRedo,
  onUndo,
  onImportProject,
}: SequenceDiagramEditorProps) {
  const { confirm, notify } = useDialogs();
  const content = artifact.content;
  const [storedSelectionState, setStoredSelectionState] = useState<SequenceSelectionState>(() => selectSequenceElement(null));
  const selectionState = useMemo(
    () => pruneSequenceSelection(storedSelectionState, content),
    [content, storedSelectionState],
  );
  const setSelectionState = useCallback((next: SetStateAction<SequenceSelectionState>): void => {
    setStoredSelectionState((current) => {
      const validCurrent = pruneSequenceSelection(current, content);
      return typeof next === 'function' ? next(validCurrent) : next;
    });
  }, [content]);
  const selection = selectionState.primary;
  const selectedTimelineIds = useMemo(() => selectionState.elements
    .filter((element) => element.kind !== 'participant')
    .map((element) => element.id), [selectionState.elements]);
  const setSelection = useCallback((next: SequenceSelection): void => {
    setSelectionState(selectSequenceElement(next));
  }, [setSelectionState]);
  const setSelectedTimelineIds = useCallback((next: SetStateAction<string[]>): void => {
    setSelectionState((current) => {
      const currentIds = current.elements.filter((element) => element.kind !== 'participant').map((element) => element.id);
      const ids = typeof next === 'function' ? next(currentIds) : next;
      const elements = ids.flatMap((id): SequenceSelectionTarget[] => {
        const item = findSequenceItem(content.items, id);
        if (item) return [{ kind: item.kind, id }];
        if (content.notes.some((note) => note.id === id)) return [{ kind: 'note', id }];
        return [];
      });
      return replaceSequenceSelection(elements, current.primary);
    });
  }, [content.items, content.notes, setSelectionState]);
  const [insertionGuide, setInsertionGuide] = useState<{
    y: number;
    isValid: boolean;
    reason?: string;
    containerName?: string;
    bounds?: { x: number; width: number };
    containerBounds?: { x: number; width: number; top: number; bottom: number };
  } | null>(null);
  const [isReviewPanelOpen, setIsReviewPanelOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const templateDialogRef = useRef<HTMLDivElement | null>(null);
  const [messageDraft, setMessageDraft] = useState<MessageDraft | null>(null);
  const [quickMessage, setQuickMessage] = useState<QuickMessageDraft | null>(null);
  const [participantDraft, setParticipantDraft] = useState<{ editId?: string; text: string } | null>(null);
  const [participantEditDraft, setParticipantEditDraft] = useState<{ id: string; text: string } | null>(null);
  const outlinePreferenceRef = useRef(readStoredSequenceOutlineVisibility() !== null);
  const [outlineVisible, setOutlineVisible] = useState(getInitialSequenceOutlineVisibility);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(max-width: 700px)').matches;
  });
  const [inspectorWidth, setInspectorWidth] = useState(320);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedFragments, setCollapsedFragments] = useState<Set<string>>(() => new Set());
  const [zoom, setZoom] = useState(1);
  const [scrollPosition, setScrollPosition] = useState({ left: 0, top: 0 });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeFragmentResize, setActiveFragmentResize] = useState<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    isMove?: boolean;
    previewItems?: SequenceTimelineItem[];
  } | null>(null);
  const [boundaryResizePreview, setBoundaryResizePreview] = useState<{
    fragmentId: string;
    absorbedIds: string[];
    ejectedIds: string[];
    isValid: boolean;
    reason?: string;
    edge?: 'top' | 'bottom' | 'move';
    isReallocated?: boolean;
  } | null>(null);
  const [messageDragPreview, setMessageDragPreview] = useState<{
    messageId: string;
    followPointer: { x: number; y: number };
  } | { blockIds: string[]; items: SequenceTimelineItem[] } | null>(null);
  const [includingMessageOperandId, setIncludingMessageOperandId] = useState<string | null>(null);
  const [activeOperandId, setActiveOperandId] = useState<string | null>(null);
  const [includeSearchFilter, setIncludeSearchFilter] = useState('');
  const [inlineFragmentEditor, setInlineFragmentEditor] = useState<{
    kind: 'guard' | 'name';
    fragmentId: string;
    operandId?: string;
    value: string;
    x: number;
    y: number;
    width: number;
  } | null>(null);
  const [inlineNoteEditor, setInlineNoteEditor] = useState<{
    noteId: string;
    value: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [participantPreview, setParticipantPreview] = useState<Record<string, number>>({});
  const [notePreview, setNotePreview] = useState<Record<string, Partial<SequenceNote>>>({});
  const [draggedOutlineItemId, setDraggedOutlineItemId] = useState<string | null>(null);
  const [outlineDropTargetId, setOutlineDropTargetId] = useState<string | null>(null);
  const [highlightedSelection, setHighlightedSelection] = useState<SequenceSelection>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState<SequenceExportOptions>(defaultSequenceExportOptions);
  const [viewportCanvasSize, setViewportCanvasSize] = useState({ width: content.canvas.width, height: content.canvas.height });
  const [keyboardMode, dispatchKeyboardMode] = useReducer(
    sequenceKeyboardModeReducer,
    undefined,
    createInactiveSequenceKeyboardState,
  );
  const svgRef = useRef<SVGSVGElement | null>(null);
  const exportSvgRef = useRef<SVGSVGElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const editorRootRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toolbarRef = useRef<HTMLElement | null>(null);
  const canvasExpansionRef = useRef(0);
  const highlightTimeoutRef = useRef<number | null>(null);
  const blockClipboard = useRef<{ items: SequenceTimelineItem[]; notes: SequenceNote[] } | null>(null);
  const marqueeTipShownRef = useRef(false);

  useFocusTrap(templateDialogRef, isTemplatesOpen, () => setIsTemplatesOpen(false));

  useEffect(() => {
    const compactWindow = window.matchMedia('(max-width: 700px)');
    const syncInspectorForViewport = (): void => {
      if (compactWindow.matches) setInspectorCollapsed(true);
    };

    syncInspectorForViewport();
    compactWindow.addEventListener('change', syncInspectorForViewport);
    return () => compactWindow.removeEventListener('change', syncInspectorForViewport);
  }, []);

  const updateOutlineVisibility = useCallback((visible: boolean): void => {
    outlinePreferenceRef.current = true;
    setOutlineVisible(visible);
    try {
      window.localStorage.setItem(sequenceOutlineVisibilityKey, String(visible));
    } catch {
      // Keep the in-memory preference when storage is unavailable.
    }
  }, []);

  useEffect(() => {
    const compactWindow = window.matchMedia('(max-width: 920px)');
    const syncUnconfiguredOutline = (): void => {
      if (!outlinePreferenceRef.current) setOutlineVisible(!compactWindow.matches);
    };
    syncUnconfiguredOutline();
    compactWindow.addEventListener('change', syncUnconfiguredOutline);
    return () => compactWindow.removeEventListener('change', syncUnconfiguredOutline);
  }, []);

  const displayContent = useMemo<SequenceDiagramContent>(() => ({
    ...content,
    // The viewport may grow while the user pans. Keep this local state out of
    // the persisted content so reaching an edge never creates history.
    canvas: {
      width: Math.max(content.canvas.width, viewportCanvasSize.width),
      height: Math.max(content.canvas.height, viewportCanvasSize.height),
    },
    participants: content.participants.map((participant) => ({
      ...participant,
      x: participantPreview[participant.id] ?? participant.x,
    })),
    notes: content.notes.map((note) => ({ ...note, ...(notePreview[note.id] ?? {}) })),
  }), [content, viewportCanvasSize, participantPreview, notePreview]);
  const existingArtifactIds = useMemo(() => new Set(project.artifacts.map((candidate) => candidate.id)), [project.artifacts]);
  const semantics = useMemo(() => analyzeSequenceDiagramSemantics(content, {
    existingArtifactIds,
  }), [content, existingArtifactIds]);
  const flatEntries = useMemo(() => flattenSequenceItems(content.items), [content.items]);
  const baseLayout = useMemo(() => buildSequenceLayout(displayContent, semantics), [displayContent, semantics]);
  const interactionContent = useMemo(() => {
    const previewItems = messageDragPreview && 'items' in messageDragPreview
      ? messageDragPreview.items
      : activeFragmentResize?.previewItems;
    return previewItems === undefined ? displayContent : { ...displayContent, items: previewItems };
  }, [activeFragmentResize?.previewItems, displayContent, messageDragPreview]);
  const layout = useMemo(() => {
    if (messageDragPreview && 'items' in messageDragPreview) {
      return buildSequenceLayout(interactionContent);
    }
    if (messageDragPreview && 'followPointer' in messageDragPreview) {
      const messageLayout = baseLayout.messageLayouts.get(messageDragPreview.messageId);
      if (messageLayout) {
        const dy = messageDragPreview.followPointer.y - messageLayout.y;
        const nextMessageLayouts = new Map(baseLayout.messageLayouts);
        nextMessageLayouts.set(messageDragPreview.messageId, {
          ...messageLayout,
          y: messageDragPreview.followPointer.y,
          labelTop: messageLayout.labelTop + dy,
          labelBottom: messageLayout.labelBottom + dy,
          labelBaselineY: messageLayout.labelBaselineY + dy,
          flowBaselineY: messageLayout.flowBaselineY !== undefined ? messageLayout.flowBaselineY + dy : undefined,
        });
        return { ...baseLayout, messageLayouts: nextMessageLayouts };
      }
    }
    if (activeFragmentResize?.previewItems) {
      return buildSequenceLayout(interactionContent);
    }
    if (!activeFragmentResize) return baseLayout;
    const nextFragmentLayouts = new Map(baseLayout.fragmentLayouts);
    const origBox = baseLayout.fragmentLayouts.get(activeFragmentResize.id);
    let maxBottom = baseLayout.height;
    if (origBox) {
      const operands = activeFragmentResize.isMove
        ? (() => {
            const dy = activeFragmentResize.y - origBox.y;
            return origBox.operands.map((op) => ({
              ...op,
              top: op.top + dy,
              bottom: op.bottom + dy,
              contentTop: op.contentTop + dy,
            }));
          })()
        : (() => {
            const isTopMoved = activeFragmentResize.y !== origBox.y;
            const isBottomMoved = (activeFragmentResize.y + activeFragmentResize.height) !== (origBox.y + origBox.height);
            return origBox.operands.map((op, idx) => {
              let top = op.top;
              let bottom = op.bottom;
              if (idx === 0 && isTopMoved) {
                top = activeFragmentResize.y + origBox.headerHeight;
              }
              if (idx === origBox.operands.length - 1 && (isBottomMoved || isTopMoved)) {
                bottom = activeFragmentResize.y + activeFragmentResize.height;
              }
              const clampedTop = Math.min(top, bottom);
              const clampedBottom = Math.max(top, bottom);
              return {
                ...op,
                top: clampedTop,
                bottom: clampedBottom,
                contentTop: clampedTop + op.guardHeight,
              };
            });
          })();
      nextFragmentLayouts.set(activeFragmentResize.id, {
        ...origBox,
        x: activeFragmentResize.x,
        y: activeFragmentResize.y,
        width: activeFragmentResize.width,
        height: activeFragmentResize.height,
        operands,
      });
      maxBottom = Math.max(baseLayout.height, activeFragmentResize.y + activeFragmentResize.height + 80);

      // If the resizing fragment is nested, expand ancestor fragments so the parent smoothly encloses the growing child
      let currentChildId = activeFragmentResize.id;
      let currentBottom = activeFragmentResize.y + activeFragmentResize.height;
      while (currentChildId) {
        const loc = findSequenceItemLocation(content.items, currentChildId);
        if (!loc || loc.containerId === 'root') break;
        const parentEntry = flatEntries.find((e) =>
          e.item.kind === 'fragment' && e.item.operands.some((op) => op.id === loc.containerId),
        );
        if (!parentEntry || parentEntry.item.kind !== 'fragment') break;
        const parentFrag = parentEntry.item;
        const parentBox = nextFragmentLayouts.get(parentFrag.id);
        if (parentBox) {
          const neededBottom = currentBottom + 24;
          if (neededBottom > parentBox.y + parentBox.height) {
            const newHeight = neededBottom - parentBox.y;
            const updatedParentOperands = parentBox.operands.map((op) => {
              if (op.id === loc.containerId) {
                return { ...op, bottom: Math.max(op.bottom, neededBottom) };
              }
              return op;
            });
            nextFragmentLayouts.set(parentFrag.id, {
              ...parentBox,
              height: newHeight,
              operands: updatedParentOperands,
            });
            currentBottom = neededBottom;
          }
        }
        currentChildId = parentFrag.id;
      }
    }
    return {
      ...baseLayout,
      height: maxBottom,
      fragmentLayouts: nextFragmentLayouts,
    };
  }, [baseLayout, activeFragmentResize, messageDragPreview, content, interactionContent, flatEntries]);
  const keyboardSlots = useMemo(() => buildSequenceKeyboardInsertionSlots(content, layout), [content, layout]);
  const keyboardSlot = keyboardSlots[Math.min(keyboardMode.slotIndex, Math.max(0, keyboardSlots.length - 1))];
  const keyboardAliveParticipantIds = useMemo(() => keyboardSlot
    ? getSequenceParticipantIdsAliveAtSlot(content, layout, keyboardSlot)
    : [], [content, keyboardSlot, layout]);
  const keyboardParticipantIds = useMemo(() => content.participants
    .filter((participant) => keyboardAliveParticipantIds.includes(participant.id))
    .sort((left, right) => left.x - right.x)
    .map((participant) => participant.id), [content.participants, keyboardAliveParticipantIds]);
  const classDiagrams = project.artifacts.filter((candidate): candidate is ClassModelArtifact =>
    candidate.type === 'class-diagram' || candidate.type === 'class-sequence-diagram',
  );
  const flows = project.artifacts.filter((candidate): candidate is UseCaseFlowArtifact => candidate.type === 'use-case-flow');
  const otherSequenceDiagrams = useMemo(() =>
    project.artifacts.filter((candidate): candidate is SequenceDiagramArtifact =>
      candidate.type === 'sequence-diagram' && candidate.id !== artifact.id
    ),
  [project.artifacts, artifact.id]);
  // With no reference chosen, a project's only class diagram is the model: its
  // methods feed the message suggestions without a trip to the settings.
  const plainClassDiagrams = classDiagrams.filter((candidate) => candidate.type === 'class-diagram');
  const defaultClassDiagram = content.classDiagramArtifactId === undefined && plainClassDiagrams.length === 1
    ? plainClassDiagrams[0]
    : undefined;
  const associatedClassDiagram = classDiagrams.find((candidate) => candidate.id === content.classDiagramArtifactId) ?? defaultClassDiagram;
  // A small lookup; the React compiler memoizes it with the diagram it reads.
  const classNodesById = new Map<string, { name: string }>(
    (Array.isArray(associatedClassDiagram?.content?.nodes) ? associatedClassDiagram.content.nodes : [])
      .map((node) => [node.id, { name: node.data.name }]),
  );
  const selectedItem = selection?.kind === 'message' || selection?.kind === 'fragment'
    ? findSequenceItem(content.items, selection.id)
    : null;
  const selectedParticipant = selection?.kind === 'participant'
    ? content.participants.find((participant) => participant.id === selection.id)
    : undefined;
  const participantEditText = selectedParticipant
    ? participantEditDraft?.id === selectedParticipant.id
      ? participantEditDraft.text
      : formatSequenceParticipantLabel(selectedParticipant)
    : '';
  const selectedNote = selection?.kind === 'note' ? content.notes.find((note) => note.id === selection.id) : undefined;
  const methodOptions: SequenceMethodOption[] = selectedItem?.kind === 'message'
    ? getSequenceMethodOptions({ model: selectedItem, participants: content.participants, classDiagram: associatedClassDiagram })
    : [];
  const quickMessageMethodOptions: SequenceMethodOption[] = quickMessage
    ? getSequenceMethodOptions({ model: quickMessage, participants: content.participants, classDiagram: associatedClassDiagram })
    : [];
  const messageDraftMethodOptions: SequenceMethodOption[] = messageDraft
    ? getSequenceMethodOptions({ model: messageDraft, participants: content.participants, classDiagram: associatedClassDiagram })
    : [];
  const keyboardMessageModel = keyboardMode.stage === 'aim' || keyboardMode.stage === 'typing'
    ? createSequenceMessageEditModel({
        type: keyboardMode.messageType,
        sourceId: keyboardMode.sourceId,
        targetId: keyboardMode.targetId,
      })
    : undefined;
  const keyboardMethodOptions: SequenceMethodOption[] = keyboardMessageModel
    ? getSequenceMethodOptions({ model: keyboardMessageModel, participants: content.participants, classDiagram: associatedClassDiagram })
    : [];
  const flowOptions = getSequenceFlowOptions(flows, content.flowArtifactId);
  const selectedMessageReferenceStatus = selectedItem?.kind === 'message'
    ? getSequenceMessageReferenceStatus(selectedItem, methodOptions, flowOptions, content.flowArtifactId)
    : undefined;
  const quickMessageReferenceStatus = quickMessage
    ? getSequenceMessageReferenceStatus(quickMessage, quickMessageMethodOptions, flowOptions, content.flowArtifactId)
    : undefined;
  const messageDraftReferenceStatus = messageDraft
    ? getSequenceMessageReferenceStatus(messageDraft, messageDraftMethodOptions, flowOptions, content.flowArtifactId)
    : undefined;
  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback((current) => current === message ? null : current), 2400);
  }, []);

  const commit = useCallback((next: SequenceDiagramContent, separateHistoryEntry = true): boolean => {
    const reconciled = reconcileRemovedSequenceReferences(content, next);
    const result = applySequenceDiagramMutation(content, reconciled);
    if (!result.accepted) {
      showFeedback(result.newProblems[0]?.message ?? 'La modificación generaría un problema temporal.');
      return false;
    }
    onChangeContent(result.content, { separateHistoryEntry, alreadyNormalized: true });
    return true;
  }, [content, onChangeContent, showFeedback]);

  const keepAnchoredNotesWithTimeline = useCallback((next: SequenceDiagramContent): SequenceDiagramContent => {
    const beforeLayout = buildSequenceLayout(content);
    const afterLayout = buildSequenceLayout(next);
    const anchorY = (diagramLayout: ReturnType<typeof buildSequenceLayout>, note: SequenceNote): number | undefined => {
      if (note.anchorKind === 'message' && note.anchorId) return diagramLayout.messageLayouts.get(note.anchorId)?.y;
      if (note.anchorKind === 'fragment' && note.anchorId) return diagramLayout.fragmentLayouts.get(note.anchorId)?.y;
      return undefined;
    };
    return {
      ...next,
      notes: next.notes.map((note) => {
        const beforeY = anchorY(beforeLayout, note);
        const afterY = anchorY(afterLayout, note);
        return beforeY === undefined || afterY === undefined ? note : { ...note, y: note.y + afterY - beforeY };
      }),
    };
  }, [content]);

  const activateKeyboardMode = useCallback((): void => {
    const selectedTimelineItem = selection?.kind === 'message' || selection?.kind === 'fragment'
      ? findSequenceItem(content.items, selection.id)
      : undefined;
    const slotIndex = selectedTimelineItem
      ? findSequenceKeyboardSlotAfterItem(keyboardSlots, selectedTimelineItem.id)
      : Math.max(0, keyboardSlots.length - 1);
    const sortedParticipants = [...content.participants].sort((left, right) => left.x - right.x);
    const sourceId = selection?.kind === 'participant'
      ? selection.id
      : selectedTimelineItem?.kind === 'message'
        ? selectedTimelineItem.targetId
        : sortedParticipants[0]?.id ?? '';
    setMessageDraft(null);
    setQuickMessage(null);
    setParticipantDraft(null);
    dispatchKeyboardMode({ type: 'activate', slotIndex, sourceId });
    window.requestAnimationFrame(() => svgRef.current?.focus());
  }, [content.items, content.participants, keyboardSlots, selection]);

  const commitKeyboardParticipant = useCallback((): void => {
    const participant = createSequenceParticipantFromLabel({
      text: keyboardMode.text,
      participants: content.participants,
    });
    if (!participant) {
      showFeedback('Escribí una clase válida después de “:”.');
      return;
    }
    const saved = commit({ ...content, participants: [...content.participants, participant] });
    if (!saved) return;
    setSelection({ kind: 'participant', id: participant.id });
    dispatchKeyboardMode({
      type: 'committed',
      slotIndex: keyboardMode.slotIndex,
      sourceId: participant.id,
    });
    showFeedback(`Participante ${formatSequenceParticipantLabel(participant)} creado.`);
  }, [commit, content, keyboardMode.slotIndex, keyboardMode.text, setSelection, showFeedback]);

  const beginKeyboardMessage = useCallback((type: SequenceMessageType): void => {
    if (!keyboardSlot) return;
    if (type === 'return') {
      const calls = findCompatibleSequenceReturnCalls(content, layout, keyboardSlot, keyboardMode.sourceId);
      const sourceIndex = keyboardParticipantIds.indexOf(keyboardMode.sourceId);
      const leftTarget = sourceIndex > 0 ? keyboardParticipantIds[sourceIndex - 1] : undefined;
      const rightTarget = sourceIndex >= 0 && sourceIndex < keyboardParticipantIds.length - 1
        ? keyboardParticipantIds[sourceIndex + 1]
        : undefined;
      const defaultTarget = calls[0]?.sourceId
        ?? leftTarget
        ?? rightTarget
        ?? keyboardMode.sourceId;
      dispatchKeyboardMode({
        type: 'begin',
        messageType: 'return',
        targetId: defaultTarget,
        returnCandidateIds: calls.map((call) => call.id),
        preserveEdit: Boolean(keyboardMode.editId),
      });
      return;
    }
    const defaultTarget = type === 'create'
      ? ''
      : keyboardParticipantIds.includes(keyboardMode.sourceId)
        ? keyboardMode.sourceId
        : keyboardParticipantIds[0] ?? keyboardMode.sourceId;
    dispatchKeyboardMode({ type: 'begin', messageType: type, targetId: defaultTarget });
  }, [content, keyboardMode.editId, keyboardMode.sourceId, keyboardParticipantIds, keyboardSlot, layout]);

  const setKeyboardMessageType = useCallback((type: SequenceMessageType): void => {
    if (type === 'return') {
      const calls = findCompatibleSequenceReturnCalls(content, layout, keyboardSlot, keyboardMode.sourceId);
      const defaultTarget = calls[0]?.sourceId
        ?? keyboardParticipantIds.find((id) => id !== keyboardMode.sourceId)
        ?? keyboardMode.sourceId;
      dispatchKeyboardMode({
        type: 'set-route',
        messageType: 'return',
        targetId: defaultTarget,
        returnCandidateIds: calls.map((call) => call.id),
        returnCandidateIndex: 0,
      });
      return;
    }
    dispatchKeyboardMode({
      type: 'set-route',
      messageType: type,
      targetId: type === 'create'
        ? ''
        : keyboardMode.targetId || keyboardParticipantIds[0] || keyboardMode.sourceId,
      returnCandidateIds: [],
      returnCandidateIndex: 0,
    });
  }, [content, keyboardMode.sourceId, keyboardMode.targetId, keyboardParticipantIds, keyboardSlot, layout]);

  const moveKeyboardSlot = useCallback((direction: -1 | 1, extendSelection = false): void => {
    if (!keyboardSlot || keyboardSlots.length === 0) return;
    const nextIndex = Math.max(0, Math.min(keyboardSlots.length - 1, keyboardMode.slotIndex + direction));
    if (nextIndex === keyboardMode.slotIndex) return;
    const nextSlot = keyboardSlots[nextIndex];
    if (extendSelection) {
      if (nextSlot.containerId !== keyboardSlot.containerId) {
        showFeedback('La selección por teclado no puede atravesar ramas distintas.');
        return;
      }
      const crossedId = direction > 0
        ? keyboardSlot.itemIds[keyboardSlot.index]
        : keyboardSlot.itemIds[keyboardSlot.index - 1];
      if (crossedId) {
        const crossed = findSequenceItem(content.items, crossedId);
        if (crossed) {
          setSelectionState((current) => toggleSequenceElement(current, { kind: crossed.kind, id: crossed.id }));
        }
      }
    } else {
      const focusedId = nextSlot.itemIds[nextSlot.index - 1] ?? nextSlot.itemIds[nextSlot.index];
      const focused = focusedId ? findSequenceItem(content.items, focusedId) : undefined;
      if (focused) setSelection({ kind: focused.kind, id: focused.id });
    }
    const aliveAtNextSlot = getSequenceParticipantIdsAliveAtSlot(content, layout, nextSlot);
    const nextSource = aliveAtNextSlot.includes(keyboardMode.sourceId)
      ? keyboardMode.sourceId
      : content.participants.find((participant) => aliveAtNextSlot.includes(participant.id))?.id ?? keyboardMode.sourceId;
    dispatchKeyboardMode({ type: 'navigate', slotIndex: nextIndex, sourceId: nextSource });
  }, [content, keyboardMode.slotIndex, keyboardMode.sourceId, keyboardSlot, keyboardSlots, layout, setSelection, setSelectionState, showFeedback]);

  const moveKeyboardParticipant = useCallback((direction: -1 | 1, target = false): void => {
    if (keyboardParticipantIds.length === 0) return;
    if (target && keyboardMode.messageType === 'create') {
      dispatchKeyboardMode({ type: 'set-route', createSide: direction });
      return;
    }
    const currentId = target ? (keyboardMode.targetId || keyboardMode.sourceId) : keyboardMode.sourceId;
    const nextId = moveCircular(keyboardParticipantIds, currentId, direction);
    if (!nextId) return;
    if (!target) {
      dispatchKeyboardMode({ type: 'navigate', sourceId: nextId });
      return;
    }

    const sourceIndex = keyboardParticipantIds.indexOf(keyboardMode.sourceId);
    const targetIndex = keyboardParticipantIds.indexOf(nextId);
    const resolvedType = resolveKeyboardTargetMessageType(sourceIndex, targetIndex, keyboardMode.messageType);
    if (resolvedType === 'return' && targetIndex < sourceIndex) {
      const calls = keyboardSlot
        ? findCompatibleSequenceReturnCalls(content, layout, keyboardSlot, keyboardMode.sourceId)
        : [];
      const targetCalls = calls.filter((call) => call.sourceId === nextId);
      dispatchKeyboardMode({
        type: 'set-route',
        targetId: nextId,
        messageType: 'return',
        returnCandidateIds: targetCalls.length > 0 ? targetCalls.map((call) => call.id) : calls.map((call) => call.id),
        returnCandidateIndex: 0,
      });
    } else if (resolvedType === 'synchronous' && targetIndex > sourceIndex) {
      dispatchKeyboardMode({
        type: 'set-route',
        targetId: nextId,
        messageType: 'synchronous',
        returnCandidateIds: [],
        returnCandidateIndex: 0,
      });
    } else {
      dispatchKeyboardMode({
        type: 'set-route',
        targetId: nextId,
      });
    }
  }, [content, keyboardMode.messageType, keyboardMode.sourceId, keyboardMode.targetId, keyboardParticipantIds, keyboardSlot, layout]);

  const openKeyboardEdit = useCallback((): void => {
    if (!keyboardSlot) return;
    const itemId = keyboardSlot.itemIds[keyboardSlot.index - 1] ?? keyboardSlot.itemIds[keyboardSlot.index];
    const message = itemId ? findSequenceItem(content.items, itemId) : undefined;
    if (message?.kind !== 'message') {
      showFeedback('Ubicá el cursor junto a un mensaje para editarlo.');
      return;
    }
    const text = message.type === 'return'
      ? ''
      : message.type === 'create'
        ? formatSequenceParticipantName(content.participants.find((participant) => participant.id === message.targetId) ?? {
            id: message.targetId,
            kind: 'object',
            name: '',
            classifierName: 'Objeto',
            x: 0,
          })
        : formatSequenceMessageLabel(message);
    dispatchKeyboardMode({ type: 'navigate', sourceId: message.sourceId });
    dispatchKeyboardMode({ type: 'begin', messageType: message.type, targetId: message.targetId, returnCandidateIds: message.replyToMessageId ? [message.replyToMessageId] : [] });
    const createdParticipant = message.type === 'create'
      ? content.participants.find((participant) => participant.id === message.targetId)
      : undefined;
    if (createdParticipant && createdParticipant.kind !== 'actor') {
      dispatchKeyboardMode({ type: 'set-create-kind', createKind: createdParticipant.kind });
    }
    dispatchKeyboardMode({ type: 'start-typing', text, editId: message.id, operationMethodId: message.operationMethodId });
    setSelection({ kind: 'message', id: message.id });
  }, [content.items, content.participants, keyboardSlot, setSelection, showFeedback]);

  const commitKeyboardGuard = useCallback((): void => {
    if (!keyboardMode.guardFragmentId || !keyboardMode.guardOperandId) return;
    const nextItems = updateSequenceItem(content.items, keyboardMode.guardFragmentId, (item) => {
      if (item.kind !== 'fragment') return item;
      return {
        ...item,
        operands: item.operands.map((operand) => operand.id === keyboardMode.guardOperandId
          ? { ...operand, guard: keyboardMode.guardText }
          : operand),
      };
    });
    if (commit(keepAnchoredNotesWithTimeline({ ...content, items: nextItems }))) {
      dispatchKeyboardMode({ type: 'navigate' });
      showFeedback('Guarda actualizada.');
    }
  }, [commit, content, keepAnchoredNotesWithTimeline, keyboardMode.guardFragmentId, keyboardMode.guardOperandId, keyboardMode.guardText, showFeedback]);

  const commitKeyboardFragment = useCallback((): void => {
    if (!keyboardSlot) return;
    if (selectedTimelineIds.length > 0) {
      const result = wrapSequenceItems(content.items, selectedTimelineIds, keyboardMode.fragmentOperator);
      if (!result) {
        showFeedback('Los elementos deben ser contiguos y pertenecer a la misma rama.');
        return;
      }
      const nextContent = keepAnchoredNotesWithTimeline({ ...content, items: result.items });
      if (commit(nextContent)) {
        const nextSlots = buildSequenceKeyboardInsertionSlots(nextContent, buildSequenceLayout(nextContent));
        setSelectedTimelineIds([]);
        setSelection({ kind: 'fragment', id: result.createdFragment.id });
        dispatchKeyboardMode({
          type: 'committed',
          slotIndex: findSequenceKeyboardSlotAfterItem(nextSlots, result.createdFragment.id),
          sourceId: keyboardMode.sourceId,
        });
        showFeedback(`Fragmento ${keyboardMode.fragmentOperator} creado.`);
      }
      return;
    }
    const fragment = createSequenceFragment(keyboardMode.fragmentOperator);
    const items = insertSequenceItemAtY(content.items, fragment, layout, keyboardSlot.y);
    const nextContent = keepAnchoredNotesWithTimeline({ ...content, items });
    if (commit(nextContent)) {
      const nextSlots = buildSequenceKeyboardInsertionSlots(nextContent, buildSequenceLayout(nextContent));
      setSelection({ kind: 'fragment', id: fragment.id });
      dispatchKeyboardMode({
        type: 'committed',
        slotIndex: findSequenceKeyboardSlotAfterItem(nextSlots, fragment.id),
        sourceId: keyboardMode.sourceId,
      });
      showFeedback(`Fragmento ${keyboardMode.fragmentOperator} creado.`);
    }
  }, [commit, content, keepAnchoredNotesWithTimeline, keyboardMode.fragmentOperator, keyboardMode.sourceId, keyboardSlot, layout, selectedTimelineIds, setSelectedTimelineIds, setSelection, showFeedback]);

  const commitKeyboardMessage = useCallback((addAutomaticReturn = false): void => {
    if (!keyboardSlot || (keyboardMode.stage !== 'aim' && keyboardMode.stage !== 'typing')) return;
    if (keyboardMode.stage === 'aim' && keyboardMode.messageType !== 'destroy' && keyboardMode.messageType !== 'return') {
      dispatchKeyboardMode({ type: 'start-typing' });
      return;
    }

    let participants = [...content.participants];
    let targetId = keyboardMode.targetId;
    let createdParticipant: SequenceParticipant | undefined;
    const sourceId = keyboardMode.sourceId;

    if (keyboardMode.messageType === 'create' && !keyboardMode.editId) {
      createdParticipant = createSequenceParticipantFromLabel({
        text: keyboardMode.text,
        participants: content.participants,
        side: keyboardMode.createSide,
        kind: keyboardMode.createKind,
        terminateLifeline: true,
      }) ?? undefined;
      if (!createdParticipant) {
        showFeedback('Escribí una identificación válida, por ejemplo pedido:Pedido.');
        return;
      }
      targetId = createdParticipant.id;
      participants.push(createdParticipant);
    } else if (keyboardMode.messageType === 'create' && keyboardMode.editId && targetId) {
      const parsed = parseSequenceParticipantLabel(keyboardMode.text);
      if (!participantLabelIsValid(parsed)) {
        showFeedback('Escribí una identificación válida, por ejemplo pedido:Pedido.');
        return;
      }
      participants = participants.map((participant) => participant.id === targetId
        ? {
            ...participant,
            kind: keyboardMode.createKind,
            name: parsed.instanceName,
            classifierName: parsed.classifierName,
          }
        : participant);
    }

    if (!sourceId || !targetId) {
      showFeedback('Elegí un origen y un destino válidos.');
      return;
    }

    const signature = parseSequenceKeyboardSignature(keyboardMode.text);
    const replyToMessageId = keyboardMode.messageType === 'return'
      ? keyboardMode.returnCandidateIds[keyboardMode.returnCandidateIndex]
      : undefined;
    const message = buildSequenceMessageFromEditModel(createSequenceMessageEditModel({
      type: keyboardMode.messageType,
      sourceId,
      targetId,
      name: keyboardMode.messageType === 'create' ? 'create' : signature.name,
      arguments: keyboardMode.messageType === 'create' ? '' : signature.arguments,
      returnType: keyboardMode.messageType === 'create' ? '' : signature.returnType,
      operationMethodId: keyboardMode.operationMethodId,
      replyToMessageId,
    }), keyboardMode.editId);

    let items: SequenceTimelineItem[];
    if (keyboardMode.editId) {
      items = updateSequenceItem(content.items, keyboardMode.editId, (item) => item.kind === 'message'
        ? ({ ...item, ...sequenceMessageEditModelToPatch({ ...sequenceMessageEditModelFromMessage(item), ...message, editId: item.id }) } as SequenceMessage)
        : item);
    } else {
      const insertionLayout = createdParticipant
        ? buildSequenceLayout({ ...content, participants })
        : layout;
      items = insertSequenceItemAtY(content.items, message, insertionLayout, keyboardSlot.y);
    }

    if (createdParticipant) createdParticipant.createdByMessageId = message.id;
    const previousMessage = keyboardMode.editId ? findSequenceItem(content.items, keyboardMode.editId) : undefined;
    participants = reconcileMessageLifecycleMarkers(
      participants,
      message,
      previousMessage?.kind === 'message' ? previousMessage : undefined,
    );

    let selectionId = keyboardMode.editId ?? message.id;
    let automaticReturnId: string | undefined;
    if (addAutomaticReturn && keyboardMode.messageType === 'synchronous' && !keyboardMode.editId) {
      const reply = createSequenceMessage('return', targetId, sourceId);
      reply.replyToMessageId = message.id;
      items = insertSequenceItem(items, reply, { afterItemId: message.id });
      selectionId = reply.id;
      automaticReturnId = reply.id;
    }

    const candidate = keepAnchoredNotesWithTimeline({ ...content, participants, items });
    const savedMessageId = keyboardMode.editId ?? message.id;
    if (keyboardMode.messageType === 'return' && analyzeSequenceDiagramSemantics(candidate).problems.some((problem) => (
      problem.severity === 'error' && problem.messageId === savedMessageId
    ))) {
      showFeedback('Ese retorno genera un error de ciclo de vida.');
      return;
    }
    if (automaticReturnId && analyzeSequenceDiagramSemantics(candidate).problems.some((problem) => (
      problem.code === 'unmatched-return' && problem.messageId === automaticReturnId
    ))) {
      showFeedback('No se puede crear el retorno automático en este punto: el receptor no tiene una llamada compatible abierta.');
      return;
    }

    const saved = commit(candidate);
    if (!saved) return;

    const nextSource = addAutomaticReturn && keyboardMode.messageType === 'synchronous'
      ? sourceId
      : keyboardMode.messageType === 'asynchronous' || keyboardMode.messageType === 'destroy'
        ? sourceId
        : targetId;
    const nextSlots = buildSequenceKeyboardInsertionSlots(candidate, buildSequenceLayout(candidate));
    setSelection({ kind: 'message', id: selectionId });
    dispatchKeyboardMode({
      type: 'committed',
      slotIndex: findSequenceKeyboardSlotAfterItem(nextSlots, selectionId),
      sourceId: nextSource,
    });
    showFeedback(addAutomaticReturn && keyboardMode.messageType === 'synchronous'
      ? 'Llamada y retorno creados.'
      : keyboardMode.editId ? 'Mensaje actualizado.' : 'Mensaje creado.');
  }, [commit, content, keepAnchoredNotesWithTimeline, keyboardMode, keyboardSlot, layout, setSelection, showFeedback]);

  useEffect(() => {
    if (keyboardMode.stage === 'off') return;
    if (keyboardMode.slotIndex < keyboardSlots.length) return;
    dispatchKeyboardMode({ type: 'navigate', slotIndex: Math.max(0, keyboardSlots.length - 1) });
  }, [keyboardMode.slotIndex, keyboardMode.stage, keyboardSlots.length]);

  const handleKeyboardMode = useEffectEvent((event: KeyboardEvent): void => {
      const editableTarget = isKeyboardTextTarget(event.target);
      const key = event.key.toLocaleLowerCase();

      if (keyboardMode.stage === 'off') {
        const activeElement = document.activeElement;
        const editorHasFocus = activeElement === document.body || (activeElement !== null && editorRootRef.current?.contains(activeElement));
        if (key === 'm' && !editableTarget && editorHasFocus && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          activateKeyboardMode();
        }
        return;
      }

      if (editableTarget) return;

      if (key === 'm' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        dispatchKeyboardMode({ type: 'deactivate' });
        showFeedback('Modo mensajes desactivado.');
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        dispatchKeyboardMode({ type: 'back' });
        return;
      }

      if (keyboardMode.stage === 'navigate') {
        if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.altKey) {
          event.preventDefault();
          moveKeyboardSlot(event.key === 'ArrowUp' ? -1 : 1, event.shiftKey);
          return;
        }
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.altKey) {
          event.preventDefault();
          moveKeyboardParticipant(event.key === 'ArrowLeft' ? -1 : 1);
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          beginKeyboardMessage('synchronous');
          return;
        }
        if (key === 's' || key === 'r' || key === 'c' || key === 'd') {
          event.preventDefault();
          const typeByKey: Record<string, SequenceMessageType> = {
            s: 'synchronous',
            r: 'return',
            c: 'create',
            d: 'destroy',
          };
          beginKeyboardMessage(typeByKey[key]);
          return;
        }
        if (key === 'f') {
          event.preventDefault();
          dispatchKeyboardMode({ type: 'open-fragment' });
          return;
        }
        if (key === 'p') {
          event.preventDefault();
          dispatchKeyboardMode({ type: 'begin-participant' });
          return;
        }
        if (key === 'e') {
          event.preventDefault();
          openKeyboardEdit();
          return;
        }
        if (key === 'g' && keyboardSlot?.operandId) {
          const operandInfo = findFragmentOperand(content.items, keyboardSlot.operandId);
          const operand = operandInfo?.fragment.operands[operandInfo.operandIndex];
          if (operandInfo && operand) {
            event.preventDefault();
            dispatchKeyboardMode({ type: 'open-guard', fragmentId: operandInfo.fragment.id, operandId: operand.id, text: operand.guard });
          }
          return;
        }
        if (event.key === 'Tab' && keyboardSlot?.operandId) {
          const operandInfo = findFragmentOperand(content.items, keyboardSlot.operandId);
          if (!operandInfo) return;
          event.preventDefault();
          const operands = operandInfo.fragment.operands;
          const nextOperandIndex = (operandInfo.operandIndex + (event.shiftKey ? -1 : 1) + operands.length) % operands.length;
          const nextOperandId = operands[nextOperandIndex].id;
          const candidateIndices = keyboardSlots
            .map((slot, index) => ({ slot, index }))
            .filter((entry) => entry.slot.containerId === nextOperandId);
          const target = candidateIndices.length > 0
            ? candidateIndices.reduce((closest, candidate) => (
                Math.abs(candidate.slot.index - keyboardSlot.index) < Math.abs(closest.slot.index - keyboardSlot.index)
                  ? candidate
                  : closest
              ))
            : undefined;
          if (target) dispatchKeyboardMode({ type: 'navigate', slotIndex: target.index });
          return;
        }
      }

      if (keyboardMode.stage === 'aim') {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          moveKeyboardParticipant(event.key === 'ArrowLeft' ? -1 : 1, true);
          return;
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          const direction = event.key === 'ArrowUp' ? -1 : 1;
          if (event.altKey && keyboardMode.messageType === 'create') {
            const kind = moveCircular(sequenceKeyboardCreateKinds, keyboardMode.createKind, direction);
            if (kind) dispatchKeyboardMode({ type: 'set-create-kind', createKind: kind });
            return;
          }
          if (event.altKey && keyboardMode.messageType === 'return' && keyboardMode.returnCandidateIds.length > 1) {
            const nextCandidateIndex = (keyboardMode.returnCandidateIndex + direction + keyboardMode.returnCandidateIds.length) % keyboardMode.returnCandidateIds.length;
            dispatchKeyboardMode({ type: 'set-route', returnCandidateIndex: nextCandidateIndex });
            return;
          }
          const currentType = keyboardMode.messageType === 'asynchronous' ? 'synchronous' : keyboardMode.messageType;
          const messageType = moveCircular(sequenceKeyboardMessageTypes, currentType, direction);
          if (messageType) setKeyboardMessageType(messageType);
          return;
        }
        const key = event.key.toLocaleLowerCase();
        if (key === 's' || key === 'r' || key === 'c' || key === 'd') {
          event.preventDefault();
          const typeByKey: Record<string, SequenceMessageType> = {
            s: 'synchronous',
            r: 'return',
            c: 'create',
            d: 'destroy',
          };
          setKeyboardMessageType(typeByKey[key]);
          return;
        }
        if (key === 'k' && keyboardMode.messageType === 'create') {
          event.preventDefault();
          const kind = moveCircular(sequenceKeyboardCreateKinds, keyboardMode.createKind, 1);
          if (kind) dispatchKeyboardMode({ type: 'set-create-kind', createKind: kind });
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          commitKeyboardMessage(false);
          return;
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          if (keyboardMode.messageType === 'return') return;
          dispatchKeyboardMode({ type: 'start-typing' });
          return;
        }
        return;
      }

      if (keyboardMode.stage === 'participant') {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitKeyboardParticipant();
        }
        return;
      }

      if (keyboardMode.stage === 'fragment') {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          const operator = moveCircular(sequenceKeyboardFragmentOperators, keyboardMode.fragmentOperator, event.key === 'ArrowUp' ? -1 : 1);
          if (operator) dispatchKeyboardMode({ type: 'set-fragment-operator', operator });
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          commitKeyboardFragment();
        }
      }
  });

  useEffect(() => {
    window.addEventListener('keydown', handleKeyboardMode);
    return () => window.removeEventListener('keydown', handleKeyboardMode);
  }, []);

  useEffect(() => {
    if (keyboardMode.stage === 'off' || !keyboardSlot) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const sourceX = layout.participantX.get(keyboardMode.sourceId) ?? 120;
    const selectedTargetX = keyboardMode.stage === 'navigate'
      ? sourceX
      : layout.participantX.get(keyboardMode.targetId) ?? sourceX;
    const targetScreenX = selectedTargetX * zoom;
    const targetScreenY = keyboardSlot.y * zoom;
    const horizontalMargin = 110;
    const verticalMargin = 150;
    let left = scrollEl.scrollLeft;
    let top = scrollEl.scrollTop;

    if (targetScreenX < left + horizontalMargin) {
      left = Math.max(0, targetScreenX - horizontalMargin);
    } else if (targetScreenX > left + scrollEl.clientWidth - horizontalMargin) {
      left = Math.max(0, targetScreenX - scrollEl.clientWidth + horizontalMargin);
    }
    if (targetScreenY < top + verticalMargin) {
      top = Math.max(0, targetScreenY - verticalMargin);
    } else if (targetScreenY > top + scrollEl.clientHeight - 120) {
      top = Math.max(0, targetScreenY - scrollEl.clientHeight + 180);
    }

    if (Math.abs(left - scrollEl.scrollLeft) > 1 || Math.abs(top - scrollEl.scrollTop) > 1) {
      scrollEl.scrollTo({ left, top, behavior: 'smooth' });
    }
  }, [keyboardMode.sourceId, keyboardMode.stage, keyboardMode.targetId, keyboardSlot, layout.participantX, zoom]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setMessageDraft(null);
      setQuickMessage(null);
      setParticipantDraft(null);
      setParticipantPreview({});
      setNotePreview({});
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    const closeMenus = (event: MouseEvent): void => {
      toolbarRef.current?.querySelectorAll('details[open]').forEach((details) => {
        if (!details.contains(event.target as Node)) {
          details.removeAttribute('open');
        }
      });
    };
    const closeMenusOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        toolbarRef.current?.querySelectorAll('details[open]').forEach((details) => details.removeAttribute('open'));
      }
    };
    document.addEventListener('mousedown', closeMenus, true);
    document.addEventListener('keydown', closeMenusOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenus, true);
      document.removeEventListener('keydown', closeMenusOnEscape);
    };
  }, []);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = -event.deltaY * 0.005;
      setZoom((prevZoom) => {
        const nextZoom = Math.min(1.8, Math.max(0.3, prevZoom + delta));
        const rect = scrollEl.getBoundingClientRect();
        const pointerX = event.clientX - rect.left + scrollEl.scrollLeft;
        const pointerY = event.clientY - rect.top + scrollEl.scrollTop;
        const scaleRatio = nextZoom / prevZoom;
        scrollEl.scrollLeft = pointerX * scaleRatio - (event.clientX - rect.left);
        scrollEl.scrollTop = pointerY * scaleRatio - (event.clientY - rect.top);
        return nextZoom;
      });
    };
    scrollEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => scrollEl.removeEventListener('wheel', handleWheel);
  }, []);

  const fitDiagramToView = useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const viewportW = scrollEl.clientWidth - 40;
    const viewportH = scrollEl.clientHeight - 40;
    const diagramW = Math.max(400, layout.bounds.width + 80);
    const diagramH = Math.max(400, layout.bounds.height + 80);
    const optimalZoom = Math.max(0.3, Math.min(1.2, Math.min(viewportW / diagramW, viewportH / diagramH)));
    setZoom(optimalZoom);
    scrollEl.scrollTo({
      left: Math.max(0, (layout.bounds.left - 40) * optimalZoom),
      top: Math.max(0, (layout.bounds.top - 40) * optimalZoom),
      behavior: 'smooth',
    });
  }, [layout.bounds]);

  const getSelectionTarget = useCallback((targetSelection: SequenceSelection): SequenceViewportTarget | undefined => {
    if (targetSelection === null) return undefined;
    if (targetSelection.kind === 'participant') {
      const participant = layout.participantLayouts.get(targetSelection.id);
      if (!participant) return undefined;
      return {
        x: participant.x - participant.headerWidth / 2,
        y: participant.headerY,
        width: participant.headerWidth,
        height: participant.headerHeight,
      };
    }
    if (targetSelection.kind === 'message') {
      const message = layout.orderedMessages.find((candidate) => candidate.id === targetSelection.id);
      const messageBox = layout.messageLayouts.get(targetSelection.id);
      if (!message || !messageBox) return undefined;
      const sourceX = layout.participantX.get(message.sourceId) ?? 0;
      const targetX = layout.participantX.get(message.targetId) ?? sourceX;
      return {
        x: Math.min(sourceX, targetX) - 24,
        y: messageBox.y - messageBox.height / 2,
        width: Math.max(48, Math.abs(targetX - sourceX) + 48),
        height: messageBox.height,
      };
    }
    if (targetSelection.kind === 'fragment') {
      const fragment = layout.fragmentLayouts.get(targetSelection.id);
      return fragment ? { x: fragment.x, y: fragment.y, width: fragment.width, height: fragment.height } : undefined;
    }
    const note = layout.noteLayouts.get(targetSelection.id);
    return note ? { x: note.x, y: note.y, width: note.width, height: note.height } : undefined;
  }, [layout]);

  const selectCanvasElement = useCallback((nextSelection: SequenceSelection): void => {
    setSelection(nextSelection);
    setHighlightedSelection((current) => current !== null && (nextSelection === null || current.id !== nextSelection.id) ? null : current);
    if (nextSelection !== null) {
      setInspectorCollapsed(false);
    }
  }, [setSelection]);

  const handleTimelineItemSelect = useCallback((id: string, isMulti: boolean): void => {
    if (!isMulti) {
      setSelectedTimelineIds([]);
      return;
    }

    const item = findSequenceItem(content.items, id);
    if (!item) return;
    setSelectionState((current) => {
      const candidateState = toggleSequenceElement(current, { kind: item.kind, id });
      const candidate = candidateState.elements.filter((element) => element.kind !== 'note' && element.kind !== 'participant').map((element) => element.id);
      if (!areItemsInSameContainer(content.items, candidate)) {
        showFeedback('Solo se pueden seleccionar elementos dentro del mismo contenedor.');
        return selectSequenceElement({ kind: item.kind, id });
      }
      return candidateState;
    });
  }, [content.items, setSelectedTimelineIds, setSelectionState, showFeedback]);

  const handleMarqueeSelect = useCallback((timelineIds: string[], noteIds: string[]): void => {
    if (timelineIds.length === 0 && noteIds.length === 0) {
      selectCanvasElement(null);
      return;
    }
    const elements: SequenceSelectionTarget[] = [
      ...timelineIds.flatMap((id): SequenceSelectionTarget[] => {
        const item = findSequenceItem(content.items, id);
        return item ? [{ kind: item.kind, id }] : [];
      }),
      ...noteIds.map((id): SequenceSelectionTarget => ({ kind: 'note', id })),
    ];
    setSelectionState(replaceSequenceSelection(elements));
    const total = timelineIds.length + noteIds.length;
    if (total > 1) {
      if (!marqueeTipShownRef.current) {
        marqueeTipShownRef.current = true;
        showFeedback(`${total} elementos seleccionados en bloque. Tip: Mayús+arrastrar selecciona dentro de fragmentos.`);
      } else {
        showFeedback(`${total} elementos seleccionados en bloque.`);
      }
    }
  }, [content.items, selectCanvasElement, setSelectionState, showFeedback]);

  const selectedMessageId = selection?.kind === 'message' ? selection.id : undefined;

  const canWrapSelection = useMemo(() => {
    const ids = selectedTimelineIds.length > 0
      ? selectedTimelineIds
      : selectedMessageId ? [selectedMessageId] : [];
    if (ids.length === 0) return false;
    return areItemsContiguous(content.items, ids);
  }, [content.items, selectedTimelineIds, selectedMessageId]);

  const handleWrapSelection = useCallback((operator: SequenceFragmentOperator, overrideIds?: string[]): void => {
    const idsToWrap = overrideIds ?? (selectedTimelineIds.length > 0
      ? selectedTimelineIds
      : selectedMessageId ? [selectedMessageId] : []);
    if (idsToWrap.length === 0) return;
    const result = wrapSequenceItems(content.items, idsToWrap, operator);
    if (!result) {
      showFeedback('No se pudieron envolver los elementos seleccionados (deben ser contiguos dentro del mismo contenedor).');
      return;
    }
    const saved = commit(keepAnchoredNotesWithTimeline({
      ...content,
      items: result.items,
    }), true);
    if (saved) {
      setSelectedTimelineIds([]);
      setSelection({ kind: 'fragment', id: result.createdFragment.id });
      showFeedback(`Elemento${idsToWrap.length === 1 ? '' : 's'} envuelto${idsToWrap.length === 1 ? '' : 's'} en fragmento ${operator}.`);
    }
  }, [selectedTimelineIds, selectedMessageId, content, commit, keepAnchoredNotesWithTimeline, setSelectedTimelineIds, setSelection, showFeedback]);

  const handleUnwrapFragment = useCallback((fragmentId: string): void => {
    const result = unwrapSequenceFragment(content.items, fragmentId);
    if (!result) {
      showFeedback('No se pudo desempaquetar el fragmento.');
      return;
    }
    const saved = commit(keepAnchoredNotesWithTimeline({
      ...content,
      items: result.items,
    }), true);
    if (saved) {
      if (result.unwrappedItems.length > 0) {
        const first = result.unwrappedItems[0];
        if (first.kind === 'message') {
          setSelection({ kind: 'message', id: first.id });
        } else if (first.kind === 'fragment') {
          setSelection({ kind: 'fragment', id: first.id });
        } else {
          setSelection(null);
        }
      } else {
        setSelection(null);
      }
      showFeedback(`Fragmento desempaquetado (${result.unwrappedItems.length} elemento${result.unwrappedItems.length === 1 ? '' : 's'} restaurado${result.unwrappedItems.length === 1 ? '' : 's'}).`);
    }
  }, [content, commit, keepAnchoredNotesWithTimeline, setSelection, showFeedback]);

  const startMessageDrag = useCallback((message: SequenceMessage, event: ReactPointerEvent<SVGGElement>): void => {
    if (event.button !== 0 || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();

    const startClientY = event.clientY;
    let didMove = false;
    let fallbackNoticeShown = false;

    // Grupo arrastrado: la selección en bloque cuando incluye al mensaje y es
    // contigua dentro del mismo contenedor; si no, solo ese mensaje.
    const rawIds = (selectedTimelineIds.includes(message.id) ? selectedTimelineIds : [message.id])
      .filter((id) => findSequenceItem(content.items, id) !== null);
    const topIds = getTopLevelBlockIds(content.items, rawIds);
    const isBlockDrag = topIds.length > 1
      && getOrderedSelectionInContainer(content.items, topIds) !== null;
    const groupIds = isBlockDrag ? topIds : [message.id];

    // Árbol y layout sin el grupo (el contenido no cambia durante el arrastre):
    // fuera de la zona de agarre, los huecos de ese árbol son estables.
    const { items: withoutItems, removed: groupItems } = removeSequenceItemsBlock(content.items, groupIds);
    const withoutLayout = buildSequenceLayout({ ...content, items: withoutItems });

    let lastKey: string | null = null;
    let lastValidation: ReturnType<typeof validateBlockCandidate> | null = null;
    let lastContainerName = 'fragmento';

    const guideBoundsFor = (
      previewLayout: ReturnType<typeof buildSequenceLayout>,
      containerId: string,
    ): { bounds?: { x: number; width: number }; containerBounds?: { x: number; width: number; top: number; bottom: number } } => {
      if (containerId === 'root') return {};
      for (const [, fragmentBox] of Array.from(previewLayout.fragmentLayouts.entries())) {
        const operand = fragmentBox.operands.find((candidate) => candidate.id === containerId);
        if (operand) {
          return {
            bounds: { x: fragmentBox.x, width: fragmentBox.width },
            containerBounds: { x: fragmentBox.x, width: fragmentBox.width, top: operand.top, bottom: operand.bottom },
          };
        }
      }
      return {};
    };

    const move = (pointerEvent: PointerEvent): void => {
      if (Math.abs(pointerEvent.clientY - startClientY) > 4) {
        didMove = true;
      }
      if (!didMove) return;

      if (!isBlockDrag && topIds.length > 1 && !fallbackNoticeShown) {
        fallbackNoticeShown = true;
        showFeedback('La selección no es un bloque contiguo: se mueve solo este mensaje.');
      }

      const svgEl = svgRef.current;
      if (!svgEl) return;

      const rect = svgEl.getBoundingClientRect();
      const pointer = sequencePointerToCanvas(pointerEvent, rect, zoom);
      const canvasX = pointer.x;
      const canvasY = pointer.y;

      // El hueco se mide con el layout visible para la zona de agarre y con el
      // árbol sin el grupo fuera de ella: agarrar nunca salta y la guía
      // coincide exactamente con el aterrizaje.
      const target = findBlockDropTarget(content.items, layout, groupIds, withoutItems, withoutLayout, { x: canvasX, y: canvasY });
      const key = `${target.containerId}:${target.index}`;
      if (key === lastKey) return;
      lastKey = key;

      const candidate = insertTimelineItemsAt(withoutItems, target.containerId, target.index, groupItems);
      const semanticValidation = validateBlockCandidate(content, candidate, groupIds, target.containerId, { existingArtifactIds });
      const mutationGate = applySequenceDiagramMutation(content, { ...content, items: candidate });
      const validation = mutationGate.accepted
        ? semanticValidation
        : {
            ...semanticValidation,
            valid: false,
            reason: mutationGate.newProblems[0]?.message ?? semanticValidation.reason,
            problemCode: mutationGate.newProblems[0]?.code ?? semanticValidation.problemCode,
          };
      lastValidation = validation;
      lastContainerName = getBlockContainerName(content.items, target.containerId);

      if (validation.isNoop) {
        setMessageDragPreview(null);
        setInsertionGuide(null);
        return;
      }

      // La guía sale del mismo layout candidato que se ve en pantalla y del
      // mismo árbol que se commitea al soltar: lo que ves es donde cae.
      const previewLayout = buildSequenceLayout({ ...content, items: candidate });
      if (validation.valid) {
        setMessageDragPreview({ blockIds: groupIds, items: candidate });
      } else {
        // Un candidato rechazado no puede parecer ya aplicado: la línea roja
        // marca el intento, pero el mensaje permanece en su estado original.
        setMessageDragPreview(null);
      }
      setInsertionGuide({
        y: Math.round(getBlockDropGuideY(previewLayout, groupIds, canvasY)),
        isValid: validation.valid,
        reason: validation.reason,
        containerName: lastContainerName,
        ...guideBoundsFor(previewLayout, target.containerId),
      });
    };

    const finish = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      setMessageDragPreview(null);
      setInsertionGuide(null);

      if (!didMove || !lastValidation) {
        return;
      }
      if (lastValidation.isNoop) {
        return;
      }
      if (!lastValidation.valid || !lastValidation.newContent) {
        showFeedback(`Movimiento no permitido: ${lastValidation.reason || 'error de ciclo de vida'}`);
        return;
      }

      const saved = commit(keepAnchoredNotesWithTimeline(lastValidation.newContent), true);
      if (saved) {
        if (isBlockDrag) {
          showFeedback(`Bloque movido (${groupIds.length} elementos).`);
        } else {
          setSelection({ kind: 'message', id: message.id });
          showFeedback(lastContainerName === 'Secuencia principal'
            ? 'Mensaje reordenado.'
            : `Mensaje movido a ${lastContainerName}.`);
        }
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  }, [content, layout, existingArtifactIds, zoom, showFeedback, commit, keepAnchoredNotesWithTimeline, selectedTimelineIds, setSelection]);

  const handleLoadTemplate = useCallback((templateId: string, asNew: boolean): void => {
    const tmpl = SEQUENCE_TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl) return;
    const newContent = tmpl.createContent();
    if (asNew && onCreateSequenceDiagramArtifact) {
      onCreateSequenceDiagramArtifact(tmpl.name, newContent);
      setIsTemplatesOpen(false);
      showFeedback(`Diagrama "${tmpl.name}" creado con plantilla.`);
    } else {
      const ok = commit(keepAnchoredNotesWithTimeline(newContent), true);
      if (ok) {
        setIsTemplatesOpen(false);
        setSelection(null);
        setSelectedTimelineIds([]);
        showFeedback(`Plantilla "${tmpl.name}" cargada.`);
      }
    }
  }, [commit, keepAnchoredNotesWithTimeline, onCreateSequenceDiagramArtifact, setSelectedTimelineIds, setSelection, showFeedback]);

  const selectOutlineItem = useCallback((nextSelection: Exclude<SequenceSelection, null>): void => {
    setSelection(nextSelection);
    setHighlightedSelection(nextSelection);
    if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedSelection((current) => current?.id === nextSelection.id ? null : current);
      highlightTimeoutRef.current = null;
    }, 2200);

    const target = getSelectionTarget(nextSelection);
    const scrollEl = scrollRef.current;
    if (!target || !scrollEl) return;
    const scroll = centerSequenceViewportOnTarget({
      target,
      viewportWidth: scrollEl.clientWidth,
      viewportHeight: scrollEl.clientHeight,
      zoom,
    });
    scrollEl.scrollTo({ ...scroll, behavior: 'smooth' });
  }, [getSelectionTarget, setSelection, zoom]);

  useEffect(() => () => {
    if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
  }, []);

  const handleToolbarMenuToggle = (event: SyntheticEvent<HTMLDetailsElement>): void => {
    const details = event.currentTarget;
    if (!details.open) return;
    toolbarRef.current?.querySelectorAll('details[open]').forEach((candidate) => {
      if (candidate !== details) candidate.removeAttribute('open');
    });
  };

  const beginParticipantCreation = useCallback((): void => {
    setMessageDraft(null);
    setQuickMessage(null);
    setParticipantDraft({ text: '' });
  }, []);

  const submitParticipantDraft = useCallback((event: FormEvent): void => {
    event.preventDefault();
    if (!participantDraft) return;
    const parsed = parseSequenceParticipantLabel(participantDraft.text);
    if (!participantLabelIsValid(parsed)) {
      showFeedback('Escribí una clase válida después de “:”.');
      return;
    }
    if (participantDraft.editId) {
      const existing = content.participants.find((participant) => participant.id === participantDraft.editId);
      if (!existing) return;
      const nextParticipant = { ...existing, name: parsed.instanceName, classifierName: parsed.classifierName };
      const saved = commit({
        ...content,
        participants: content.participants.map((participant) => participant.id === existing.id ? nextParticipant : participant),
      });
      if (saved) setParticipantDraft(null);
      return;
    }
    const participant = createSequenceParticipantFromLabel({
      text: participantDraft.text,
      participants: content.participants,
    });
    if (!participant) {
      showFeedback('Escribí una clase válida después de “:”.');
      return;
    }
    const saved = commit({ ...content, participants: [...content.participants, participant] });
    if (saved) {
      setSelection({ kind: 'participant', id: participant.id });
      setParticipantDraft(null);
    }
  }, [commit, content, participantDraft, setSelection, showFeedback]);

  const updateParticipantLabel = useCallback((id: string, text: string): void => {
    setParticipantEditDraft({ id, text });
    const parsed = parseSequenceParticipantLabel(text);
    if (!participantLabelIsValid(parsed)) return;
    void commit({
      ...content,
      participants: content.participants.map((participant) => participant.id === id
        ? { ...participant, name: parsed.instanceName, classifierName: parsed.classifierName }
        : participant),
    }, false);
  }, [commit, content]);

  const beginMessage = (type: SequenceMessageType = 'synchronous'): void => {
    setQuickMessage(null);
    setMessageDraft(createSequenceMessageEditModel({
      type,
      sourceId: selectedParticipant?.id ?? content.participants[0]?.id ?? '',
      targetId: content.participants[1]?.id ?? content.participants[0]?.id ?? '',
      name: '',
      newParticipantKind: 'object',
      newParticipantName: type === 'create' ? ':DTO' : '',
      placement: selectedItem ? 'after' : 'end',
    }));
  };

  const submitMessage = (event: FormEvent): void => {
    event.preventDefault();
    if (messageDraft === null || !messageDraft.sourceId) return;
    let nextParticipants = [...content.participants];
    let targetId = messageDraft.targetId;
    let createdParticipant: SequenceParticipant | undefined;
    if (messageDraft.type === 'create') {
      createdParticipant = createSequenceParticipantFromLabel({
        text: messageDraft.newParticipantName ?? '',
        participants: content.participants,
        terminateLifeline: true,
      }) ?? undefined;
      if (!createdParticipant) {
        showFeedback('Escribí una identificación válida, por ejemplo :DTO.');
        return;
      }
      targetId = createdParticipant.id;
      nextParticipants.push(createdParticipant);
    }
    if (!targetId) return;
    const message = buildSequenceMessageFromEditModel({ ...messageDraft, targetId });
    if (createdParticipant !== undefined) createdParticipant.createdByMessageId = message.id;
    nextParticipants = reconcileMessageLifecycleMarkers(nextParticipants, message);
    const selectedId = selectedItem?.id;
    const nextItems = selectedId && messageDraft.placement === 'before'
      ? insertSequenceItemBefore(content.items, message, selectedId)
      : insertSequenceItem(
          content.items,
          message,
          selectedId && messageDraft.placement === 'after' ? { afterItemId: selectedId } : undefined,
        );
    const saved = commit(keepAnchoredNotesWithTimeline({
      ...content,
      participants: nextParticipants,
      items: nextItems,
    }));
    if (!saved) return;
    setSelection({ kind: 'message', id: message.id });
    setMessageDraft(null);
  };

  const connectLifelines = (sourceId: string, targetId: string, y: number): void => {
    setMessageDraft(null);
    const sourceX = layout.participantX.get(sourceId) ?? 0;
    const targetX = layout.participantX.get(targetId) ?? 0;
    const isRightToLeft = sourceX > targetX;
    setQuickMessage(createSequenceMessageEditModel({
      sourceId,
      targetId,
      y,
      name: '',
      type: isRightToLeft ? 'return' : 'synchronous',
    }));
  };

  const editMessageOnCanvas = (id: string): void => {
    const message = findSequenceItem(content.items, id);
    if (message?.kind !== 'message') return;
    setSelection({ kind: 'message', id });
    setMessageDraft(null);
    setQuickMessage(sequenceMessageEditModelFromMessage(message, layout.messageLayouts.get(id)?.y ?? 150));
  };

  const saveQuickMessage = (event: FormEvent, committedDraft?: QuickMessageDraft): void => {
    event.preventDefault();
    const activeDraft = committedDraft ?? quickMessage;
    if (!activeDraft) return;
    if (![activeDraft.sourceId, activeDraft.targetId].every((id) => content.participants.some((p) => p.id === id))) { setQuickMessage(null); return; }
    if (activeDraft.type === 'create') {
      if (activeDraft.sourceId === activeDraft.targetId) { showFeedback('Un objeto no puede crearse a sí mismo.'); return; }
      const probe = createSequenceMessage('create', activeDraft.sourceId, activeDraft.targetId);
      const candidateItems = activeDraft.editId ? content.items : insertSequenceItemAtY(content.items, probe, layout, activeDraft.y);
      const ordered = flattenSequenceItems(candidateItems).map((entry) => entry.item).filter((item) => item.kind === 'message');
      const index = ordered.findIndex((item) => item.id === (activeDraft.editId ?? probe.id));
      const usedBefore = ordered.slice(0, index).some((item) => item.sourceId === activeDraft.targetId || item.targetId === activeDraft.targetId);
      const createdElsewhere = ordered.some((item) => item.id !== (activeDraft.editId ?? probe.id) && item.type === 'create' && item.targetId === activeDraft.targetId);
      if (usedBefore || createdElsewhere) { showFeedback('create() debe ser la primera interacción del objeto. Usá el botón create() para crear un DTO nuevo.'); return; }
    }
    let saved: boolean;
    if (activeDraft.editId) {
      const previous = findSequenceItem(content.items, activeDraft.editId);
      const message = buildSequenceMessageFromEditModel(activeDraft, activeDraft.editId);
      saved = commit(keepAnchoredNotesWithTimeline({
        ...content,
        participants: reconcileMessageLifecycleMarkers(content.participants, message, previous?.kind === 'message' ? previous : undefined),
        items: updateSequenceItem(content.items, activeDraft.editId, (item) => ({ ...item, ...message } as SequenceMessage)),
      }));
    } else {
      const message = buildSequenceMessageFromEditModel(activeDraft);
      const items = insertSequenceItemAtY(content.items, message, layout, activeDraft.y);
      saved = commit(keepAnchoredNotesWithTimeline({
        ...content,
        participants: reconcileMessageLifecycleMarkers(content.participants, message),
        items,
      }));
      if (saved) setSelection({ kind: 'message', id: message.id });
    }
    if (!saved) return;
    setQuickMessage(null);
  };

  const swapQuickMessage = (): void => {
    if (!quickMessage) return;
    const candidate = { ...quickMessage, sourceId: quickMessage.targetId, targetId: quickMessage.sourceId };
    const methodsForNewTarget = getSequenceMethodOptions({
      model: candidate,
      participants: content.participants,
      classDiagram: associatedClassDiagram,
    });
    setQuickMessage(swapSequenceMessageEditModel(quickMessage, methodsForNewTarget));
  };

  const swapMessageDraft = (): void => {
    if (!messageDraft) return;
    const candidate = { ...messageDraft, sourceId: messageDraft.targetId, targetId: messageDraft.sourceId };
    const methodsForNewTarget = getSequenceMethodOptions({
      model: candidate,
      participants: content.participants,
      classDiagram: associatedClassDiagram,
    });
    setMessageDraft(swapSequenceMessageEditModel(messageDraft, methodsForNewTarget));
  };

  const addReturn = (): void => {
    if (selectedItem?.kind !== 'message') return;
    const reply = createSequenceMessage('return', selectedItem.targetId, selectedItem.sourceId);
    reply.replyToMessageId = selectedItem.id;
    commit(keepAnchoredNotesWithTimeline({ ...content, items: insertSequenceItem(content.items, reply, { afterItemId: selectedItem.id }) }));
    setSelection({ kind: 'message', id: reply.id });
  };

  const addFragment = (operator: SequenceFragmentOperator): void => {
    const idsToWrap = selectedTimelineIds.length > 0
      ? selectedTimelineIds
      : selectedItem?.kind === 'message' ? [selectedItem.id] : [];
    if (idsToWrap.length > 0) {
      handleWrapSelection(operator, idsToWrap);
      return;
    }
    const fragment = createSequenceFragment(operator);
    const afterItemId = selectedItem?.id;
    commit(keepAnchoredNotesWithTimeline({ ...content, items: insertSequenceItem(content.items, fragment, afterItemId ? { afterItemId } : undefined) }));
    setSelection({ kind: 'fragment', id: fragment.id });
  };

  const addNote = (): void => {
    const note: SequenceNote = {
      id: createId(),
      text: 'Nueva nota',
      color: 'yellow',
      x: Math.max(80, scrollPosition.left / zoom + 120),
      y: Math.max(150, scrollPosition.top / zoom + 170),
      width: 230,
      height: 110,
      anchorKind: selection?.kind === 'message' || selection?.kind === 'fragment' || selection?.kind === 'participant'
        ? selection.kind
        : 'free',
      anchorId: selection?.kind === 'message' || selection?.kind === 'fragment' || selection?.kind === 'participant'
        ? selection.id
        : undefined,
    };
    commit({ ...content, notes: [...content.notes, note] });
    setSelection({ kind: 'note', id: note.id });
  };

  const deleteFragmentOperand = async (fragmentId: string, operandId: string): Promise<void> => {
    const fragment = findSequenceItem(content.items, fragmentId);
    if (fragment?.kind !== 'fragment') return;
    const operand = fragment.operands.find((candidate) => candidate.id === operandId);
    if (!operand) return;
    const messageCount = countSequenceMessages(operand.items);
    const isMinimumBranchCount = (fragment.operator === 'alt' || fragment.operator === 'par') && fragment.operands.length <= 2;
    if (isMinimumBranchCount) {
      showFeedback(`${fragment.operator} debe conservar al menos dos ramas. No se eliminó la rama; eliminá el fragmento completo si ya no lo necesitás.`);
      return;
    }
    const shouldDelete = await confirm({
      title: '¿Eliminar esta rama?',
      description: messageCount > 0
        ? `Contiene ${messageCount} mensaje${messageCount === 1 ? '' : 's'} que también se eliminarán.`
        : 'La rama queda fuera del fragmento.',
    });
    if (!shouldDelete) return;
    const removedMessageIds = new Set(flattenSequenceItems(operand.items)
      .filter((entry) => entry.item.kind === 'message')
      .map((entry) => entry.item.id));
    const saved = commit(keepAnchoredNotesWithTimeline({
      ...content,
      items: updateSequenceItem(content.items, fragmentId, (item) => item.kind === 'fragment'
        ? { ...item, operands: item.operands.filter((candidate) => candidate.id !== operandId) }
        : item),
      activations: content.activations.filter((activation) =>
        !removedMessageIds.has(activation.startMessageId) && !removedMessageIds.has(activation.endMessageId ?? '')),
      notes: content.notes.map((note) => removedMessageIds.has(note.anchorId ?? '')
        ? { ...note, anchorKind: 'free', anchorId: undefined }
        : note),
    }));
    if (saved) setSelection({ kind: 'fragment', id: fragmentId });
  };

  const deleteBlockSelection = async (): Promise<void> => {
    const focusedId = selection !== null && selection.kind !== 'participant' ? selection.id : null;
    const ids = [...new Set([...(focusedId ? [focusedId] : []), ...selectedTimelineIds])];
    const noteIdSet = new Set(content.notes.map((note) => note.id));
    const noteIds = ids.filter((id) => noteIdSet.has(id));
    const timelineIds = ids.filter((id) => !noteIdSet.has(id));
    const { items: nextItems, removed } = removeSequenceItemsBlock(content.items, timelineIds);
    const notesToDelete = content.notes.filter((note) => noteIds.includes(note.id));
    if (removed.length === 0 && notesToDelete.length === 0) return;
    const messageCount = removed.reduce((count, item) => count + countSequenceMessages([item]), 0);
    const parts: string[] = [];
    if (removed.length > 0) {
      parts.push(`${removed.length} elemento${removed.length === 1 ? '' : 's'} de la línea de tiempo${messageCount > 0 ? ` (${messageCount} mensaje${messageCount === 1 ? '' : 's'})` : ''}`);
    }
    if (notesToDelete.length > 0) {
      parts.push(`${notesToDelete.length} nota${notesToDelete.length === 1 ? '' : 's'}`);
    }
    const shouldDelete = await confirm({
      title: '¿Eliminar la selección?',
      description: `Se eliminarán ${parts.join(' y ')}.`,
    });
    if (!shouldDelete) return;
    const removedIds = new Set(removed.flatMap((item) => flattenSequenceItems([item]).map((entry) => entry.item.id)));
    const saved = commit(keepAnchoredNotesWithTimeline({
      ...content,
      participants: content.participants.map((p) => ({
        ...p,
        createdByMessageId: removedIds.has(p.createdByMessageId ?? '') ? undefined : p.createdByMessageId,
        destroyedByMessageId: removedIds.has(p.destroyedByMessageId ?? '') ? undefined : p.destroyedByMessageId,
      })),
      items: nextItems,
      activations: content.activations.filter((activation) => !removedIds.has(activation.startMessageId) && !removedIds.has(activation.endMessageId ?? '')),
      notes: content.notes.filter((note) => !noteIds.includes(note.id)).map((note) => removedIds.has(note.anchorId ?? '')
        ? { ...note, anchorKind: 'free', anchorId: undefined }
        : note),
    }));
    if (saved) {
      setSelection(null);
      setSelectedTimelineIds([]);
      const total = removed.length + notesToDelete.length;
      showFeedback(`Se eliminaron ${total} elemento${total === 1 ? '' : 's'}.`);
    }
  };

  const deleteSelection = async (): Promise<void> => {
    if (selectedTimelineIds.length > 0 && (selection === null || selection.kind !== 'participant')) {
      await deleteBlockSelection();
      return;
    }
    if (selection === null) return;
    let saved: boolean;
    if (selection.kind === 'participant') {
      const messageIds = new Set(flatEntries.filter((entry) => entry.item.kind === 'message' && (entry.item.sourceId === selection.id || entry.item.targetId === selection.id)).map((entry) => entry.item.id));
      const removeMessages = (items: SequenceTimelineItem[]): SequenceTimelineItem[] => items.flatMap((item): SequenceTimelineItem[] => {
        if (item.kind === 'message') return messageIds.has(item.id) ? [] : [item];
        return [{ ...item, operands: item.operands.map((operand) => ({ ...operand, items: removeMessages(operand.items) })) }];
      });
      const shouldDelete = await confirm({
        title: '¿Eliminar este participante?',
        description: messageIds.size > 0
          ? `Tiene ${messageIds.size} mensaje${messageIds.size === 1 ? '' : 's'} asociado${messageIds.size === 1 ? '' : 's'}: también se eliminan, y las notas vinculadas quedan libres.`
          : undefined,
      });
      if (!shouldDelete) return;
      saved = commit({
        ...content,
        participants: content.participants.filter((participant) => participant.id !== selection.id),
        items: removeMessages(content.items),
        activations: content.activations.filter((activation) => activation.participantId !== selection.id
          && !messageIds.has(activation.startMessageId)
          && !messageIds.has(activation.endMessageId ?? '')),
        notes: content.notes.map((note) => messageIds.has(note.anchorId ?? '')
            ? { ...note, anchorKind: 'free', anchorId: undefined }
            : note),
      });
    } else if (selection.kind === 'note') {
      saved = commit({ ...content, notes: content.notes.filter((note) => note.id !== selection.id) });
    } else {
      const result = removeSequenceItem(content.items, selection.id);
      const messageCount = result.removed?.kind === 'fragment'
        ? countSequenceMessages([result.removed])
        : result.removed?.kind === 'message' ? 1 : 0;
      if (messageCount > 0) {
        const isFragment = result.removed?.kind === 'fragment';
        const shouldDelete = await confirm({
          title: isFragment ? '¿Eliminar el fragmento y su contenido?' : '¿Eliminar este elemento?',
          description: isFragment
            ? `Contiene ${messageCount} mensaje${messageCount === 1 ? '' : 's'} que se eliminan junto con el contenedor. Para conservarlos en su lugar, usá «Desempaquetar» (Cmd+Shift+U).`
            : `Contiene ${messageCount} mensaje${messageCount === 1 ? '' : 's'} que también se eliminarán.`,
        });
        if (!shouldDelete) return;
      }
      const removedIds = result.removed === null
        ? new Set<string>()
        : new Set(flattenSequenceItems([result.removed]).map((entry) => entry.item.id));
      saved = commit(keepAnchoredNotesWithTimeline({
        ...content,
        participants: content.participants.map((p) => ({
          ...p,
          createdByMessageId: removedIds.has(p.createdByMessageId ?? '') ? undefined : p.createdByMessageId,
          destroyedByMessageId: removedIds.has(p.destroyedByMessageId ?? '') ? undefined : p.destroyedByMessageId,
        })),
        items: result.items,
        activations: content.activations.filter((activation) => !removedIds.has(activation.startMessageId) && !removedIds.has(activation.endMessageId ?? '')),
        notes: content.notes.map((note) => removedIds.has(note.anchorId ?? '')
          ? { ...note, anchorKind: 'free', anchorId: undefined }
          : note),
      }));
    }
    if (saved) setSelection(null);
  };

  const deleteSelectionRef = useRef(deleteSelection);
  useEffect(() => {
    deleteSelectionRef.current = deleteSelection;
  });

  useEffect(() => {
    const handleDeleteSelection = (event: KeyboardEvent): void => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (messageDraft !== null || quickMessage !== null) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], dialog') !== null) return;
      event.preventDefault();
      void deleteSelectionRef.current();
    };
    window.addEventListener('keydown', handleDeleteSelection);
    return () => window.removeEventListener('keydown', handleDeleteSelection);
  }, [messageDraft, quickMessage]);

  const moveSelectedItem = useCallback((direction: -1 | 1): void => {
    if (selectedTimelineIds.length > 0) {
      const focusedId = selection?.kind === 'message' || selection?.kind === 'fragment' ? selection.id : null;
      const ids = [...new Set([...(focusedId ? [focusedId] : []), ...selectedTimelineIds])]
        .filter((id) => findSequenceItem(content.items, id) !== null);
      if (ids.length === 0) return;
      if (ids.length === 1) {
        commit(keepAnchoredNotesWithTimeline({ ...content, items: moveSequenceItem(content.items, ids[0], direction) }));
        return;
      }
      const next = moveSequenceItemsBlock(content.items, ids, direction);
      if (next === content.items) {
        showFeedback('El bloque no se puede mover (debe ser contiguo dentro del mismo contenedor).');
        return;
      }
      commit(keepAnchoredNotesWithTimeline({ ...content, items: next }));
      return;
    }
    if (selection?.kind !== 'message' && selection?.kind !== 'fragment') return;
    commit(keepAnchoredNotesWithTimeline({ ...content, items: moveSequenceItem(content.items, selection.id, direction) }));
  }, [commit, content, keepAnchoredNotesWithTimeline, selection, selectedTimelineIds, showFeedback]);

  const dropOutlineItem = (targetId: string): void => {
    if (draggedOutlineItemId === null || draggedOutlineItemId === targetId) return;
    const result = removeSequenceItem(content.items, draggedOutlineItemId);
    if (result.removed === null) return;
    if (result.removed.kind === 'fragment') {
      const descendants = new Set(flattenSequenceItems(result.removed.operands.flatMap((operand) => operand.items)).map((entry) => entry.item.id));
      if (descendants.has(targetId)) return;
    }
    commit(keepAnchoredNotesWithTimeline({ ...content, items: insertSequenceItemBefore(result.items, result.removed, targetId) }));
    setDraggedOutlineItemId(null);
    setOutlineDropTargetId(null);
  };

  const handleCanvasScroll = (element: HTMLDivElement): void => {
    setScrollPosition({ left: element.scrollLeft, top: element.scrollTop });
    const now = performance.now();
    if (now - canvasExpansionRef.current < 500) return;
    const expansion = expandSequenceViewportAtEdge({
      currentWidth: Math.max(content.canvas.width, viewportCanvasSize.width),
      currentHeight: Math.max(content.canvas.height, viewportCanvasSize.height),
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
    });
    if (!expansion.expanded) return;
    canvasExpansionRef.current = now;
    setViewportCanvasSize((current) => ({
      width: Math.max(current.width, expansion.width),
      height: Math.max(current.height, expansion.height),
    }));
  };

  const duplicateSelectedItem = useCallback((): void => {
    if (selection?.kind !== 'message' && selection?.kind !== 'fragment') return;
    const result = duplicateSequenceItem(content.items, selection.id);
    commit(keepAnchoredNotesWithTimeline({ ...content, items: result.items }));
    if (result.duplicateId) setSelection({ kind: selection.kind, id: result.duplicateId });
  }, [commit, content, keepAnchoredNotesWithTimeline, selection, setSelection]);

  const copyBlockSelection = useCallback((): boolean => {
    const focusedId = selection?.kind === 'message' || selection?.kind === 'fragment' || selection?.kind === 'note'
      ? selection.id
      : null;
    const ids = [...new Set([...(focusedId ? [focusedId] : []), ...selectedTimelineIds])];
    if (ids.length === 0) return false;
    const noteIdSet = new Set(content.notes.map((note) => note.id));
    const notes = ids
      .map((id) => content.notes.find((note) => note.id === id))
      .filter((note): note is SequenceNote => note !== undefined);
    const items = getTopLevelBlockIds(content.items, ids.filter((id) => !noteIdSet.has(id)))
      .map((id) => findSequenceItem(content.items, id))
      .filter((item): item is SequenceTimelineItem => item !== null);
    if (items.length === 0 && notes.length === 0) return false;
    blockClipboard.current = {
      items: JSON.parse(JSON.stringify(items)) as SequenceTimelineItem[],
      notes: JSON.parse(JSON.stringify(notes)) as SequenceNote[],
    };
    const total = items.length + notes.length;
    showFeedback(`Bloque copiado (${total} elemento${total === 1 ? '' : 's'}).`);
    return true;
  }, [content.items, content.notes, selection, selectedTimelineIds, showFeedback]);

  const pasteBlockSelection = useCallback((): void => {
    const clipboard = blockClipboard.current;
    if (!clipboard || (clipboard.items.length === 0 && clipboard.notes.length === 0)) return;
    const itemClones = cloneSequenceTimelineItems(clipboard.items);
    let nextItems = content.items;
    const anchorCandidates = [...selectedTimelineIds];
    if (selection?.kind === 'message' || selection?.kind === 'fragment') anchorCandidates.push(selection.id);
    let afterId: string | undefined;
    for (let i = anchorCandidates.length - 1; i >= 0; i -= 1) {
      if (findSequenceItem(nextItems, anchorCandidates[i]) !== null) {
        afterId = anchorCandidates[i];
        break;
      }
    }
    for (const clone of itemClones) {
      nextItems = insertSequenceItem(nextItems, clone, afterId ? { afterItemId: afterId } : undefined);
      afterId = clone.id;
    }
    const noteClones = clipboard.notes.map((note) => ({ ...note, id: createId(), x: note.x + 24, y: note.y + 24 }));
    const saved = commit(keepAnchoredNotesWithTimeline({
      ...content,
      items: nextItems,
      notes: [...content.notes, ...noteClones],
    }), true);
    if (saved) {
      setSelectedTimelineIds([...itemClones.map((item) => item.id), ...noteClones.map((note) => note.id)]);
      const total = itemClones.length + noteClones.length;
      showFeedback(`Bloque pegado (${total} elemento${total === 1 ? '' : 's'}).`);
    }
  }, [commit, content, keepAnchoredNotesWithTimeline, selection, selectedTimelineIds, setSelectedTimelineIds, showFeedback]);

  useEffect(() => {
    const handleTimelineShortcuts = (event: KeyboardEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], dialog') !== null) return;
      if (messageDraft !== null || quickMessage !== null) return;

      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        if (selection?.kind === 'message' || selection?.kind === 'fragment' || selectedTimelineIds.length > 0) {
          event.preventDefault();
          moveSelectedItem(event.key === 'ArrowUp' ? -1 : 1);
          return;
        }
      }

      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'c') {
        if (selectedTimelineIds.length > 0 || selection?.kind === 'message' || selection?.kind === 'fragment' || selection?.kind === 'note') {
          event.preventDefault();
          copyBlockSelection();
          return;
        }
      }

      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'v') {
        const clipboard = blockClipboard.current;
        if (clipboard && (clipboard.items.length > 0 || clipboard.notes.length > 0)) {
          event.preventDefault();
          pasteBlockSelection();
          return;
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
        if (selection?.kind === 'message' || selection?.kind === 'fragment') {
          event.preventDefault();
          duplicateSelectedItem();
          return;
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'u') {
        if (selection?.kind === 'fragment') {
          event.preventDefault();
          handleUnwrapFragment(selection.id);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleTimelineShortcuts);
    return () => window.removeEventListener('keydown', handleTimelineShortcuts);
  }, [messageDraft, quickMessage, selection, selectedTimelineIds, moveSelectedItem, duplicateSelectedItem, copyBlockSelection, pasteBlockSelection, handleUnwrapFragment]);

  const startParticipantDrag = (participant: SequenceParticipant, event: ReactPointerEvent<SVGGElement>): void => {
    if (event.button !== 0 || event.shiftKey) return;
    event.preventDefault();
    const start = event.clientX;
    const startScrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const original = participant.x;
    let finalX = original;
    const move = (pointerEvent: PointerEvent): void => {
      const scrollDelta = (scrollRef.current?.scrollLeft ?? startScrollLeft) - startScrollLeft;
      finalX = clampParticipantX(
        content.participants,
        participant.id,
        original + (pointerEvent.clientX - start + scrollDelta) / zoom,
      );
      setParticipantPreview({ [participant.id]: finalX });
    };
    const finish = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      setParticipantPreview({});
      if (Math.abs(finalX - original) > 1) {
        const updated = content.participants.map((candidate) => candidate.id === participant.id ? { ...candidate, x: finalX } : candidate);
        updated.sort((a, b) => a.x - b.x);
        commit({
          ...content,
          participants: updated,
        });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };

  const startNoteDrag = (note: SequenceNote, event: ReactPointerEvent<SVGGElement>): void => {
    if (event.button !== 0 || event.shiftKey || (event.target instanceof Element && event.target.hasAttribute('data-export-control'))) return;
    event.preventDefault();
    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: scrollRef.current?.scrollLeft ?? 0,
      scrollTop: scrollRef.current?.scrollTop ?? 0,
    };
    let position = { x: note.x, y: note.y };
    let didMove = false;
    const move = (pointerEvent: PointerEvent): void => {
      const current = {
        clientX: pointerEvent.clientX,
        clientY: pointerEvent.clientY,
        scrollLeft: scrollRef.current?.scrollLeft ?? start.scrollLeft,
        scrollTop: scrollRef.current?.scrollTop ?? start.scrollTop,
      };
      didMove = didMove || hasMeaningfulSequenceNoteDrag(start, current);
      position = resolveSequenceNoteDragPosition(note, start, current, zoom);
      setNotePreview({ [note.id]: position });
    };
    const finish = (): void => {
      window.removeEventListener('pointermove', move);
      setNotePreview({});
      if (!didMove || (Math.abs(position.x - note.x) <= 1 && Math.abs(position.y - note.y) <= 1)) return;
      commit({ ...content, notes: content.notes.map((candidate) => candidate.id === note.id ? { ...candidate, ...position } : candidate) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };

  const startNoteResize = (
    note: SequenceNote,
    handle: 'corner' | 'right' | 'bottom',
    event: ReactPointerEvent<SVGElement>,
  ): void => {
    event.stopPropagation();
    event.preventDefault();
    const currentBox = layout.noteLayouts.get(note.id) ?? resolveSequenceNoteRect(note);
    const startX = event.clientX;
    const startY = event.clientY;
    const startScrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const startScrollTop = scrollRef.current?.scrollTop ?? 0;
    const startWidth = currentBox.width;
    const startHeight = currentBox.height;

    let size = { width: startWidth, height: startHeight };
    let didMove = false;

    const move = (pointerEvent: PointerEvent): void => {
      const currentScrollLeft = scrollRef.current?.scrollLeft ?? startScrollLeft;
      const currentScrollTop = scrollRef.current?.scrollTop ?? startScrollTop;
      const dx = (pointerEvent.clientX - startX + currentScrollLeft - startScrollLeft) / zoom;
      const dy = (pointerEvent.clientY - startY + currentScrollTop - startScrollTop) / zoom;
      didMove = didMove || Math.abs(dx) >= 1 || Math.abs(dy) >= 1;

      const nextWidth = (handle === 'corner' || handle === 'right')
        ? Math.max(120, Math.round(startWidth + dx))
        : startWidth;

      const minH = getSequenceNoteMinimumHeight({ text: note.text, width: nextWidth });

      const nextHeight = (handle === 'corner' || handle === 'bottom')
        ? Math.max(minH, Math.round(startHeight + dy))
        : Math.max(minH, startHeight);

      size = { width: nextWidth, height: nextHeight };
      setNotePreview({ [note.id]: size });
    };

    const finish = (): void => {
      window.removeEventListener('pointermove', move);
      setNotePreview({});
      if (!didMove || (size.width === startWidth && size.height === startHeight)) return;
      commit({
        ...content,
        notes: content.notes.map((candidate) =>
          candidate.id === note.id ? { ...candidate, ...size } : candidate
        ),
      });
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };

  const handleEditNote = useCallback((noteId: string) => {
    const note = content.notes.find((n) => n.id === noteId);
    const noteBox = layout.noteLayouts.get(noteId);
    if (!note || !noteBox) return;
    setInlineNoteEditor({
      noteId,
      value: note.text,
      x: noteBox.x,
      y: noteBox.y,
      width: noteBox.width,
      height: noteBox.height,
    });
  }, [content.notes, layout.noteLayouts]);

  const commitInlineNoteEdit = useCallback((): void => {
    if (!inlineNoteEditor) return;
    const { noteId, value } = inlineNoteEditor;
    const targetNote = content.notes.find((n) => n.id === noteId);
    if (!targetNote) {
      setInlineNoteEditor(null);
      setNotePreview({});
      return;
    }
    const nextText = value;
    const minHeight = getSequenceNoteMinimumHeight({ text: nextText, width: targetNote.width });
    const nextNotes = content.notes.map((n) =>
      n.id === noteId
        ? { ...n, text: nextText, height: Math.max(n.height, minHeight) }
        : n
    );
    commit({ ...content, notes: nextNotes }, true);
    setNotePreview({});
    setInlineNoteEditor(null);
  }, [commit, content, inlineNoteEditor]);

  const commitInlineFragmentEdit = useCallback((): void => {
    if (!inlineFragmentEditor) return;
    const { kind, fragmentId, operandId, value } = inlineFragmentEditor;
    const trimmed = value.trim();
    if (kind === 'name') {
      const nextItems = updateSequenceItem(content.items, fragmentId, (item) => ({
        ...item,
        name: trimmed,
      }));
      commit(keepAnchoredNotesWithTimeline({ ...content, items: nextItems }), true);
    } else if (kind === 'guard' && operandId) {
      const cleanGuard = trimmed.replace(/^\[/, '').replace(/\]$/, '');
      const nextItems = updateSequenceItem(content.items, fragmentId, (item) => {
        if (item.kind !== 'fragment') return item;
        return {
          ...item,
          operands: item.operands.map((op) => (op.id === operandId ? { ...op, guard: cleanGuard } : op)),
        };
      });
      commit(keepAnchoredNotesWithTimeline({ ...content, items: nextItems }), true);
    }
    setInlineFragmentEditor(null);
  }, [commit, content, inlineFragmentEditor, keepAnchoredNotesWithTimeline]);

  const handleEditFragmentGuard = useCallback(
    (fragmentId: string, operandId: string, currentGuard: string, rect: { x: number; y: number; width: number }) => {
      setInlineFragmentEditor({
        kind: 'guard',
        fragmentId,
        operandId,
        value: currentGuard,
        x: rect.x,
        y: rect.y,
        width: rect.width,
      });
    },
    [],
  );

  const handleEditFragmentName = useCallback(
    (fragmentId: string, currentName: string, rect: { x: number; y: number; width: number }) => {
      setInlineFragmentEditor({
        kind: 'name',
        fragmentId,
        value: currentName,
        x: rect.x,
        y: rect.y,
        width: rect.width,
      });
    },
    [],
  );

  const handleAddFragmentOperand = useCallback(
    (fragmentId: string) => {
      const frag = findSequenceItem(content.items, fragmentId);
      if (!frag || frag.kind !== 'fragment') return;
      const newOperandId = createId();
      const defaultGuard = frag.operator === 'alt' ? 'else' : '';
      const nextItems = updateSequenceItem(content.items, fragmentId, (item) => {
        if (item.kind !== 'fragment') return item;
        return {
          ...item,
          operands: [...item.operands, { id: newOperandId, guard: defaultGuard, items: [] }],
        };
      });
      const saved = commit(keepAnchoredNotesWithTimeline({ ...content, items: nextItems }), true);
      if (saved) {
        showFeedback(frag.operator === 'alt' ? 'Rama else agregada.' : 'Rama agregada al fragmento.');
        setTimeout(() => {
          const updatedLayout = buildSequenceLayout({ ...content, items: nextItems });
          const fragLayout = updatedLayout.fragmentLayouts.get(fragmentId);
          const opLayout = fragLayout?.operands.find((o) => o.id === newOperandId);
          if (fragLayout && opLayout) {
            setInlineFragmentEditor({
              kind: 'guard',
              fragmentId,
              operandId: newOperandId,
              value: defaultGuard,
              x: fragLayout.x + 8,
              y: opLayout.top + 2,
              width: Math.min(260, Math.max(140, fragLayout.width - 30)),
            });
          }
        }, 30);
      }
    },
    [commit, content, keepAnchoredNotesWithTimeline, showFeedback],
  );

  const startFragmentDrag = (fragment: SequenceFragment, event: ReactPointerEvent<SVGGElement>): void => {
    if (event.button !== 0 || event.shiftKey || (event.target instanceof Element && event.target.hasAttribute('data-export-control'))) return;
    event.preventDefault();
    setSelection({ kind: 'fragment', id: fragment.id });
    const box = layout.fragmentLayouts.get(fragment.id);
    const startX = event.clientX;
    const startY = event.clientY;
    const svgAtDown = svgRef.current;
    const startRect = svgAtDown?.getBoundingClientRect();
    const startCanvas = startRect
      ? sequencePointerToCanvas(event, startRect, zoom)
      : sequencePointerToCanvas(event, { left: 0, top: 0 }, zoom);
    const origX = box?.x ?? fragment.x ?? 80;
    const origY = box?.y ?? fragment.y ?? 180;
    const origW = box?.width ?? fragment.width ?? 320;
    const origH = box?.height ?? fragment.height ?? 140;
    let finalPos = { x: origX, y: origY };
    let didMove = false;
    let lastCalculatedChanges: FragmentMoveChanges | null = null;
    let lastValidMoveChanges: FragmentMoveChanges | null = null;
    let currentMoveInvalid = false;
    let currentMoveReason: string | undefined = undefined;

    setBoundaryResizePreview(null);

    const loc = findSequenceItemLocation(content.items, fragment.id);
    let minAllowedY = 60;
    if (loc && loc.containerId !== 'root') {
      const parentEntry = flatEntries.find((e) =>
        e.item.kind === 'fragment' && e.item.operands.some((op) => op.id === loc.containerId),
      );
      if (parentEntry && parentEntry.item.kind === 'fragment') {
        const parentBox = layout.fragmentLayouts.get(parentEntry.item.id);
        const parentOp = parentBox?.operands.find((op) => op.id === loc.containerId);
        if (parentOp) {
          minAllowedY = parentOp.contentTop + 4;
        }
      }
    }

    // The SVG cannot move under the pointer mid-drag, so its box is measured
    // once here instead of forcing a layout on every pointermove. Work is then
    // coalesced to one frame: pointer events fire well above 60Hz on a
    // trackpad, and each pass re-runs absorption, validation and a setState.
    let pendingEvent: PointerEvent | null = null;
    let frame = 0;

    const applyMove = (pointerEvent: PointerEvent): void => {
      const currentCanvas = startRect
        ? sequencePointerToCanvas(pointerEvent, startRect, zoom)
        : sequencePointerToCanvas(pointerEvent, { left: 0, top: 0 }, zoom);
      const dx = currentCanvas.x - startCanvas.x;
      const dy = currentCanvas.y - startCanvas.y;
      const nextX = Math.max(20, Math.round(origX + dx));
      const nextY = Math.max(minAllowedY, Math.round(origY + dy));
      finalPos = { x: nextX, y: nextY };

      // Calculate sliding window real-time absorption and release
      const moveChanges = calculateFragmentMoveChanges(
        content.items,
        baseLayout,
        fragment.id,
        nextY,
        origH,
        lastCalculatedChanges,
      );
      lastCalculatedChanges = moveChanges;

      let previewItems = content.items;

      if (moveChanges && (moveChanges.itemsToAbsorb.length > 0 || moveChanges.itemsToEject.length > 0 || moveChanges.hasHierarchyChanged)) {
        const candidateItems = applyFragmentMoveChanges(content.items, moveChanges);
        const semanticValidation = validateFragmentMoveChanges(content, moveChanges, { existingArtifactIds });
        const mutationGate = applySequenceDiagramMutation(content, { ...content, items: candidateItems });
        const validation = semanticValidation.valid && mutationGate.accepted
          ? semanticValidation
          : {
              ...semanticValidation,
              valid: false,
              reason: semanticValidation.reason ?? mutationGate.newProblems[0]?.message,
            };
        currentMoveInvalid = !validation.valid;
        currentMoveReason = validation.reason;
        const isReallocated = moveChanges.itemsToAbsorb.length === 0 && moveChanges.itemsToEject.length === 0 && moveChanges.hasHierarchyChanged;
        setBoundaryResizePreview({
          fragmentId: fragment.id,
          absorbedIds: moveChanges.itemsToAbsorb.map((it) => it.id),
          ejectedIds: moveChanges.itemsToEject.map((it) => it.id),
          isValid: validation.valid,
          reason: validation.reason,
          edge: 'move',
          isReallocated,
        });
        lastValidMoveChanges = validation.valid ? moveChanges : null;
        if (validation.valid) {
          previewItems = candidateItems;
        }
      } else {
        currentMoveInvalid = false;
        currentMoveReason = undefined;
        setBoundaryResizePreview(null);
        lastValidMoveChanges = null;
      }

      // El preview usa el mismo árbol que se aplicará al soltar, con la
      // geometría transitoria del fragmento ya incorporada.
      const previewItemsWithGeometry = updateSequenceItem(previewItems, fragment.id, (item) => {
        if (item.kind !== 'fragment') return item;
        return { ...item, x: nextX, y: nextY, width: origW, height: origH };
      });
      setActiveFragmentResize({
        id: fragment.id,
        x: nextX,
        y: nextY,
        width: origW,
        height: origH,
        isMove: true,
        previewItems: previewItemsWithGeometry,
      });
    };

    const move = (pointerEvent: PointerEvent): void => {
      const rawDeltaX = Math.abs(pointerEvent.clientX - startX);
      const rawDeltaY = Math.abs(pointerEvent.clientY - startY);
      if (rawDeltaX > 3 || rawDeltaY > 3) {
        didMove = true;
      }
      if (!didMove) return;

      pendingEvent = pointerEvent;
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const queued = pendingEvent;
        pendingEvent = null;
        if (queued !== null) applyMove(queued);
      });
    };

    const finish = (): void => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      pendingEvent = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      setActiveFragmentResize(null);
      setBoundaryResizePreview(null);

      if (!didMove) return;

      if (currentMoveInvalid) {
        showFeedback(`Movimiento no permitido: ${currentMoveReason || 'infracción de ciclo de vida'}`);
        return;
      }

      if (lastValidMoveChanges && lastValidMoveChanges.hasHierarchyChanged) {
        const newItems = applyFragmentMoveChanges(content.items, lastValidMoveChanges);
        const updatedItems = updateSequenceItem(newItems, fragment.id, (item) => {
          if (item.kind !== 'fragment') return item;
          return {
            ...item,
            x: finalPos.x,
            y: finalPos.y,
            width: origW,
            height: origH,
          };
        });
        const saved = commit(keepAnchoredNotesWithTimeline({ ...content, items: updatedItems }), true);
        if (saved) {
          setSelection({ kind: 'fragment', id: fragment.id });
          const numAbsorbed = lastValidMoveChanges.itemsToAbsorb.length;
          const numEjected = lastValidMoveChanges.itemsToEject.length;
          if (numAbsorbed > 0 && numEjected > 0) {
            showFeedback(`Fragmento actualizado: ${numAbsorbed} mensaje(s) incorporado(s), ${numEjected} liberado(s).`);
          } else if (numAbsorbed > 0) {
            showFeedback(`Fragmento movido: ${numAbsorbed} mensaje(s) incorporado(s).`);
          } else if (numEjected > 0) {
            showFeedback(`Fragmento movido: ${numEjected} mensaje(s) liberado(s).`);
          } else {
            showFeedback('Fragmento reubicado.');
          }
        }
        return;
      }

      if (Math.abs(finalPos.x - origX) > 4 || Math.abs(finalPos.y - origY) > 4) {
        const nextItems = updateSequenceItem(content.items, fragment.id, (item) => {
          if (item.kind !== 'fragment') return item;
          return {
            ...item,
            x: finalPos.x,
            y: finalPos.y,
            width: origW,
            height: origH,
          };
        });
        const saved = commit(keepAnchoredNotesWithTimeline({
          ...content,
          items: nextItems,
        }), true);
        if (saved) {
          showFeedback('Posición del fragmento actualizada.');
        }
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };

  const startFragmentResize = (
    fragment: SequenceFragment,
    handle: 'nw' | 'ne' | 'se' | 'sw' | 'e' | 's' | 'w' | 'n',
    event: ReactPointerEvent<SVGElement>,
  ): void => {
    event.stopPropagation();
    event.preventDefault();
    setSelection({ kind: 'fragment', id: fragment.id });
    setBoundaryResizePreview(null);
    const box = layout.fragmentLayouts.get(fragment.id);
    const origX = box?.x ?? fragment.x ?? 80;
    const origY = box?.y ?? fragment.y ?? 100;
    const origW = box?.width ?? fragment.width ?? 320;
    const origH = box?.height ?? fragment.height ?? 140;
    const minimumWidth = box?.minWidth ?? 140;
    const svgAtDown = svgRef.current;
    const startRect = svgAtDown?.getBoundingClientRect();
    const startCanvas = startRect
      ? sequencePointerToCanvas(event, startRect, zoom)
      : sequencePointerToCanvas(event, { left: 0, top: 0 }, zoom);
    const isTopHandle = handle === 'n' || handle === 'nw' || handle === 'ne';
    const isBottomHandle = handle === 's' || handle === 'se' || handle === 'sw';
    // Permitir achicar hasta la cabecera + margen para expulsar mensajes cómodamente
    const minimumHeight = Math.max(48, (box?.headerHeight ?? 24) + 16);

    const loc = findSequenceItemLocation(content.items, fragment.id);
    let minAllowedY = 60;
    if (loc && loc.containerId !== 'root') {
      const parentEntry = flatEntries.find((e) =>
        e.item.kind === 'fragment' && e.item.operands.some((op) => op.id === loc.containerId),
      );
      if (parentEntry && parentEntry.item.kind === 'fragment') {
        const parentBox = layout.fragmentLayouts.get(parentEntry.item.id);
        const parentOp = parentBox?.operands.find((op) => op.id === loc.containerId);
        if (parentOp) {
          minAllowedY = parentOp.contentTop + 4;
        }
      }
    }

    let finalGeom = { x: origX, y: origY, width: origW, height: origH };
    let didChange = false;
    let lastValidBoundaryChanges: FragmentBoundaryChanges | null = null;
    let currentBoundaryInvalid = false;
    let currentBoundaryReason: string | undefined = undefined;

    const move = (pointerEvent: PointerEvent): void => {
      const currentRect = svgRef.current?.getBoundingClientRect();
      const currentCanvas = currentRect
        ? sequencePointerToCanvas(pointerEvent, currentRect, zoom)
        : sequencePointerToCanvas(pointerEvent, { left: 0, top: 0 }, zoom);
      const dx = currentCanvas.x - startCanvas.x;
      const dy = currentCanvas.y - startCanvas.y;
      let nextX = origX;
      let nextY = origY;
      let nextW = origW;
      let nextH = origH;

      if (handle === 'se' || handle === 'e' || handle === 'ne') {
        nextW = Math.max(minimumWidth, Math.round(origW + dx));
      } else if (handle === 'sw' || handle === 'w' || handle === 'nw') {
        const candidateW = origW - dx;
        if (candidateW >= minimumWidth) {
          nextX = Math.max(20, Math.round(origX + dx));
          nextW = Math.round(candidateW);
        } else {
          nextX = origX + origW - minimumWidth;
          nextW = minimumWidth;
        }
      }

      if (handle === 'se' || handle === 's' || handle === 'sw') {
        nextH = Math.max(minimumHeight, Math.round(origH + dy));
      } else if (handle === 'ne' || handle === 'n' || handle === 'nw') {
        const candidateH = origH - dy;
        if (candidateH >= minimumHeight) {
          nextY = Math.max(minAllowedY, Math.round(origY + dy));
          nextH = Math.round(candidateH);
        } else {
          nextY = origY + origH - minimumHeight;
          nextH = minimumHeight;
        }
      }

      finalGeom = { x: nextX, y: nextY, width: nextW, height: nextH };
      didChange = nextX !== origX || nextY !== origY || nextW !== origW || nextH !== origH;

      // Calcular absorción o expulsión de mensajes en tiempo real
      const boundaryChanges = calculateFragmentBoundaryChanges(
        content.items,
        baseLayout,
        fragment.id,
        nextY,
        nextH,
        handle,
      );

      let previewItems = content.items;

      if (boundaryChanges && (boundaryChanges.itemsToAbsorb.length > 0 || boundaryChanges.itemsToEject.length > 0)) {
        const candidateItems = applyFragmentBoundaryChanges(content.items, boundaryChanges);
        const semanticValidation = validateFragmentBoundaryChanges(content, boundaryChanges, { existingArtifactIds });
        const mutationGate = applySequenceDiagramMutation(content, { ...content, items: candidateItems });
        const validation = semanticValidation.valid && mutationGate.accepted
          ? semanticValidation
          : {
              ...semanticValidation,
              valid: false,
              reason: semanticValidation.reason ?? mutationGate.newProblems[0]?.message,
            };
        currentBoundaryInvalid = !validation.valid;
        currentBoundaryReason = validation.reason;
        setBoundaryResizePreview({
          fragmentId: fragment.id,
          absorbedIds: boundaryChanges.itemsToAbsorb.map((it) => it.id),
          ejectedIds: boundaryChanges.itemsToEject.map((it) => it.id),
          isValid: validation.valid,
          reason: validation.reason,
          edge: boundaryChanges.edge,
        });
        lastValidBoundaryChanges = validation.valid ? boundaryChanges : null;
        if (validation.valid) {
          previewItems = candidateItems;
        }
      } else {
        currentBoundaryInvalid = false;
        currentBoundaryReason = undefined;
        setBoundaryResizePreview(null);
        lastValidBoundaryChanges = null;
      }

      // El árbol mostrado durante el resize es el mismo que se aplicará al
      // soltar; sólo la geometría permanece transitoria hasta el commit.
      const previewItemsWithGeometry = updateSequenceItem(previewItems, fragment.id, (item) => {
        if (item.kind !== 'fragment') return item;
        return {
          ...item,
          x: finalGeom.x,
          width: finalGeom.width,
          height: isBottomHandle || isTopHandle ? finalGeom.height : item.height,
          y: isTopHandle ? finalGeom.y : item.y,
        };
      });
      setActiveFragmentResize({
        id: fragment.id,
        x: nextX,
        y: nextY,
        width: nextW,
        height: nextH,
        previewItems: previewItemsWithGeometry,
      });
    };

    const finish = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      setActiveFragmentResize(null);
      setBoundaryResizePreview(null);

      const isTop = handle === 'n' || handle === 'nw' || handle === 'ne';
      const isBottom = handle === 's' || handle === 'se' || handle === 'sw';

      if (currentBoundaryInvalid) {
        showFeedback(currentBoundaryReason ?? 'No se pudo redimensionar: operación no válida para la estructura del diagrama.');
        return;
      }

      if (lastValidBoundaryChanges) {
        const newItems = applyFragmentBoundaryChanges(content.items, lastValidBoundaryChanges);
        const updatedItems = updateSequenceItem(newItems, fragment.id, (item) => {
          if (item.kind !== 'fragment') return item;
          return {
            ...item,
            x: finalGeom.x,
            width: finalGeom.width,
            height: isBottom || isTop ? finalGeom.height : item.height,
            y: isTop ? finalGeom.y : item.y,
          };
        });
        const saved = commit(keepAnchoredNotesWithTimeline({ ...content, items: updatedItems }), true);
        if (saved) {
          const numAbsorbed = lastValidBoundaryChanges.itemsToAbsorb.length;
          const numEjected = lastValidBoundaryChanges.itemsToEject.length;
          if (numAbsorbed > 0 && numEjected > 0) {
            showFeedback(`Fragmento actualizado: ${numAbsorbed} mensaje(s) incorporado(s), ${numEjected} liberado(s).`);
          } else if (numAbsorbed > 0) {
            showFeedback(`Fragmento expandido: ${numAbsorbed} mensaje(s) incorporado(s).`);
          } else if (numEjected > 0) {
            showFeedback(`Fragmento reducido: ${numEjected} mensaje(s) liberado(s).`);
          }
        }
      } else if (didChange) {
        const nextItems = updateSequenceItem(content.items, fragment.id, (item) => {
          if (item.kind !== 'fragment') return item;
          return {
            ...item,
            x: finalGeom.x,
            width: finalGeom.width,
            height: isBottom || isTop ? finalGeom.height : item.height,
            y: isTop ? finalGeom.y : item.y,
          };
        });
        const saved = commit(keepAnchoredNotesWithTimeline({ ...content, items: nextItems }), true);
        if (saved) showFeedback('Tamaño del fragmento actualizado.');
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };


  const updateParticipant = (id: string, values: Partial<SequenceParticipant>): void => {
    setParticipantEditDraft((current) => current?.id === id ? null : current);
    void commit({
      ...content,
      participants: content.participants.map((participant) => participant.id === id ? { ...participant, ...values } : participant),
    }, false);
  };
  const moveParticipantHorizontal = (participantId: string, direction: -1 | 1): void => {
    const updated = reorderSequenceParticipants(content.participants, participantId, direction);
    if (!updated || updated.every((participant) => {
      const before = content.participants.find((candidate) => candidate.id === participant.id);
      return before?.x === participant.x;
    })) return;
    commit({ ...content, participants: updated });
  };
  const updateNote = (id: string, values: Partial<SequenceNote>): void => { void commit({
    ...content,
    notes: content.notes.map((note) => {
      if (note.id !== id) return note;
      const next = { ...note, ...values };
      return { ...next, height: Math.max(next.height, getSequenceNoteMinimumHeight(next)) };
    }),
  }, false); };
  const updateItem = (id: string, values: Partial<SequenceMessage> | Partial<SequenceFragment>): void => { void commit(keepAnchoredNotesWithTimeline({
    ...content,
    items: updateSequenceItem(content.items, id, (item) => ({ ...item, ...values } as SequenceTimelineItem)),
  }), false); };
  const updateMessageEditModel = (id: string, changes: Partial<SequenceMessageEditModel>): void => {
    const message = findSequenceItem(content.items, id);
    if (message?.kind !== 'message') return;
    const model = updateSequenceMessageEditModel(sequenceMessageEditModelFromMessage(message), changes);
    const patched = sequenceMessageEditModelToPatch(model);
    const wasCreate = message.type === 'create';
    const isCreate = patched.type === 'create';
    const wasDestroy = message.type === 'destroy';
    const isDestroy = patched.type === 'destroy';
    const oldTarget = message.targetId;
    const newTarget = patched.targetId ?? message.targetId;

    let nextParticipants = content.participants;
    if (wasCreate || isCreate || wasDestroy || isDestroy) {
      nextParticipants = content.participants.map((p) => {
        let nextP = p;
        if (wasCreate && nextP.id === oldTarget && (!isCreate || oldTarget !== newTarget)) {
          if (nextP.createdByMessageId === id) {
            nextP = { ...nextP, createdByMessageId: undefined };
          }
        }
        if (isCreate && nextP.id === newTarget) {
          nextP = { ...nextP, createdByMessageId: id };
        }
        if (wasDestroy && nextP.id === oldTarget && (!isDestroy || oldTarget !== newTarget)) {
          if (nextP.destroyedByMessageId === id) {
            nextP = { ...nextP, destroyedByMessageId: undefined };
          }
        }
        if (isDestroy && nextP.id === newTarget) {
          nextP = { ...nextP, destroyedByMessageId: id };
        }
        return nextP;
      });
    }
    void commit(keepAnchoredNotesWithTimeline({
      ...content,
      participants: nextParticipants,
      items: updateSequenceItem(content.items, id, (item) => ({ ...item, ...patched } as SequenceTimelineItem)),
    }), false);
  };

  const createClassMethodFromSelectedMessage = (): void => {
    if (selectedItem?.kind !== 'message' || onCreateClassMethod === undefined || associatedClassDiagram === undefined) {
      return;
    }

    if (selectedItem.type !== 'synchronous' && selectedItem.type !== 'asynchronous') {
      return;
    }

    const participant = content.participants.find((candidate) => candidate.id === selectedItem.targetId);
    const classNode = associatedClassDiagram.content.nodes.find((candidate) =>
      (participant?.classifierNodeId !== undefined && candidate.id === participant.classifierNodeId)
      || (participant?.classifierNodeId === undefined
        && participant?.classifierName.trim().toLocaleLowerCase() === candidate.data.name.trim().toLocaleLowerCase()),
    );
    // The message's arguments are what this call passes, not the method's
    // signature: the method is matched and created by name alone.
    const methodName = selectedItem.name.replace(/\(.*$/, '').trim();

    if (classNode === undefined || methodName.length === 0) {
      showFeedback('Seleccioná una clase y escribí una operación antes de sincronizar.');
      return;
    }

    const matchingMethod = classNode.data.methods.find((method) =>
      method.name.trim().toLocaleLowerCase() === methodName.toLocaleLowerCase(),
    );

    if (matchingMethod !== undefined) {
      updateMessageEditModel(selectedItem.id, { operationMethodId: matchingMethod.id });
      showFeedback('Mensaje vinculado con el método existente.');
      return;
    }

    const method: ClassMethod = {
      id: createId(),
      visibility: '+',
      name: methodName,
      parameters: '',
      returnType: selectedItem.returnType.trim(),
    };
    onCreateClassMethod(associatedClassDiagram.id, classNode.id, method);
    updateMessageEditModel(selectedItem.id, { operationMethodId: method.id });
    showFeedback(`Método ${method.name} agregado al modelo compartido.`);
  };
  const invertMessage = (id: string): void => {
    const message = findSequenceItem(content.items, id);
    if (message?.kind !== 'message') return;
    const candidate = { ...sequenceMessageEditModelFromMessage(message), sourceId: message.targetId, targetId: message.sourceId };
    const methodsForNewTarget = getSequenceMethodOptions({ model: candidate, participants: content.participants, classDiagram: associatedClassDiagram });
    updateItem(id, sequenceMessageEditModelToPatch(swapSequenceMessageEditModel(sequenceMessageEditModelFromMessage(message), methodsForNewTarget)));
  };

  const hasOutlineMatches = useMemo(() => {
    if (searchQuery.trim().length === 0) return true;
    return content.items.some((item) => sequenceItemMatchesSearch(item, searchQuery));
  }, [content.items, searchQuery]);

  const renderOutline = (items: SequenceTimelineItem[], depth = 0): ReactNode => items.map((item) => {
    if (!sequenceItemMatchesSearch(item, searchQuery)) return null;
    const isCollapsed = item.kind === 'fragment' && collapsedFragments.has(item.id);
    return (
      <div key={item.id} className="sequence-outline-group">
        <button
          aria-current={selection?.id === item.id || selectedTimelineIds.includes(item.id) ? 'true' : undefined}
          aria-label={`Seleccionar ${item.kind === 'fragment' ? `fragmento ${item.operator}` : item.type === 'return' ? 'retorno' : formatSequenceMessageLabel(item)}`}
          className={`sequence-outline-item ${selection?.id === item.id || selectedTimelineIds.includes(item.id) ? 'active' : ''} ${outlineDropTargetId === item.id ? 'drop-target' : ''}`}
          draggable
          style={{ paddingLeft: 10 + depth * 16 }}
          type="button"
          onClick={(event) => {
            if (event.shiftKey || event.metaKey || event.ctrlKey) {
              handleTimelineItemSelect(item.id, true);
            } else {
              selectOutlineItem({ kind: item.kind, id: item.id });
              if (window.matchMedia('(max-width: 920px)').matches) {
                updateOutlineVisibility(false);
              }
            }
          }}
          onDragStart={() => setDraggedOutlineItemId(item.id)}
          onDragEnd={() => { setDraggedOutlineItemId(null); setOutlineDropTargetId(null); }}
          onDragOver={(event) => { event.preventDefault(); setOutlineDropTargetId(item.id); }}
          onDrop={(event) => { event.preventDefault(); dropOutlineItem(item.id); }}
        >
          {item.kind === 'fragment' ? (
            <span
              className="sequence-collapse-control"
              onClick={(event) => {
                event.stopPropagation();
                setCollapsedFragments((current) => {
                  const next = new Set(current);
                  if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                  return next;
                });
              }}
            >{isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</span>
          ) : <span className="sequence-outline-dot" />}
          <span>
            <strong>{item.kind === 'fragment' ? item.operator : item.type === 'return' ? 'Retorno' : formatSequenceMessageLabel(item)}</strong>
            {item.kind === 'fragment' ? <small>{item.name || 'Bloque combinado'}</small> : <small>{messageTypeLabels[item.type]}</small>}
          </span>
        </button>
        {item.kind === 'fragment' && !isCollapsed ? item.operands.map((operand) => (
          <div className="sequence-outline-operand" key={operand.id}>
            <span style={{ paddingLeft: 24 + depth * 16 }}>[{operand.guard || 'condición'}]</span>
            {renderOutline(operand.items, depth + 1)}
          </div>
        )) : null}
      </div>
    );
  });

  const importJson = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result));
        if (!isImportableProject(parsed)) {
          showFeedback(IMPORT_INVALID_MESSAGE);
          return;
        }
        onImportProject(normalizeDiagramProject(parsed));
        showFeedback('Proyecto importado');
      } catch {
        showFeedback(IMPORT_UNREADABLE_MESSAGE);
      }
    };
    reader.readAsText(file);
  };

  const exportPng = async (): Promise<void> => {
    if (!exportSvgRef.current) return;
    try {
      await exportSequencePng(exportSvgRef.current, artifact.name, layout);
      showFeedback('PNG exportado');
      setExportDialogOpen(false);
    } catch (error) {
      void notify({
        title: 'No se pudo exportar el PNG',
        description: error instanceof Error ? error.message : 'Volvé a intentarlo en unos segundos.',
      });
    }
  };

  const exportPdf = async (): Promise<void> => {
    if (!exportSvgRef.current) return;
    try {
      const plan = await exportSequencePdf(exportSvgRef.current, artifact.name, displayContent, layout, exportOptions);
      showFeedback(`PDF exportado (${plan?.pages.length ?? 1} página${plan?.pages.length === 1 ? '' : 's'})`);
      setExportDialogOpen(false);
    } catch (error) {
      void notify({
        title: 'No se pudo exportar el PDF',
        description: error instanceof Error ? error.message : 'Volvé a intentarlo en unos segundos.',
      });
    }
  };

  const locations = flatEntries.filter((entry) => entry.item.kind === 'fragment').flatMap((entry) => {
    const fragment = entry.item as SequenceFragment;
    return fragment.operands.map((operand, index) => ({ value: `${fragment.id}:${operand.id}`, label: `${fragment.operator} · ${operand.guard || `sección ${index + 1}`}` }));
  });
  const participantNames = useMemo(() => new Map(content.participants.map((participant) => [participant.id, formatSequenceParticipantName(participant)])), [content.participants]);
  const messageCount = flatEntries.filter((entry) => entry.item.kind === 'message').length;
  const keyboardSourceParticipant = content.participants.find((participant) => participant.id === keyboardMode.sourceId);
  const keyboardTargetParticipant = content.participants.find((participant) => participant.id === keyboardMode.targetId);
  const keyboardCreatedParticipant = parseSequenceCreatedParticipant(keyboardMode.text);
  const keyboardGhostX = keyboardMode.messageType === 'create' && content.participants.length > 0
    ? keyboardMode.createSide < 0
      ? Math.max(90, Math.min(...content.participants.map((participant) => participant.x)) - 230)
      : Math.max(...content.participants.map((participant) => participant.x)) + 230
    : undefined;
  const keyboardRouteMidpoint = keyboardSlot
    ? ((layout.participantX.get(keyboardMode.sourceId) ?? 120)
      + (keyboardGhostX ?? layout.participantX.get(keyboardMode.targetId) ?? layout.participantX.get(keyboardMode.sourceId) ?? 120)) / 2
    : 120;
  const isKeyboardActive = keyboardMode.stage !== 'off'
    && Boolean(keyboardSlot)
    && (Boolean(keyboardSourceParticipant) || keyboardMode.stage === 'navigate' || keyboardMode.stage === 'participant');
  const rawSlotY = keyboardSlot?.y ?? layout.timelineStart;
  const keyboardGuideHeight = isKeyboardActive ? 38 : 0;
  const slotScreenY = rawSlotY * zoom - scrollPosition.top + keyboardGuideHeight;
  const isPopoverBelow = rawSlotY < 180;
  const keyboardPopoverPlacement: 'above' | 'below' = isPopoverBelow ? 'below' : 'above';
  const popoverHalfWidth = keyboardMode.stage === 'navigate' ? 70 : 188;
  const keyboardPopoverPosition = {
    left: `clamp(${popoverHalfWidth}px, ${keyboardRouteMidpoint * zoom - scrollPosition.left}px, calc(100% - ${popoverHalfWidth}px))`,
    top: isPopoverBelow
      ? `clamp(46px, ${slotScreenY}px, calc(100% - 80px))`
      : `clamp(60px, ${slotScreenY}px, calc(100% - 28px))`,
  };
  const keyboardContext = keyboardSlot?.containerName ?? 'Secuencia principal';
  const keyboardTargetName = keyboardMode.messageType === 'create'
    ? `${keyboardCreatedParticipant.name ? `${keyboardCreatedParticipant.name} : ` : ':'}${keyboardCreatedParticipant.classifierName}`
    : keyboardTargetParticipant ? formatSequenceParticipantName(keyboardTargetParticipant) : 'Elegí un destino';
  const keyboardInstruction = isKeyboardActive ? getSequenceKeyboardInstruction(keyboardMode) : '';
  const keyboardCanvasPreview = keyboardMode.stage !== 'off' && keyboardSlot && keyboardSourceParticipant
    ? {
        stage: keyboardMode.stage === 'fragment' || keyboardMode.stage === 'guard' ? keyboardMode.stage : keyboardMode.stage,
        y: keyboardSlot.y,
        sourceId: keyboardMode.sourceId,
        targetId: keyboardMode.messageType === 'create' ? undefined : keyboardMode.targetId || keyboardMode.sourceId,
        targetX: keyboardGhostX,
        type: keyboardMode.messageType,
        label: keyboardMode.stage === 'typing' ? keyboardMode.text : undefined,
        valid: true,
        ghost: keyboardMode.messageType === 'create' && (keyboardMode.stage === 'aim' || keyboardMode.stage === 'typing')
          ? { kind: keyboardMode.createKind, label: keyboardTargetName }
          : undefined,
      }
    : null;
  const visibleInsertionGuide = keyboardMode.stage !== 'off' && keyboardSlot
    ? {
        y: keyboardSlot.y,
        isValid: true,
        containerName: keyboardSlot.containerName,
        bounds: keyboardSlot.bounds ? { x: keyboardSlot.bounds.x, width: keyboardSlot.bounds.width } : undefined,
      }
    : insertionGuide;

  const participantInspector = selectedParticipant ? (
    <>
      <div className="sequence-inspector-heading">
        <div>
          <span className="sequence-inspector-badge participant-badge">PARTICIPANTE</span>
          <h3>{formatSequenceParticipantName(selectedParticipant)}</h3>
        </div>
        <button
          aria-label="Eliminar participante"
          className="icon-button danger"
          type="button"
          title="Eliminar participante"
          onClick={deleteSelection}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="sequence-compact-action-row" style={{ marginTop: 2, marginBottom: 10 }}>
        <button
          className="secondary-action-sm"
          type="button"
          title="Mover participante a la izquierda"
          onClick={() => moveParticipantHorizontal(selectedParticipant.id, -1)}
        >
          <ArrowLeft size={13} /> Mover Izq
        </button>
        <button
          className="secondary-action-sm"
          type="button"
          title="Mover participante a la derecha"
          onClick={() => moveParticipantHorizontal(selectedParticipant.id, 1)}
        >
          <ArrowRight size={13} /> Mover Der
        </button>
      </div>

      {/* Identificación UML textual: el tipo persistido queda como compatibilidad interna. */}
      <label style={{ marginBottom: 10 }}>
        <span>Identificación UML</span>
        <input
          className="sequence-compact-input"
          value={participantEditText}
          onChange={(event) => updateParticipantLabel(selectedParticipant.id, event.target.value)}
          placeholder="TramiteActual:Tramite o :Clase"
        />
        <small className="sequence-inspector-hint" style={{ marginTop: 4, display: 'block' }}>
          La instancia puede quedar vacía antes de “:”.
        </small>
      </label>

      <details className="sequence-inspector-section sequence-collapsible-section" style={{ marginBottom: 10 }}>
        <summary><h4>Opciones técnicas</h4></summary>
        <span style={{ fontSize: '0.72rem', color: 'var(--panel-muted-text)' }}>Tipo interno (compatibilidad)</span>
        <div className="sequence-participant-kind-grid" style={{ marginTop: 6 }}>
          {(['object', 'actor', 'boundary', 'control', 'entity'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className={`sequence-participant-kind-pill ${selectedParticipant.kind === kind ? 'active' : ''}`}
              onClick={() => updateParticipant(selectedParticipant.id, { kind })}
            >
              {participantKindLabels[kind]}
            </button>
          ))}
        </div>
        {/* El vínculo al diagrama de clases sigue disponible, pero no interrumpe
            el flujo textual principal del participante. */}
        {selectedParticipant.kind !== 'actor' ? (
          <label style={{ marginTop: 10 }}>
            <span>Vincular con clase del modelo</span>
            <select
              value={selectedParticipant.classifierNodeId ?? ''}
              onChange={(event) => {
                const node = associatedClassDiagram?.content.nodes.find((candidate) => candidate.id === event.target.value);
                updateParticipant(selectedParticipant.id, {
                  classifierNodeId: event.target.value || undefined,
                  classifierName: node?.data.name || selectedParticipant.classifierName,
                });
              }}
            >
              <option value="">Sin vínculo (manual)</option>
              {associatedClassDiagram?.content.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.data.name || 'Clase sin nombre'}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </details>

      {/* Terminar línea de vida con cruz */}
      <div style={{ marginTop: 8, marginBottom: 10 }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '0.78rem',
            cursor: selectedParticipant.destroyedByMessageId !== undefined ? 'default' : 'pointer',
            userSelect: 'none',
            opacity: selectedParticipant.destroyedByMessageId !== undefined ? 0.75 : 1,
          }}
          title={
            selectedParticipant.destroyedByMessageId !== undefined
              ? 'Finaliza automáticamente por el mensaje de destrucción asociado'
              : undefined
          }
        >
          <input
            type="checkbox"
            disabled={selectedParticipant.destroyedByMessageId !== undefined}
            checked={
              selectedParticipant.destroyedByMessageId !== undefined
                ? true
                : (selectedParticipant.terminateLifeline ?? (selectedParticipant.createdByMessageId !== undefined))
            }
            onChange={(event) => updateParticipant(selectedParticipant.id, { terminateLifeline: event.target.checked })}
          />
          <span>Terminar línea de vida con cruz (X) al finalizar participación</span>
        </label>
      </div>

      {/* Activaciones manuales */}
      <details className="sequence-inspector-section sequence-collapsible-section" style={{ marginTop: 8 }}>
        <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4>Activaciones manuales ({content.activations.filter((a) => a.manual && a.participantId === selectedParticipant.id).length})</h4>
        </summary>
        <div style={{ marginTop: 8 }}>
          <button
            className="secondary-action-sm"
            type="button"
            style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
            onClick={() => {
              const participantMessages = layout.orderedMessages.filter(
                (message) => message.sourceId === selectedParticipant.id || message.targetId === selectedParticipant.id
              );
              if (participantMessages.length === 0) return;
              const activation: SequenceActivation = {
                id: createId(),
                participantId: selectedParticipant.id,
                startMessageId: participantMessages[0].id,
                endMessageId: participantMessages.at(-1)?.id,
                level: 0,
                manual: true,
              };
              commit({ ...content, activations: [...content.activations, activation] });
            }}
          >
            <Plus size={13} /> Nueva activación manual
          </button>
          {content.activations
            .filter((activation) => activation.manual && activation.participantId === selectedParticipant.id)
            .map((activation) => (
              <div className="sequence-activation-row" key={activation.id} style={{ marginBottom: 6 }}>
                <select
                  value={activation.startMessageId}
                  onChange={(event) =>
                    commit({
                      ...content,
                      activations: content.activations.map((c) =>
                        c.id === activation.id ? { ...c, startMessageId: event.target.value } : c
                      ),
                    })
                  }
                >
                  {layout.orderedMessages.map((message, index) => (
                    <option key={message.id} value={message.id}>
                      Inicio · #{index + 1} {message.type === 'return' ? 'Retorno' : (message.name || messageTypeLabels[message.type])}
                    </option>
                  ))}
                </select>
                <select
                  value={activation.endMessageId ?? ''}
                  onChange={(event) =>
                    commit({
                      ...content,
                      activations: content.activations.map((c) =>
                        c.id === activation.id ? { ...c, endMessageId: event.target.value || undefined } : c
                      ),
                    })
                  }
                >
                  <option value="">Fin · Automático</option>
                  {layout.orderedMessages.map((message, index) => (
                    <option key={message.id} value={message.id}>
                      Fin · #{index + 1} {message.type === 'return' ? 'Retorno' : (message.name || messageTypeLabels[message.type])}
                    </option>
                  ))}
                </select>
                <button
                  aria-label="Eliminar activación manual"
                  className="icon-button"
                  type="button"
                  title="Eliminar activación manual"
                  onClick={() =>
                    commit({
                      ...content,
                      activations: content.activations.filter((c) => c.id !== activation.id),
                    })
                  }
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
        </div>
      </details>
    </>
  ) : null;

  const addMessageToOperand = (fragmentId: string, operandId: string): void => {
    if (content.participants.length < 1) {
      showFeedback('Agregá al menos un participante antes de crear mensajes.');
      return;
    }
    const sourceId = content.participants[0].id;
    const targetId = content.participants[1]?.id ?? content.participants[0].id;
    const msg = createSequenceMessage('synchronous', sourceId, targetId);
    msg.name = 'operación';
    const nextItems = insertSequenceItem(content.items, msg, { fragmentId, operandId });
    const saved = commit(keepAnchoredNotesWithTimeline({ ...content, items: nextItems }), true);
    if (!saved) return;
    setSelection({ kind: 'message', id: msg.id });
    showFeedback('Mensaje agregado dentro del fragmento.');
  };

  const addFragmentToOperand = (
    fragmentId: string,
    operandId: string,
    operator: SequenceFragmentOperator = 'opt',
  ): void => {
    const nested = createSequenceFragment(operator);
    const nextItems = insertSequenceItem(content.items, nested, { fragmentId, operandId });
    const saved = commit(keepAnchoredNotesWithTimeline({ ...content, items: nextItems }), true);
    if (!saved) return;
    setSelection({ kind: 'fragment', id: nested.id });
    showFeedback(`${operator} creado dentro del fragmento. Podés cambiar su tipo en el inspector.`);
  };

  const startInspectorResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (inspectorCollapsed) return;
    event.preventDefault();
    const startX = event.clientX;
    const startW = inspectorWidth;
    const onPointerMove = (moveEvent: PointerEvent): void => {
      const dx = startX - moveEvent.clientX;
      setInspectorWidth(Math.max(260, Math.min(480, Math.round(startW + dx))));
    };
    const onPointerUp = (): void => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  };

  const messageInspector = selectedItem?.kind === 'message' ? (() => {
    const parentLoc = findParentLocation(content, selectedItem.id);
    const signatureValue = formatMessageSignature(selectedItem);

    return (
      <div className="sequence-message-inspector-root">
        {/* Header with badge and 1-line action toolbar */}
        <div className="sequence-inspector-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`sequence-inspector-badge message-badge ${selectedItem.type}`}>
              {selectedItem.type === 'synchronous' ? 'SÍNCRONO' : selectedItem.type === 'asynchronous' ? 'ASÍNCRONO' : selectedItem.type === 'return' ? 'RETORNO' : selectedItem.type.toUpperCase()}
            </span>
            <h3>{selectedItem.type === 'return' ? 'Retorno' : selectedItem.name || 'Mensaje sin nombre'}</h3>
          </div>
          <button aria-label="Eliminar mensaje" className="icon-button danger" type="button" title="Eliminar mensaje" onClick={deleteSelection}><Trash2 size={16} /></button>
        </div>

        <div className="sequence-compact-action-row" style={{ marginTop: 4 }}>
          <button className="secondary-action" type="button" onClick={() => moveSelectedItem(-1)} title="Mover arriba (Alt+↑)"><ArrowUp size={13} /> Subir</button>
          <button className="secondary-action" type="button" onClick={() => moveSelectedItem(1)} title="Mover abajo (Alt+↓)"><ArrowDown size={13} /> Bajar</button>
          <button className="secondary-action" type="button" onClick={() => invertMessage(selectedItem.id)} title="Invertir dirección (origen ↔ destino)"><ArrowLeftRight size={13} /> Invertir</button>
          <button className="secondary-action" type="button" onClick={duplicateSelectedItem} title="Duplicar (⌘D)"><Copy size={13} /> Duplicar</button>
        </div>

        {/* 1. Direct Signature Textarea right at the top */}
        {selectedItem.type !== 'return' ? <div style={{ marginTop: 10 }}>
          <label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--panel-muted-text, #60717f)' }}>
                Firma del mensaje
              </span>
              <span style={{ fontSize: '0.65rem', color: 'var(--panel-muted-text, #60717f)' }}>auto-wrap</span>
            </div>
            <textarea
              rows={3}
              className="sequence-inspector-signature-textarea"
              value={signatureValue}
              placeholder="Ej: buscar(id): Caso"
              onChange={(e) => {
                const parsed = parseMessageSignature(e.target.value);
                updateMessageEditModel(selectedItem.id, {
                  name: parsed.name,
                  arguments: parsed.arguments,
                  returnType: parsed.returnType,
                });
              }}
            />
          </label>
        </div> : <p className="sequence-dialog-help">Los retornos se representan sin texto.</p>}

        {/* 2. Type Selector (Segmented Pills) */}
        <div style={{ marginTop: 10 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--panel-muted-text, #60717f)', marginBottom: 5 }}>
            Tipo
          </span>
          <div className="sequence-msg-type-pills-row">
            {(['synchronous', 'asynchronous', 'return', 'create', 'destroy'] as const).map((t) => {
              const isActive = selectedItem.type === t;
              const label = t === 'synchronous' ? 'Síncrono' : t === 'asynchronous' ? 'Asíncrono' : t === 'return' ? 'Retorno' : t === 'create' ? 'Crear' : 'Destruir';
              return (
                <button
                  key={t}
                  type="button"
                  className={`sequence-msg-type-pill-btn ${isActive ? 'active' : ''}`}
                  onClick={() => updateMessageEditModel(selectedItem.id, { type: t })}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {selectedItem.type === 'create' ? (
            <p className="sequence-inspector-hint" style={{ marginTop: 8 }}>
              Este mensaje crea a su participante con create().
            </p>
          ) : selectedItem.type === 'destroy' ? (
            <p className="sequence-inspector-hint" style={{ marginTop: 8 }}>
              Este mensaje finaliza la línea de vida del destinatario.
            </p>
          ) : null}
        </div>

        {/* 3. Route Section */}
        {/* 3. Route Section */}
        <section className="sequence-inspector-section" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <h4 style={{ margin: 0 }}>Ruta</h4>
            <button
              aria-label="Invertir dirección"
              className="secondary-action-sm"
              type="button"
              title="Invertir dirección (origen ↔ destino)"
              style={{ fontSize: '0.72rem', padding: '2px 8px', gap: 4 }}
              onClick={() => invertMessage(selectedItem.id)}
            >
              <ArrowLeftRight size={12} /> Invertir
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ margin: 0 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--panel-muted-text, #60717f)', fontWeight: 600 }}>Origen</span>
              <select
                className="sequence-inspector-select"
                value={selectedItem.sourceId}
                onChange={(event) => updateMessageEditModel(selectedItem.id, { sourceId: event.target.value })}
              >
                {content.participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {formatSequenceParticipantName(participant)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ margin: 0 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--panel-muted-text, #60717f)', fontWeight: 600 }}>Destino</span>
              {selectedItem.type === 'create' ? (
                <input
                  disabled
                  className="sequence-inspector-select"
                  value={
                    content.participants
                      .filter((participant) => participant.id === selectedItem.targetId)
                      .map(formatSequenceParticipantName)
                      .join('') || 'Participante no disponible'
                  }
                />
              ) : (
                <select
                  className="sequence-inspector-select"
                  value={selectedItem.targetId}
                  onChange={(event) => updateMessageEditModel(selectedItem.id, { targetId: event.target.value })}
                >
                  {content.participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {formatSequenceParticipantName(participant)}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>
          {(selectedItem.type === 'synchronous' || selectedItem.type === 'asynchronous') ? (
            <button
              className="secondary-action"
              type="button"
              style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
              onClick={addReturn}
            >
              + Agregar retorno
            </button>
          ) : null}
        </section>

        {/* 4. Location in flow */}
        <div style={{ marginTop: 10 }}>
          <label>
            <span style={{ fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--panel-muted-text, #60717f)', display: 'block', marginBottom: 4 }}>
              Ubicación en el flujo
            </span>
            <select
              className="sequence-inspector-select"
              value={parentLoc}
              onChange={(event) =>
                commit(
                  keepAnchoredNotesWithTimeline({
                    ...content,
                    items: updateNestedItemLocation(
                      content.items,
                      selectedItem.id,
                      event.target.value,
                    ),
                  }),
                  true,
                )
              }
            >
              <option value="root">Secuencia principal</option>
              {locations.map((loc) => (
                <option key={loc.value} value={loc.value}>
                  {loc.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* 5. Wrap in fragment */}
        <div style={{ marginTop: 10 }}>
          <span style={{ fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--panel-muted-text, #60717f)', display: 'block', marginBottom: 5 }}>
            Envolver en fragmento
          </span>
          <div className="sequence-quick-wrap-pills">
            {(['alt', 'loop', 'opt', 'par', 'critical'] as const).map((op) => (
              <button
                key={op}
                type="button"
                className="sequence-quick-wrap-pill-btn"
                title={`Envolver mensaje en bloque ${op}`}
                onClick={() => handleWrapSelection(op, [selectedItem.id])}
              >
                + {op}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Advanced Options (Collapsible accordion) */}
        <details className="sequence-inspector-section sequence-collapsible-section" style={{ marginTop: 10 }}>
          <summary><h4>Opciones avanzadas</h4></summary>
          {methodOptions.length > 0 || selectedMessageReferenceStatus?.method === 'missing' ? (
            <label style={{ marginTop: 6 }}>
              <span>Método vinculado de clase</span>
              <select
                value={selectedItem.operationMethodId ?? ''}
                onChange={(event) => {
                  const method = methodOptions.find((candidate) => candidate.id === event.target.value);
                  updateMessageEditModel(selectedItem.id, method ? {
                    operationMethodId: method.id,
                    name: method.name,
                    arguments: method.parameters,
                    parameterValues: '',
                    returnType: method.returnType,
                  } : { operationMethodId: undefined });
                }}
              >
                {selectedMessageReferenceStatus?.method === 'missing' ? <option value={selectedItem.operationMethodId}>Método no disponible</option> : null}
                <option value="">Texto libre</option>
                {methodOptions.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {selectedItem.kind === 'message'
            && (selectedItem.type === 'synchronous' || selectedItem.type === 'asynchronous')
            && associatedClassDiagram !== undefined
            && onCreateClassMethod !== undefined ? (
              <button
                className="sequence-sync-class-method-button"
                type="button"
                disabled={selectedItem.name.trim().length === 0}
                onClick={createClassMethodFromSelectedMessage}
              >
                <Link2 aria-hidden="true" size={14} />
                {selectedMessageReferenceStatus?.method === 'missing' ? 'Reparar método en el modelo' : 'Sincronizar operación con clases'}
              </button>
            ) : null}

          <label style={{ marginTop: 6 }}>
            <span>Paso vinculado al flujo</span>
            <input
              list="sequence-message-flow-options-inspector"
              value={selectedItem.flowReference ?? ''}
              onChange={(event) => updateMessageEditModel(selectedItem.id, { flowReference: event.target.value })}
              placeholder="4.2 / CA 1"
            />
            <datalist id="sequence-message-flow-options-inspector">
              <option value="">Sin referencia</option>
              {flowOptions.map((option) => (
                <option key={`${option.flowId}:${option.stepId}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </datalist>
          </label>

          <label style={{ marginTop: 6 }}>
            <span>Valores concretos de prueba</span>
            <input
              value={selectedItem.parameterValues ?? ''}
              onChange={(event) => updateMessageEditModel(selectedItem.id, { parameterValues: event.target.value })}
              placeholder="42, 'activo'"
            />
          </label>
        </details>
      </div>
    );
  })() : null;

  const fragmentInspector = selectedItem?.kind === 'fragment' ? (() => {
    const activeOp = selectedItem.operands.find((op) => op.id === activeOperandId) ?? selectedItem.operands[0];
    const totalMessages = selectedItem.operands.reduce((acc, op) => acc + op.items.length, 0);

    const allMessagesInDiagram: {
      message: SequenceMessage;
      containerLabel: string;
      operandId?: string;
      timelineIndex: number;
    }[] = [];
    let msgCounter = 1;
    const collectMsgs = (itemsList: SequenceTimelineItem[], containerLabel: string, opId?: string) => {
      itemsList.forEach((it) => {
        if (it.kind === 'message') {
          allMessagesInDiagram.push({
            message: it,
            containerLabel,
            operandId: opId,
            timelineIndex: msgCounter++,
          });
        } else {
          it.operands.forEach((op, opIdx) => {
            const opLabel = it.name
              ? `${it.operator.toUpperCase()} "${it.name}" (${opIdx + 1})`
              : `${it.operator.toUpperCase()} (${opIdx + 1})`;
            collectMsgs(op.items, opLabel, op.id);
          });
        }
      });
    };
    collectMsgs(content.items, 'Secuencia principal');

    const activeOpMessages = activeOp ? activeOp.items.filter((it): it is SequenceMessage => it.kind === 'message') : [];
    const availableOutside = activeOp ? allMessagesInDiagram.filter((entry) => entry.operandId !== activeOp.id) : [];
    const filteredAvailable = availableOutside.filter(({ message }) => {
      if (!includeSearchFilter.trim()) return true;
      const term = includeSearchFilter.toLowerCase();
      const src = content.participants.find((p) => p.id === message.sourceId);
      const tgt = content.participants.find((p) => p.id === message.targetId);
      const srcName = src ? formatSequenceParticipantName(src).toLowerCase() : '';
      const tgtName = tgt ? formatSequenceParticipantName(tgt).toLowerCase() : '';
      const msgName = (message.name || messageTypeLabels[message.type]).toLowerCase();
      return msgName.includes(term) || srcName.includes(term) || tgtName.includes(term);
    });

    return (
      <>
        {/* 1. Header with Badge, Title, and 1-Line Action Bar */}
        <div className="sequence-inspector-heading">
          <div>
            <span className="sequence-inspector-badge fragment-badge">FRAGMENTO {selectedItem.operator.toUpperCase()}</span>
            <h3>{fragmentLabels[selectedItem.operator]}</h3>
          </div>
          <button
            aria-label="Eliminar fragmento"
            className="icon-button danger"
            type="button"
            title="Eliminar fragmento"
            onClick={deleteSelection}
          >
            <Trash2 size={16} />
          </button>
        </div>

        <div className="sequence-compact-action-row" style={{ marginTop: 2, marginBottom: 10 }}>
          <button
            className="secondary-action-sm"
            type="button"
            onClick={() => moveSelectedItem(-1)}
            title="Mover fragmento hacia arriba"
          >
            <ArrowUp size={13} /> Subir
          </button>
          <button
            className="secondary-action-sm"
            type="button"
            onClick={() => moveSelectedItem(1)}
            title="Mover fragmento hacia abajo"
          >
            <ArrowDown size={13} /> Bajar
          </button>
          <button
            className="secondary-action-sm"
            type="button"
            onClick={duplicateSelectedItem}
            title="Duplicar fragmento"
          >
            <Copy size={13} /> Duplicar
          </button>
          <button
            className="secondary-action-sm"
            type="button"
            onClick={() => handleUnwrapFragment(selectedItem.id)}
            title="Desempaquetar fragmento (elimina el recuadro y mantiene los mensajes en su posición cronológica)"
          >
            <Ungroup size={13} /> Desemp.
          </button>
        </div>

        {/* 2. Operator Quick Pills + Selector */}
        <div className="sequence-fragment-operator-selector" style={{ marginBottom: 10 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--panel-muted-text, #64748b)', display: 'block', marginBottom: 4 }}>
            Operador
          </label>
          <div className="sequence-fragment-op-pills">
            {(['alt', 'opt', 'loop'] as const).map((op) => (
              <button
                key={op}
                type="button"
                className={`sequence-fragment-op-pill ${selectedItem.operator === op ? 'active' : ''}`}
                onClick={() => {
                  updateItem(selectedItem.id, {
                    operator: op,
                    operands: adjustOperandsForOperator(op, selectedItem.operands),
                  });
                }}
              >
                {op}
              </button>
            ))}
            <div className={`sequence-fragment-op-pill-select-wrap ${!['alt', 'opt', 'loop'].includes(selectedItem.operator) ? 'active' : ''}`}>
              <select
                aria-label="Más operadores"
                className="sequence-fragment-op-select"
                value={['alt', 'opt', 'loop'].includes(selectedItem.operator) ? '' : selectedItem.operator}
                onChange={(e) => {
                  const op = e.target.value as SequenceFragmentOperator;
                  if (!op) return;
                  updateItem(selectedItem.id, {
                    operator: op,
                    operands: adjustOperandsForOperator(op, selectedItem.operands),
                  });
                }}
              >
                <option value="" disabled>
                  {!['alt', 'opt', 'loop'].includes(selectedItem.operator) ? selectedItem.operator : 'Más ▾'}
                </option>
                <option value="par">par · paralela</option>
                <option value="critical">critical · crítica</option>
                <option value="break">break · corte</option>
                <option value="ref">ref · interacción</option>
              </select>
            </div>
          </div>
        </div>

        {/* 3. Scope (Horizontal Participants Span) */}
        <div className="sequence-fragment-span" style={{ marginBottom: 10 }}>
          <label>
            <span>Desde</span>
            <select
              value={selectedItem.startParticipantId ?? ''}
              onChange={(e) => updateItem(selectedItem.id, { startParticipantId: e.target.value || undefined })}
            >
              <option value="">Primero (auto)</option>
              {content.participants.map((p) => (
                <option key={p.id} value={p.id}>{formatSequenceParticipantName(p)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Hasta</span>
            <select
              value={selectedItem.endParticipantId ?? ''}
              onChange={(e) => updateItem(selectedItem.id, { endParticipantId: e.target.value || undefined })}
            >
              <option value="">Último (auto)</option>
              {content.participants.map((p) => (
                <option key={p.id} value={p.id}>{formatSequenceParticipantName(p)}</option>
              ))}
            </select>
          </label>
        </div>

        {selectedItem.operator === 'ref' ? (
          <div className="sequence-ref-inspector-field" style={{ marginBottom: 12 }}>
            <label>
              <span>Diagrama referenciado</span>
              <select
                value={selectedItem.interactionArtifactId ?? ''}
                onChange={(event) => updateItem(selectedItem.id, {
                  interactionArtifactId: event.target.value || undefined,
                })}
              >
                <option value="">Sin interacción vinculada</option>
                {otherSequenceDiagrams.map((diag) => (
                  <option key={diag.id} value={diag.id}>{diag.name}</option>
                ))}
              </select>
            </label>
            {selectedItem.interactionArtifactId && !otherSequenceDiagrams.some((d) => d.id === selectedItem.interactionArtifactId) ? (
              <small className="sequence-reference-warning" style={{ color: '#b91c1c', display: 'block', marginTop: 4 }}>
                La interacción referenciada ya no existe en el proyecto.
              </small>
            ) : null}
            {selectedItem.interactionArtifactId && onNavigateToArtifact ? (
              <button
                type="button"
                className="secondary-action"
                style={{ marginTop: 6, width: '100%', justifyContent: 'center' }}
                onClick={() => onNavigateToArtifact(selectedItem.interactionArtifactId!)}
              >
                <ExternalLink size={14} /> Abrir interacción referenciada
              </button>
            ) : null}
          </div>
        ) : (
          <label style={{ marginBottom: 10 }}>
            <span>Nombre / descripción (opcional)</span>
            <input
              value={selectedItem.name}
              onChange={(event) => updateItem(selectedItem.id, { name: event.target.value })}
              placeholder="Descripción opcional del fragmento"
            />
          </label>
        )}

        {/* 4. Branches & Contained Messages */}
        <section className="sequence-inspector-section sequence-inspector-operands-section" style={{ marginTop: 6 }}>
          <div className="sequence-fragment-branches-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <h4 style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600 }}>Ramas y Mensajes</h4>
              <span className="sequence-counter-badge">{totalMessages} msgs</span>
            </div>
            {(selectedItem.operator === 'alt' || selectedItem.operator === 'par') ? (
              <button
                aria-label="Agregar rama"
                className="secondary-action-sm"
                type="button"
                style={{ fontSize: '0.68rem', padding: '2px 7px' }}
                title={selectedItem.operator === 'alt' ? 'Agregar alternativa (else/condición)' : 'Agregar sección paralela'}
                onClick={() => {
                  const newOp = { id: createId(), guard: '', items: [] };
                  updateItem(selectedItem.id, { operands: [...selectedItem.operands, newOp] });
                  setActiveOperandId(newOp.id);
                }}
              >
                <Plus size={12} /> Rama
              </button>
            ) : null}
          </div>

          {/* Segmented Tab Bar if more than 1 operand */}
          {selectedItem.operands.length > 1 ? (
            <div className="sequence-fragment-tab-bar">
              {selectedItem.operands.map((op, idx) => {
                const isTabActive = op.id === activeOp.id;
                const tabLabel = selectedItem.operator === 'alt'
                  ? (idx === 0 ? 'Rama 1 (si)' : idx === 1 ? 'Rama 2 (else)' : `Rama ${idx + 1}`)
                  : `Sección ${idx + 1}`;
                return (
                  <button
                    key={op.id}
                    type="button"
                    className={`sequence-fragment-tab-btn ${isTabActive ? 'active' : ''}`}
                    onClick={() => setActiveOperandId(op.id)}
                  >
                    <span>{tabLabel}</span>
                    <span className={`sequence-tab-counter ${isTabActive ? 'active' : ''}`}>{op.items.length}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Active Operand Card */}
          {activeOp ? (
            <div className="sequence-active-operand-card">
              <div className="sequence-active-operand-header">
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--panel-text)' }}>
                  {selectedItem.operands.length > 1
                    ? (selectedItem.operator === 'alt'
                        ? (selectedItem.operands.findIndex((o) => o.id === activeOp.id) === 0
                            ? 'Rama 1 (si)'
                            : selectedItem.operands.findIndex((o) => o.id === activeOp.id) === 1
                              ? 'Rama 2 (else)'
                              : `Rama ${selectedItem.operands.findIndex((o) => o.id === activeOp.id) + 1}`)
                        : `Sección ${selectedItem.operands.findIndex((o) => o.id === activeOp.id) + 1}`)
                    : 'Condición / Guarda'}
                </span>
                {selectedItem.operands.length > 1 ? (
                  <button
                    aria-label="Eliminar esta rama"
                    className="icon-button"
                    type="button"
                    title="Eliminar esta rama del fragmento"
                    onClick={() => {
                      void deleteFragmentOperand(selectedItem.id, activeOp.id);
                      const remaining = selectedItem.operands.filter((o) => o.id !== activeOp.id);
                      if (remaining.length > 0) {
                        setActiveOperandId(remaining[0].id);
                      }
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>

              <label style={{ margin: '4px 0 8px' }}>
                <div className="sequence-fragment-guard-wrap">
                  <span className="sequence-fragment-guard-bracket">[</span>
                  <input
                    className="sequence-fragment-guard-input"
                    value={activeOp.guard}
                    onChange={(event) => updateItem(selectedItem.id, {
                      operands: selectedItem.operands.map((c) => (c.id === activeOp.id ? { ...c, guard: event.target.value } : c)),
                    })}
                    placeholder={selectedItem.operands.indexOf(activeOp) === 0 ? 'ej. valido == true' : 'else'}
                  />
                  <span className="sequence-fragment-guard-bracket">]</span>
                </div>
              </label>

              {/* Messages inside active branch */}
              <div className="sequence-operand-messages-section">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--panel-muted-text)' }}>
                    Mensajes en esta rama ({activeOpMessages.length}):
                  </span>
                </div>
                {activeOpMessages.length > 0 ? (
                  <div className="sequence-operand-messages-list">
                    {activeOpMessages.map((msg, msgIdx) => {
                      const src = content.participants.find((p) => p.id === msg.sourceId);
                      const tgt = content.participants.find((p) => p.id === msg.targetId);
                      const srcName = src ? formatSequenceParticipantName(src) : 'Origen';
                      const tgtName = tgt ? formatSequenceParticipantName(tgt) : 'Destino';
                      const typeCode = msg.type === 'synchronous' ? 'sync' : msg.type === 'return' ? 'ret' : msg.type === 'create' ? 'crear' : 'async';
                      return (
                        <div className="sequence-operand-message-row" key={msg.id}>
                          <span className="sequence-msg-row-idx">#{msgIdx + 1}</span>
                          <span className={`sequence-msg-type-pill ${msg.type}`}>
                            {typeCode}
                          </span>
                          <div className="sequence-msg-row-main">
                            <span className="sequence-msg-row-name">
                              {msg.name || messageTypeLabels[msg.type]}
                            </span>
                            <span className="sequence-msg-row-endpoints">
                              {srcName} → {tgtName}
                            </span>
                          </div>
                          <div className="sequence-msg-row-actions">
                            {selectedItem.operands.length > 1 ? (
                              <select
                                aria-label="Mover a otra rama"
                                className="sequence-msg-row-branch-select"
                                value=""
                                title="Mover mensaje a otra rama de este fragmento"
                                onChange={(e) => {
                                  const targetOpId = e.target.value;
                                  if (!targetOpId) return;
                                  commit(keepAnchoredNotesWithTimeline({
                                    ...content,
                                    items: updateNestedItemLocation(content.items, msg.id, `${selectedItem.id}:${targetOpId}`),
                                  }), true);
                                  showFeedback('Mensaje movido a otra rama.');
                                }}
                              >
                                <option value="">Rama...</option>
                                {selectedItem.operands.map((otherOp, otherIdx) => (
                                  otherOp.id === activeOp.id ? null : (
                                    <option key={otherOp.id} value={otherOp.id}>
                                      {selectedItem.operator === 'alt'
                                        ? (otherIdx === 0 ? 'Rama 1 (si)' : otherIdx === 1 ? 'Rama 2 (else)' : `Rama ${otherIdx + 1}`)
                                        : `Sección ${otherIdx + 1}`}
                                    </option>
                                  )
                                ))}
                              </select>
                            ) : null}
                            <button
                              type="button"
                              className="sequence-msg-row-eject"
                              title="Sacar mensaje de este fragmento hacia el flujo principal"
                              onClick={() => {
                                commit(keepAnchoredNotesWithTimeline({
                                  ...content,
                                  items: updateNestedItemLocation(content.items, msg.id, 'root'),
                                }));
                                showFeedback('Mensaje movido a secuencia principal.');
                              }}
                            >
                              <Ungroup size={12} /> Sacar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="sequence-operand-empty-card">
                    <div className="sequence-empty-icon-wrap">
                      <SlidersHorizontal size={13} />
                    </div>
                    <div className="sequence-empty-text-wrap">
                      <strong>Rama sin mensajes</strong>
                      <span>Estirá los bordes en el lienzo o agregá uno abajo.</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="sequence-operand-actions-row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="secondary-action-sm sequence-action-pill"
                  onClick={() => addMessageToOperand(selectedItem.id, activeOp.id)}
                >
                  <Plus size={12} /> Mensaje
                </button>
                <button
                  type="button"
                  className="secondary-action-sm sequence-action-pill"
                  title="Anidar un subfragmento condicional dentro de esta rama"
                  onClick={() => addFragmentToOperand(selectedItem.id, activeOp.id, 'opt')}
                >
                  <Plus size={12} /> Subfragmento opt
                </button>
                <button
                  type="button"
                  className={`secondary-action-sm sequence-action-pill ${includingMessageOperandId === activeOp.id ? 'active' : ''}`}
                  title="Incorporar un mensaje ya existente en el diagrama a esta rama"
                  onClick={() => {
                    setIncludingMessageOperandId(includingMessageOperandId === activeOp.id ? null : activeOp.id);
                    setIncludeSearchFilter('');
                  }}
                >
                  <Plus size={12} /> Existente...
                </button>
              </div>

              {includingMessageOperandId === activeOp.id ? (
                <div className="sequence-operand-picker" style={{ marginTop: 8 }}>
                  <div className="sequence-operand-picker-header">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <SlidersHorizontal size={12} />
                      <strong>Mover mensaje existente a esta rama</strong>
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Cerrar selector"
                      onClick={() => setIncludingMessageOperandId(null)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {availableOutside.length > 3 ? (
                    <div className="sequence-operand-picker-search-wrap">
                      <Search size={12} className="search-icon" />
                      <input
                        autoFocus
                        className="sequence-operand-picker-search"
                        placeholder="Buscar por nombre o participante..."
                        value={includeSearchFilter}
                        onChange={(e) => setIncludeSearchFilter(e.target.value)}
                      />
                    </div>
                  ) : null}
                  <div className="sequence-operand-picker-list">
                    {availableOutside.length === 0 ? (
                      <div className="sequence-operand-picker-empty">
                        Todos los mensajes del diagrama ya se encuentran en esta rama.
                      </div>
                    ) : filteredAvailable.length === 0 ? (
                      <div className="sequence-operand-picker-empty">
                        No se encontraron mensajes que coincidan con &quot;{includeSearchFilter}&quot;.
                      </div>
                    ) : (
                      filteredAvailable.map((entry) => {
                        const src = content.participants.find((p) => p.id === entry.message.sourceId);
                        const tgt = content.participants.find((p) => p.id === entry.message.targetId);
                        const srcName = src ? formatSequenceParticipantName(src) : 'Origen';
                        const tgtName = tgt ? formatSequenceParticipantName(tgt) : 'Destino';
                        const typeCode = entry.message.type === 'synchronous' ? 'sync' : entry.message.type === 'return' ? 'ret' : entry.message.type === 'create' ? 'crear' : 'async';
                        return (
                          <button
                            type="button"
                            key={entry.message.id}
                            className="sequence-operand-picker-item"
                            title={`Mover "${entry.message.name || entry.message.type}" a esta rama`}
                            onClick={() => {
                              commit(keepAnchoredNotesWithTimeline({
                                ...content,
                                items: updateNestedItemLocation(content.items, entry.message.id, `${selectedItem.id}:${activeOp.id}`),
                              }), true);
                              showFeedback(`Mensaje "${entry.message.name || messageTypeLabels[entry.message.type]}" movido a esta rama.`);
                              setIncludingMessageOperandId(null);
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <span className="sequence-msg-row-idx">#{entry.timelineIndex}</span>
                              <span className={`sequence-msg-type-pill ${entry.message.type}`}>{typeCode}</span>
                              <span className="sequence-picker-item-name">{entry.message.name || messageTypeLabels[entry.message.type]}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <span className="sequence-picker-item-endpoints">{srcName} → {tgtName}</span>
                              <span className="sequence-picker-item-loc">[{entry.containerLabel}]</span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* 5. Collapsed by default: Geometry */}
        <details className="sequence-inspector-section sequence-collapsible-section" style={{ marginTop: 10 }}>
          <summary><h4>Avanzado: Posición y tamaño en lienzo</h4></summary>
          <p className="sequence-inspector-hint">
            El fragmento adapta su posición y tamaño automáticamente al contenido. También podés arrastrarlo o estirar sus bordes directamente en el lienzo.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px', marginTop: 6 }}>
            <label>
              <span>Posición X</span>
              <input
                type="number"
                value={selectedItem.x ?? Math.round(layout.fragmentLayouts.get(selectedItem.id)?.x ?? 0)}
                onChange={(event) => {
                  const val = parseFloat(event.target.value);
                  if (Number.isFinite(val)) updateItem(selectedItem.id, { x: Math.max(20, Math.round(val)) });
                }}
              />
            </label>
            <label>
              <span>Posición Y</span>
              <input
                type="number"
                value={selectedItem.y ?? Math.round(layout.fragmentLayouts.get(selectedItem.id)?.y ?? 0)}
                onChange={(event) => {
                  const val = parseFloat(event.target.value);
                  if (Number.isFinite(val)) updateItem(selectedItem.id, { y: Math.max(80, Math.round(val)) });
                }}
              />
            </label>
            <label>
              <span>Ancho</span>
              <input
                type="number"
                value={selectedItem.width ?? Math.round(layout.fragmentLayouts.get(selectedItem.id)?.width ?? 300)}
                onChange={(event) => {
                  const val = parseFloat(event.target.value);
                  const minimumWidth = layout.fragmentLayouts.get(selectedItem.id)?.minWidth ?? 140;
                  if (Number.isFinite(val)) updateItem(selectedItem.id, { width: Math.max(minimumWidth, Math.round(val)) });
                }}
              />
            </label>
            <label>
              <span>Alto</span>
              <input
                type="number"
                value={selectedItem.height ?? Math.round(layout.fragmentLayouts.get(selectedItem.id)?.height ?? 140)}
                onChange={(event) => {
                  const val = parseFloat(event.target.value);
                  const minimumHeight = layout.fragmentLayouts.get(selectedItem.id)?.minHeight ?? 60;
                  if (Number.isFinite(val)) updateItem(selectedItem.id, { height: Math.max(minimumHeight, Math.round(val)) });
                }}
              />
            </label>
          </div>
          {(selectedItem.x !== undefined || selectedItem.y !== undefined || selectedItem.width !== undefined || selectedItem.height !== undefined) ? (
            <button
              className="secondary-action"
              type="button"
              style={{ marginTop: '8px', width: '100%' }}
              onClick={() => updateItem(selectedItem.id, { x: undefined, y: undefined, width: undefined, height: undefined })}
            >
              Restablecer tamaño automático
            </button>
          ) : null}
        </details>
      </>
    );
  })() : null;

  const noteInspector = selectedNote ? (
    <>
      <div className="sequence-inspector-heading">
        <div>
          <span className="sequence-inspector-badge note-badge">NOTA</span>
          <h3>{selectedNote.text.trim().split('\n')[0].slice(0, 24) || 'Nota sin texto'}</h3>
        </div>
        <button
          aria-label="Eliminar nota"
          className="icon-button danger"
          type="button"
          title="Eliminar nota"
          onClick={deleteSelection}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <label style={{ marginBottom: 10 }}>
        <span>Texto de la nota</span>
        <textarea
          className="sequence-compact-textarea"
          rows={5}
          value={selectedNote.text}
          onChange={(event) => {
            const nextText = event.target.value;
            const minHeight = getSequenceNoteMinimumHeight({ text: nextText, width: selectedNote.width });
            updateNote(selectedNote.id, {
              text: nextText,
              height: Math.max(selectedNote.height, minHeight),
            });
          }}
          placeholder="Escribí aquí una nota de apoyo o aclaración..."
        />
        <small className="sequence-inspector-hint" style={{ marginTop: 4, display: 'block' }}>
          Doble clic en el lienzo para editar · Tiradores para redimensionar en ancho y alto.
        </small>
      </label>

      <details className="sequence-inspector-section sequence-collapsible-section sequence-note-options" style={{ marginTop: 8 }}>
        <summary><h4>Apariencia y vínculo</h4></summary>
        <div style={{ marginBottom: 12, marginTop: 6 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--panel-muted-text)', display: 'block', marginBottom: 4 }}>
            Color
          </label>
          <div className="sequence-note-color-grid">
            {([
              { id: 'yellow', label: 'Amarillo', desc: 'General / Nota estándar', dot: '#F59F00', bg: '#FFF9DB', border: '#F08C00' },
              { id: 'red', label: 'Rojo', desc: 'Alerta / Condición SINO', dot: '#E03131', bg: '#FFE3E3', border: '#FA5252' },
              { id: 'green', label: 'Verde', desc: 'Precondición / Éxito', dot: '#2F9E44', bg: '#EBFBEE', border: '#40C057' },
              { id: 'blue', label: 'Azul', desc: 'Técnico / Requisito', dot: '#1971C2', bg: '#E7F5FF', border: '#339AF0' },
            ] as const).map((colorOpt) => {
              const isSelected = (selectedNote.color ?? 'yellow') === colorOpt.id;
              return (
                <button
                  key={colorOpt.id}
                  type="button"
                  title={colorOpt.desc}
                  className={`sequence-note-color-pill ${isSelected ? 'active' : ''}`}
                  style={{
                    '--note-pill-bg': colorOpt.bg,
                    '--note-pill-dot': colorOpt.dot,
                    '--note-pill-border': colorOpt.border,
                  } as CSSProperties}
                  onClick={() => updateNote(selectedNote.id, { color: colorOpt.id })}
                >
                  <span className="sequence-note-color-dot" />
                  <span>{colorOpt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tipo de anclaje (Pills) */}
        <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--panel-muted-text)', display: 'block', marginBottom: 2 }}>
          Tipo de anclaje
        </label>
        <div className="sequence-note-anchor-grid">
          {(['free', 'message', 'participant', 'fragment'] as const).map((kind) => {
            const labels = {
              free: 'Libre',
              message: 'Mensaje',
              participant: 'Partic.',
              fragment: 'Fragm.',
            };
            const isActive = selectedNote.anchorKind === kind;
            return (
              <button
                key={kind}
                type="button"
                className={`sequence-note-anchor-pill ${isActive ? 'active' : ''}`}
                onClick={() => {
                  if (kind === 'free') {
                    updateNote(selectedNote.id, { anchorKind: 'free', anchorId: undefined });
                  } else if (kind === 'message') {
                    const defaultMsgId = layout.orderedMessages[0]?.id;
                    updateNote(selectedNote.id, { anchorKind: 'message', anchorId: selectedNote.anchorKind === 'message' && selectedNote.anchorId ? selectedNote.anchorId : defaultMsgId });
                  } else if (kind === 'participant') {
                    const defaultPartId = content.participants[0]?.id;
                    updateNote(selectedNote.id, { anchorKind: 'participant', anchorId: selectedNote.anchorKind === 'participant' && selectedNote.anchorId ? selectedNote.anchorId : defaultPartId });
                  } else if (kind === 'fragment') {
                    const firstFrag = flatEntries.find((e) => e.item.kind === 'fragment')?.item;
                    updateNote(selectedNote.id, { anchorKind: 'fragment', anchorId: selectedNote.anchorKind === 'fragment' && selectedNote.anchorId ? selectedNote.anchorId : firstFrag?.id });
                  }
                }}
              >
                {labels[kind]}
              </button>
            );
          })}
        </div>
        </div>

        {/* Target Element Selector (when not 'free') */}
        {selectedNote.anchorKind === 'message' ? (
        <label style={{ marginBottom: 10 }}>
          <span>Mensaje vinculado</span>
          <select
            value={selectedNote.anchorId ?? ''}
            onChange={(event) => updateNote(selectedNote.id, { anchorId: event.target.value })}
          >
            {layout.orderedMessages.map((message, index) => (
              <option key={message.id} value={message.id}>
                #{index + 1} · {message.type === 'return' ? 'Retorno' : (message.name || messageTypeLabels[message.type])}
              </option>
            ))}
          </select>
        </label>
      ) : selectedNote.anchorKind === 'participant' ? (
        <label style={{ marginBottom: 10 }}>
          <span>Participante vinculado</span>
          <select
            value={selectedNote.anchorId ?? ''}
            onChange={(event) => updateNote(selectedNote.id, { anchorId: event.target.value })}
          >
            {content.participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {formatSequenceParticipantName(participant)}
              </option>
            ))}
          </select>
        </label>
      ) : selectedNote.anchorKind === 'fragment' ? (
        <label style={{ marginBottom: 10 }}>
          <span>Fragmento vinculado</span>
          <select
            value={selectedNote.anchorId ?? ''}
            onChange={(event) => updateNote(selectedNote.id, { anchorId: event.target.value })}
          >
            {flatEntries
              .filter((entry) => entry.item.kind === 'fragment')
              .map((entry) => {
                const frag = entry.item as SequenceFragment;
                return (
                  <option key={frag.id} value={frag.id}>
                    {frag.operator.toUpperCase()} {frag.name ? `· "${frag.name}"` : ''}
                  </option>
                );
              })}
          </select>
        </label>
        ) : null}
      </details>

      {/* Geometría plegable */}
      <details className="sequence-inspector-section sequence-collapsible-section" style={{ marginTop: 8 }}>
        <summary><h4>Avanzado: Posición y tamaño</h4></summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px', marginTop: 6 }}>
          <label>
            <span>Posición X</span>
            <input
              type="number"
              value={selectedNote.x}
              onChange={(event) => {
                const val = parseFloat(event.target.value);
                if (Number.isFinite(val)) updateNote(selectedNote.id, { x: Math.round(val) });
              }}
            />
          </label>
          <label>
            <span>Posición Y</span>
            <input
              type="number"
              value={selectedNote.y}
              onChange={(event) => {
                const val = parseFloat(event.target.value);
                if (Number.isFinite(val)) updateNote(selectedNote.id, { y: Math.round(val) });
              }}
            />
          </label>
          <label>
            <span>Ancho</span>
            <input
              type="number"
              value={selectedNote.width}
              onChange={(event) => {
                const val = parseFloat(event.target.value);
                if (Number.isFinite(val)) updateNote(selectedNote.id, { width: Math.max(80, Math.round(val)) });
              }}
            />
          </label>
          <label>
            <span>Alto</span>
            <input
              type="number"
              value={selectedNote.height}
              onChange={(event) => {
                const val = parseFloat(event.target.value);
                if (Number.isFinite(val)) updateNote(selectedNote.id, { height: Math.max(50, Math.round(val)) });
              }}
            />
          </label>
        </div>
      </details>
    </>
  ) : null;

  // Like the class editor, the inspector exists only while something is
  // selected: an empty "Seleccioná un elemento" column cost the diagram ~300px.
  const selectedInspector = participantInspector ?? messageInspector ?? fragmentInspector ?? noteInspector;
  const inspectorIdle = selectedInspector === null || selectedInspector === undefined;

  return (
    <main className="editor-shell sequence-editor-shell" ref={editorRootRef}>
      <header className="editor-toolbar" ref={toolbarRef}>
        <EditorIdentity artifactKind="Diagrama de secuencia" artifactType={'sequence-diagram'} artifactName={artifact.name} projectName={project.name} />
        <div className="editor-toolbar-actions sequence-toolbar-actions-refined">
          <ToolbarHistory canRedo={canRedo} canUndo={canUndo} saveStatus={saveStatus} onRedo={onRedo} onUndo={onUndo} />

          {/* Create: the only group that differs between editors. */}
          <div className="toolbar-group sequence-toolbar-group sequence-toolbar-create-group">
            <button
              aria-label="Insertar mensaje"
              className="toolbar-primary-action"
              type="button"
              title="Insertar mensaje (o doble clic en el lienzo)"
              onClick={() => beginMessage()}
            >
              <MessageSquarePlus size={15} /> <span className="toolbar-label">Mensaje</span>
            </button>
            <button
              aria-label="Agregar participante"
              className="secondary-action sequence-toolbar-btn sequence-toolbar-participant-btn"
              type="button"
              title="Agregar participante con la notación instancia:Clase"
              onClick={beginParticipantCreation}
            >
              <UserRoundPlus size={15} /> <span className="toolbar-label">Participante</span>
            </button>
            <details className="toolbar-menu sequence-toolbar-fragment-menu" onToggle={handleToolbarMenuToggle}>
              <summary aria-label="Agregar fragmento combinado" title="Agregar fragmento combinado (alt, loop, opt...)"><BoxSelect size={15} /> <span className="toolbar-label">Fragmento</span></summary>
              <div className="toolbar-menu-content sequence-fragment-menu">
                {Object.entries(fragmentLabels).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={(event) => {
                      addFragment(value as SequenceFragmentOperator);
                      event.currentTarget.closest('details')?.removeAttribute('open');
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </details>
            <button
              aria-label="Agregar nota"
              className="toolbar-icon-action"
              type="button"
              title="Agregar nota"
              onClick={addNote}
            >
              <StickyNote size={15} />
            </button>
          </div>

          <div className="toolbar-group sequence-toolbar-group sequence-toolbar-keyboard-group">
            <button
              aria-label="Modo ágil por teclado"
              aria-pressed={keyboardMode.stage !== 'off'}
              className={`secondary-action sequence-keyboard-toggle ${keyboardMode.stage !== 'off' ? 'active' : ''}`}
              type="button"
              title="Modo ágil por teclado (presioná M)"
              onClick={() => keyboardMode.stage === 'off' ? activateKeyboardMode() : dispatchKeyboardMode({ type: 'deactivate' })}
            >
              <Keyboard size={15} /> <span className="toolbar-label">Teclado</span> <kbd>M</kbd>
            </button>
          </div>

          {/* View */}
          <div className="toolbar-group sequence-toolbar-group sequence-toolbar-view-group">
            <button
              aria-label={outlineVisible ? 'Ocultar panel de estructura' : 'Mostrar panel de estructura'}
              aria-pressed={outlineVisible}
              className={`toolbar-icon-action ${outlineVisible ? 'active' : ''}`}
              type="button"
              title={outlineVisible ? 'Ocultar panel de estructura' : 'Mostrar panel de estructura'}
              onClick={() => updateOutlineVisibility(!outlineVisible)}
            >
              {outlineVisible ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
            <details className="toolbar-menu" onToggle={handleToolbarMenuToggle}>
              <summary aria-label="Opciones de vista y referencias" title="Opciones de vista y referencias">
                <span className="toolbar-label-static">Vista</span>
              </summary>
              <div className="toolbar-menu-content sequence-settings-menu">
                <div className="sequence-settings-section">
                  <span className="sequence-settings-title">Visualización</span>
                  <label className="sequence-menu-check">
                    <input type="checkbox" checked={content.showActivations} onChange={(event) => commit({ ...content, showActivations: event.target.checked })} /> Activaciones
                  </label>
                  <label>
                    <span>Numeración</span>
                    <select value={content.numbering} onChange={(event) => commit({ ...content, numbering: event.target.value as SequenceDiagramContent['numbering'] })}>
                      <option value="sequential">Correlativa</option>
                      <option value="hierarchical">Jerárquica</option>
                      <option value="none">Sin números</option>
                    </select>
                  </label>
                  <label>
                    <span>Colores de participantes</span>
                    <select value={content.participantColors ?? 'automatic'} onChange={(event) => commit({ ...content, participantColors: event.target.value as SequenceParticipantColorMode })}>
                      <option value="automatic">Automáticos</option>
                      <option value="disabled">Desactivados</option>
                    </select>
                  </label>
                </div>
                <div className="sequence-settings-section">
                  <span className="sequence-settings-title">Referencias</span>
                  <label>
                    <span>Diagrama de clases</span>
                    <select value={content.classDiagramArtifactId ?? ''} onChange={(event) => commit({ ...content, classDiagramArtifactId: event.target.value || undefined })}>
                      {content.classDiagramArtifactId && !associatedClassDiagram ? <option value={content.classDiagramArtifactId}>Referencia no disponible</option> : null}
                      <option value="">{defaultClassDiagram ? `Automático: ${defaultClassDiagram.name}` : 'Sin referencia'}</option>
                      {classDiagrams.map((diagram) => <option key={diagram.id} value={diagram.id}>{diagram.name}</option>)}
                    </select>
                    {content.classDiagramArtifactId && !associatedClassDiagram ? <small>El diagrama asociado ya no existe.</small> : null}
                  </label>
                  <label>
                    <span>Flujo de sucesos</span>
                    <select value={content.flowArtifactId ?? ''} onChange={(event) => commit({ ...content, flowArtifactId: event.target.value || undefined })}>
                      {content.flowArtifactId && !flows.some((flow) => flow.id === content.flowArtifactId) ? <option value={content.flowArtifactId}>Referencia no disponible</option> : null}
                      <option value="">Sin referencia</option>
                      {flows.map((flow) => <option key={flow.id} value={flow.id}>{flow.name}</option>)}
                    </select>
                    {content.flowArtifactId && !flows.some((flow) => flow.id === content.flowArtifactId) ? <small>El flujo asociado ya no existe.</small> : null}
                  </label>
                </div>
              </div>
            </details>
          </div>

          {/* Review */}
          <div className="toolbar-group sequence-toolbar-group sequence-toolbar-quality-group">
            <button
              aria-label={`Revisión semántica del diagrama${semantics.problems.length > 0 ? `: ${semantics.problems.length} observaciones` : ''}`}
              aria-pressed={isReviewPanelOpen}
              className={`toolbar-review-action ${semantics.problems.some((p) => p.severity === 'error') ? 'has-errors' : semantics.problems.length > 0 ? 'has-warnings' : ''}`}
              type="button"
              title="Revisión semántica del diagrama"
              onClick={() => setIsReviewPanelOpen(!isReviewPanelOpen)}
            >
              <ListChecks size={15} /> <span className="toolbar-label-static">Revisar</span>
              {semantics.problems.length > 0 ? <span className="toolbar-count">{semantics.problems.length}</span> : null}
            </button>
          </div>

          {/* File */}
          <div className="toolbar-group sequence-toolbar-group sequence-toolbar-settings-group">
            <details className="toolbar-menu" onToggle={handleToolbarMenuToggle}>
              <summary aria-label="Archivo: plantillas, exportar e importar" title="Plantillas, exportar e importar">
                <span className="toolbar-label-static">Archivo</span>
              </summary>
              <div className="toolbar-menu-content file-menu">
                <button type="button" onClick={(event) => { setIsTemplatesOpen(true); event.currentTarget.closest('details')?.removeAttribute('open'); }}>
                  <LayoutTemplate size={16} /> Plantillas educativas…
                </button>
                <hr />
                <button type="button" onClick={(event) => { setExportDialogOpen(true); event.currentTarget.closest('details')?.removeAttribute('open'); }}>
                  <ImageDown size={16} /> Exportar PNG o PDF…
                </button>
                <button type="button" onClick={(event) => { downloadProjectJson(project); event.currentTarget.closest('details')?.removeAttribute('open'); }}>
                  <FileDown size={16} /> Exportar JSON
                </button>
                <button type="button" onClick={(event) => { fileInputRef.current?.click(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>
                  <FileUp size={16} /> Importar JSON
                </button>
              </div>
            </details>
          </div>
          {selectedTimelineIds.length > 0 ? (
            <div className="sequence-multi-selection-bar" data-testid="sequence-multi-selection-bar">
              <span><strong>{selectedTimelineIds.length}</strong> {selectedTimelineIds.length === 1 ? 'seleccionado' : 'seleccionados'}</span>
              <details className="toolbar-menu" onToggle={handleToolbarMenuToggle}>
                <summary style={{ cursor: canWrapSelection ? 'pointer' : 'not-allowed', opacity: canWrapSelection ? 1 : 0.6 }}>
                  <BoxSelect size={14} /> Envolver en...
                </summary>
                {canWrapSelection ? (
                  <div className="toolbar-menu-content">
                    <button type="button" onClick={() => handleWrapSelection('alt')}>alt (Alternativa)</button>
                    <button type="button" onClick={() => handleWrapSelection('loop')}>loop (Bucle)</button>
                    <button type="button" onClick={() => handleWrapSelection('opt')}>opt (Opcional)</button>
                    <button type="button" onClick={() => handleWrapSelection('par')}>par (Paralelo)</button>
                    <button type="button" onClick={() => handleWrapSelection('critical')}>critical (Región crítica)</button>
                  </div>
                ) : null}
              </details>
              {locations.length > 0 && selectedTimelineIds.every((id) => flatEntries.some((e) => e.item.id === id && e.item.kind === 'message')) ? (
                <select
                  className="sequence-operand-add-select"
                  style={{ maxWidth: 190, fontSize: '0.78rem' }}
                  value=""
                  onChange={(event) => {
                    const loc = event.target.value;
                    if (!loc) return;
                    let newItems = content.items;
                    for (const id of selectedTimelineIds) {
                      newItems = updateNestedItemLocation(newItems, id, loc);
                    }
                    commit(keepAnchoredNotesWithTimeline({ ...content, items: newItems }));
                    showFeedback(`${selectedTimelineIds.length} mensaje${selectedTimelineIds.length > 1 ? 's' : ''} movido${selectedTimelineIds.length > 1 ? 's' : ''}.`);
                    setSelectedTimelineIds([]);
                  }}
                >
                  <option value="">Mover selección a...</option>
                  <option value="root">Secuencia principal</option>
                  {locations.map((loc) => (
                    <option key={loc.value} value={loc.value}>
                      {loc.label}
                    </option>
                  ))}
                </select>
              ) : null}
              <button type="button" className="secondary-action" onClick={() => setSelectedTimelineIds([])}>
                Deseleccionar
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <input ref={fileInputRef} className="hidden-file-input" type="file" accept="application/json" onChange={importJson} />
      {feedback ? <div className="editor-feedback">{feedback}</div> : null}
      {participantDraft ? (
        <form
          aria-describedby="sequence-participant-composer-help"
          aria-labelledby="sequence-participant-composer-title"
          className="sequence-participant-composer"
          onSubmit={submitParticipantDraft}
        >
          <div>
            <h2 id="sequence-participant-composer-title">{participantDraft.editId ? 'Editar participante' : 'Nuevo participante'}</h2>
            <span id="sequence-participant-composer-help">Usá la notación instancia:Clase o :Clase.</span>
          </div>
          <input
            autoFocus
            aria-label="Identificación del participante"
            value={participantDraft.text}
            placeholder="TramiteActual:Tramite"
            onChange={(event) => setParticipantDraft((current) => current ? { ...current, text: event.target.value } : current)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setParticipantDraft(null);
              }
            }}
          />
          <button className="primary-action" type="submit"><Plus size={15} /> {participantDraft.editId ? 'Guardar' : 'Crear'}</button>
          <button aria-label="Cancelar participante" className="icon-button" type="button" title="Cancelar" onClick={() => setParticipantDraft(null)}><X size={16} /></button>
        </form>
      ) : null}
      {messageDraft ? (
        <form
          aria-describedby="sequence-message-composer-help"
          aria-labelledby="sequence-message-composer-title"
          className="sequence-message-composer"
          onSubmit={submitMessage}
        >
          <div>
            <h2 id="sequence-message-composer-title">Nuevo mensaje</h2>
            <span id="sequence-message-composer-help">Se insertará después del elemento seleccionado.</span>
          </div>
          <label><span>Tipo</span><select value={messageDraft.type} onChange={(event) => setMessageDraft(updateSequenceMessageEditModel(messageDraft, { type: event.target.value as SequenceMessageType }))}>{Object.entries(messageTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Origen</span><select value={messageDraft.sourceId} onChange={(event) => setMessageDraft(updateSequenceMessageEditModel(messageDraft, { sourceId: event.target.value }))}>{content.participants.map((participant) => <option key={participant.id} value={participant.id}>{formatSequenceParticipantName(participant)}</option>)}</select></label>
          <button aria-label="Invertir dirección" className="icon-button sequence-route-swap" type="button" title="Invertir dirección" onClick={swapMessageDraft}><ArrowLeftRight size={14} /></button>
          {messageDraft.type === 'create' ? <label><span>Participante creado</span><input autoFocus value={messageDraft.newParticipantName ?? ''} onChange={(event) => setMessageDraft(updateSequenceMessageEditModel(messageDraft, { newParticipantName: event.target.value }))} placeholder="TramiteActual:Tramite" /></label> : <label><span>Destino</span><select value={messageDraft.targetId} onChange={(event) => setMessageDraft(updateSequenceMessageEditModel(messageDraft, { targetId: event.target.value }))}>{content.participants.map((participant) => <option key={participant.id} value={participant.id}>{formatSequenceParticipantName(participant)}</option>)}</select></label>}
          {messageDraft.type !== 'return' ? <><label><span>Método vinculado</span><select value={messageDraft.operationMethodId ?? ''} onChange={(event) => { const method = messageDraftMethodOptions.find((candidate) => candidate.id === event.target.value); setMessageDraft(method ? updateSequenceMessageEditModel(messageDraft, { operationMethodId: method.id, name: method.name, arguments: method.parameters, parameterValues: '', returnType: method.returnType }) : updateSequenceMessageEditModel(messageDraft, { operationMethodId: undefined })); }}>{messageDraftReferenceStatus?.method === 'missing' ? <option value={messageDraft.operationMethodId}>Método no disponible</option> : null}<option value="">Texto libre</option>{messageDraftMethodOptions.map((method) => <option key={method.id} value={method.id}>{method.label}</option>)}</select></label><label><span>Operación</span><input autoFocus={messageDraft.type !== 'create'} list="sequence-message-method-options-composer" value={messageDraft.name} onChange={(event) => { const name = event.target.value; const method = messageDraftMethodOptions.find((candidate) => candidate.name === name.trim()); setMessageDraft(updateSequenceMessageEditModel(messageDraft, method ? { name, operationMethodId: method.id, returnType: messageDraft.returnType || method.returnType } : { name })); }} placeholder={messageDraft.type === 'create' ? 'create' : 'operación'} /><datalist id="sequence-message-method-options-composer">{messageDraftMethodOptions.map((method) => <option key={method.id} value={method.name}>{method.label}</option>)}</datalist></label><label><span>Parámetros</span><input value={messageDraft.arguments} onChange={(event) => setMessageDraft(updateSequenceMessageEditModel(messageDraft, { arguments: event.target.value }))} placeholder="idCaso" /></label><label><span>Valores concretos</span><input value={messageDraft.parameterValues} onChange={(event) => setMessageDraft(updateSequenceMessageEditModel(messageDraft, { parameterValues: event.target.value }))} placeholder="42, estado" /></label><label><span>Resultado</span><input value={messageDraft.returnType} onChange={(event) => setMessageDraft(updateSequenceMessageEditModel(messageDraft, { returnType: event.target.value }))} placeholder="Caso" /></label></> : null}
          <label><span>Referencia al flujo</span><input list="sequence-message-flow-options-composer" value={messageDraft.flowReference ?? ''} onChange={(event) => setMessageDraft(updateSequenceMessageEditModel(messageDraft, { flowReference: event.target.value }))} placeholder="4.2 / CA 1" /><datalist id="sequence-message-flow-options-composer"><option value="">Sin referencia</option>{flowOptions.map((option) => <option key={`${option.flowId}:${option.stepId}`} value={option.value}>{option.label}</option>)}</datalist>{messageDraftReferenceStatus?.flow === 'missing' || messageDraftReferenceStatus?.flow === 'unavailable' ? <small className="sequence-reference-warning">El paso ya no está disponible; se conserva su referencia.</small> : null}</label>
          <label><span>Insertar</span><select value={messageDraft.placement ?? 'end'} onChange={(event) => setMessageDraft(updateSequenceMessageEditModel(messageDraft, { placement: event.target.value as MessageDraft['placement'] }))} disabled={!selectedItem}><option value="after">Después</option><option value="before">Antes</option><option value="end">Al final</option></select></label>
          <button className="primary-action" type="submit" disabled={content.participants.length === 0}><Plus size={15} /> Insertar</button><button aria-label="Cancelar" className="icon-button" type="button" title="Cancelar" onClick={() => setMessageDraft(null)}><X size={16} /></button>
        </form>
      ) : null}
      <section
        className={`sequence-workspace ${outlineVisible ? '' : 'sequence-workspace-focused'} ${inspectorIdle ? 'sequence-inspector-idle' : inspectorCollapsed ? 'sequence-inspector-collapsed' : ''}`}
        style={{ '--sequence-inspector-width': `${inspectorIdle ? 0 : inspectorCollapsed ? 44 : inspectorWidth}px` } as CSSProperties}
      >
        <aside className="sequence-outline-panel" hidden={!outlineVisible}>
          <div className="sequence-panel-title">
            <div><h2>Estructura</h2><strong>{flatEntries.filter((entry) => entry.item.kind === 'message').length} mensajes</strong></div>
            <div className="sequence-panel-title-actions">
              <button aria-label="Ocultar estructura" className="icon-button" type="button" title="Ocultar estructura" onClick={() => updateOutlineVisibility(false)}><PanelLeftClose size={15} /></button>
              <button aria-label="Agregar mensaje" className="icon-button" type="button" title="Agregar mensaje" onClick={() => beginMessage()}><Plus size={15} /></button>
            </div>
          </div>
          <label className="sequence-search"><Search aria-hidden="true" size={14} /><input aria-label="Buscar mensaje o bloque" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar mensaje o bloque" /></label>
          <div className="sequence-outline-list">
            {content.items.length === 0 ? (
              <div className="sequence-empty-state"><p>Agregá participantes y luego el primer mensaje.</p></div>
            ) : !hasOutlineMatches ? (
              <div className="sequence-empty-state"><p>No se encontraron resultados para &ldquo;{searchQuery}&rdquo;</p></div>
            ) : (
              renderOutline(content.items)
            )}
          </div>
          <div className="sequence-outline-actions">
            <button aria-label="Subir elemento" className="icon-button" type="button" title="Subir" disabled={!(selection?.kind === 'message' || selection?.kind === 'fragment') && selectedTimelineIds.length === 0} onClick={() => moveSelectedItem(-1)}><ArrowUp size={14} /></button>
            <button aria-label="Bajar elemento" className="icon-button" type="button" title="Bajar" disabled={!(selection?.kind === 'message' || selection?.kind === 'fragment') && selectedTimelineIds.length === 0} onClick={() => moveSelectedItem(1)}><ArrowDown size={14} /></button>
            <button aria-label="Duplicar elemento" className="icon-button" type="button" title="Duplicar" disabled={!(selection?.kind === 'message' || selection?.kind === 'fragment')} onClick={duplicateSelectedItem}><Copy size={14} /></button>
            <button aria-label="Eliminar elemento seleccionado" className="icon-button danger" type="button" title="Eliminar" disabled={!selection && selectedTimelineIds.length === 0} onClick={deleteSelection}><Trash2 size={14} /></button>
          </div>
        </aside>
        <section className={`sequence-canvas-panel ${isKeyboardActive ? 'keyboard-mode-active' : ''}`}>
          {isKeyboardActive ? (
            <div className="sequence-canvas-guide is-keyboard-active" data-export-control="true">
              <div className="sequence-keyboard-guide-body">
                <span className="sequence-keyboard-status-badge">MODO MENSAJES</span>
                {keyboardContext ? (
                  <strong className="sequence-keyboard-guide-context" title={keyboardContext}>
                    {keyboardContext}
                  </strong>
                ) : null}
                <span className="sequence-keyboard-guide-instruction">{keyboardInstruction}</span>
              </div>
              <button
                type="button"
                className="sequence-keyboard-exit-pill"
                title="Salir del modo teclado (Esc)"
                onClick={() => dispatchKeyboardMode({ type: 'deactivate' })}
              >
                Salir <kbd>Esc</kbd>
              </button>
            </div>
          ) : null}
          {keyboardMode.stage !== 'off' && keyboardSlot && (keyboardSourceParticipant || keyboardMode.stage === 'navigate' || keyboardMode.stage === 'participant') ? (
            <SequenceKeyboardComposer
              state={keyboardMode}
              context={keyboardContext}
              sourceName={keyboardSourceParticipant ? formatSequenceParticipantName(keyboardSourceParticipant) : 'Sin participantes'}
              targetName={keyboardTargetName}
              position={keyboardPopoverPosition}
              placement={keyboardPopoverPlacement}
              methodOptions={keyboardMethodOptions}
              selectedCount={selectedTimelineIds.length}
              onTextChange={(text) => dispatchKeyboardMode({ type: 'set-text', text })}
              onGuardChange={(text) => dispatchKeyboardMode({ type: 'set-guard', text })}
              onSubmit={(addAutomaticReturn) => {
                if (keyboardMode.stage === 'participant') commitKeyboardParticipant();
                else if (keyboardMode.stage === 'guard') commitKeyboardGuard();
                else if (keyboardMode.stage === 'fragment') commitKeyboardFragment();
                else commitKeyboardMessage(addAutomaticReturn);
              }}
              onBack={() => dispatchKeyboardMode({ type: 'back' })}
              onMethodSelect={(method) => dispatchKeyboardMode({
                type: 'set-method',
                operationMethodId: method.id,
                text: `${method.name}(${method.parameters})${method.returnType ? `: ${method.returnType}` : ''}`,
              })}
              onAddParticipant={() => dispatchKeyboardMode({ type: 'begin-participant' })}
            />
          ) : null}
          {content.participants.length === 0 ? (
            <CanvasStartCard
              title="Empezá por los participantes"
              action={(
                <button className="secondary-action" type="button" onClick={beginParticipantCreation}>
                  <Plus size={14} />Agregar participante
                </button>
              )}
            >
              Escribí una identificación UML simple, por ejemplo <code>TramiteActual:Tramite</code>.
            </CanvasStartCard>
          ) : null}
          {quickMessage ? <SequenceMessageDialog draft={quickMessage} participants={content.participants} methodOptions={quickMessageMethodOptions} flowOptions={flowOptions} referenceStatus={quickMessageReferenceStatus} onChange={setQuickMessage} onSwap={swapQuickMessage} onSubmit={saveQuickMessage} onCancel={() => setQuickMessage(null)} /> : null}
          <div className="sequence-canvas-controls" data-export-control="true">
            <button aria-label="Alejar lienzo" type="button" title="Alejar" onClick={() => setZoom((value) => Math.max(0.3, value - 0.1))}><ZoomOut size={16} /></button>
            <button aria-label="Restablecer zoom al 100%" type="button" className="sequence-zoom-reset" title="Restablecer zoom al 100%" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button aria-label="Acercar lienzo" type="button" title="Acercar" onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))}><ZoomIn size={16} /></button>
            <button aria-label="Ajustar diagrama a la vista" type="button" title="Ajustar participantes a la vista" onClick={fitDiagramToView}><Focus size={16} /></button>
          </div>
          {scrollPosition.top > 100 ? (
            <div className="sequence-sticky-participants" style={{ height: layout.maxParticipantHeaderHeight * zoom + 14 }}>
              {content.participants.filter((participant) => !participant.createdByMessageId).map((participant) => {
                const participantBox = layout.participantLayouts.get(participant.id);
                return (
                  <button
                    key={participant.id}
                    type="button"
                    className={`sequence-sticky-participant-pill ${selection?.id === participant.id ? 'active' : ''}`}
                    title={`Seleccionar ${formatSequenceParticipantName(participant)}`}
                    style={{
                      left: participant.x * zoom - scrollPosition.left,
                      width: Math.max(72, Math.round((participantBox?.headerWidth ?? 118) * zoom)),
                      minHeight: Math.max(28, Math.round((participantBox?.headerHeight ?? SEQUENCE_HEADER_HEIGHT) * zoom)),
                      fontSize: `${Math.max(9, Math.min(12, Math.round(11 * zoom)))}px`,
                    }}
                    aria-label={`Seleccionar ${formatSequenceParticipantName(participant)}`}
                    onClick={() => selectCanvasElement({ kind: 'participant', id: participant.id })}
                  >
                    {formatSequenceParticipantName(participant)}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="sequence-canvas-scroll" ref={scrollRef} onScroll={(event) => handleCanvasScroll(event.currentTarget)}>
            <div className="sequence-canvas-scale" style={{ width: layout.width * zoom, height: layout.height * zoom }}>
              <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: layout.width, height: layout.height, position: 'relative' }}>
                <SequenceDiagramCanvas
                  content={interactionContent}
                  layout={layout}
                  selected={selection}
                  selectedTimelineIds={selectedTimelineIds}
                  highlighted={highlightedSelection}
                  theme={theme}
                  classNodesById={classNodesById}
                  participantColorsEnabled={content.participantColors !== 'disabled'}
                  ariaDescriptionId="sequence-structured-description"
                  onSelect={selectCanvasElement}
                  onTimelineItemSelect={handleTimelineItemSelect}
                  onReorderMessagePointerDown={startMessageDrag}
                  onMarqueeSelect={handleMarqueeSelect}
                  insertionGuide={visibleInsertionGuide}
                  keyboardPreview={keyboardCanvasPreview}
                  onNavigateToArtifact={onNavigateToArtifact}
                  onConnect={connectLifelines}
                  onEditMessage={editMessageOnCanvas}
                  onParticipantPointerDown={startParticipantDrag}
                  onNotePointerDown={startNoteDrag}
                  onNoteResizePointerDown={startNoteResize}
                  onEditNote={handleEditNote}
                  editingNoteId={inlineNoteEditor?.noteId ?? null}
                  onFragmentPointerDown={startFragmentDrag}
                  onFragmentResizePointerDown={startFragmentResize}
                  onEditFragmentGuard={handleEditFragmentGuard}
                  onEditFragmentName={handleEditFragmentName}
                  onAddFragmentOperand={handleAddFragmentOperand}
                  onAddMessageToOperand={addMessageToOperand}
                  onAddFragmentToOperand={(fragmentId, operandId) => addFragmentToOperand(fragmentId, operandId, 'opt')}
                  boundaryResizePreview={boundaryResizePreview}
                  svgRef={(element) => { svgRef.current = element; }}
                />
                {inlineFragmentEditor ? (
                  <div
                    style={{
                      position: 'absolute',
                      left: inlineFragmentEditor.x,
                      top: inlineFragmentEditor.y,
                      zIndex: 100,
                    }}
                  >
                    <input
                      autoFocus
                      className="sequence-inline-input"
                      style={{
                        width: inlineFragmentEditor.width,
                        fontSize: '11px',
                        padding: '2px 6px',
                        background: theme.classNode.background,
                        color: theme.classNode.text,
                        border: `1.5px solid ${theme.association.strokeSelected}`,
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                        outline: 'none',
                      }}
                      value={inlineFragmentEditor.value}
                      placeholder={inlineFragmentEditor.kind === 'guard' ? 'condición' : 'nombre del fragmento'}
                      onChange={(e) => setInlineFragmentEditor({ ...inlineFragmentEditor, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitInlineFragmentEdit();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setInlineFragmentEditor(null);
                        }
                      }}
                      onBlur={() => commitInlineFragmentEdit()}
                    />
                  </div>
                ) : null}
                {inlineNoteEditor ? (() => {
                  const targetNote = content.notes.find((n) => n.id === inlineNoteEditor.noteId);
                  const scheme = SEQUENCE_NOTE_COLORS[targetNote?.color ?? 'yellow'];
                  return (
                    <div
                      className="sequence-inline-note-container"
                      style={{
                        position: 'absolute',
                        left: inlineNoteEditor.x,
                        top: inlineNoteEditor.y,
                        width: inlineNoteEditor.width,
                        height: inlineNoteEditor.height,
                        zIndex: 100,
                      }}
                    >
                      <textarea
                        autoFocus
                        className="sequence-inline-note-textarea"
                        style={{
                          width: '100%',
                          height: '100%',
                          minHeight: 0,
                          background: scheme.background,
                          color: scheme.text,
                          border: `1px solid ${theme.association.strokeSelected}`,
                          borderRadius: '4px',
                          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.12)',
                          outline: 'none',
                          resize: 'none',
                          padding: '10px 12px',
                          fontSize: '11px',
                          lineHeight: '15px',
                          fontFamily: 'Inter, Arial, sans-serif',
                          boxSizing: 'border-box',
                        }}
                        value={inlineNoteEditor.value}
                        placeholder="Escribe el texto de la nota..."
                        onChange={(e) => {
                          const val = e.target.value;
                          const minH = getSequenceNoteMinimumHeight({ text: val, width: inlineNoteEditor.width });
                          const newHeight = Math.max(inlineNoteEditor.height, minH);
                          setInlineNoteEditor({
                            ...inlineNoteEditor,
                            value: val,
                            height: newHeight,
                          });
                          if (targetNote) {
                            setNotePreview({
                              [targetNote.id]: {
                                text: val,
                                height: Math.max(targetNote.height, newHeight),
                              },
                            });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setNotePreview({});
                            setInlineNoteEditor(null);
                          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            commitInlineNoteEdit();
                          }
                        }}
                        onBlur={() => commitInlineNoteEdit()}
                      />
                      <div className="sequence-inline-note-hint">
                        ⌘Enter guarda · Esc cancela
                      </div>
                    </div>
                  );
                })() : null}
              </div>
            </div>
          </div>
        </section>
        {isReviewPanelOpen ? (
          <SequenceReviewPanel
            problems={semantics.problems}
            onSelectProblemTarget={selectOutlineItem}
            onClose={() => setIsReviewPanelOpen(false)}
          />
        ) : null}
        <aside
          aria-label="Inspector del elemento seleccionado"
          className={`sequence-inspector-panel ${inspectorCollapsed ? 'collapsed' : ''}`}
          hidden={inspectorIdle}
        >
          {!inspectorCollapsed ? (
            <div
              className="sequence-inspector-resizer"
              onPointerDown={startInspectorResize}
              title="Arrastrar para cambiar ancho del panel"
            />
          ) : null}
          <div className="sequence-inspector-toolbar">
            <button
              aria-controls="sequence-inspector-content"
              aria-expanded={!inspectorCollapsed}
              aria-label={inspectorCollapsed ? 'Expandir inspector' : 'Contraer inspector'}
              className="icon-button"
              type="button"
              title={inspectorCollapsed ? 'Expandir inspector' : 'Contraer inspector'}
              onClick={() => setInspectorCollapsed((current) => !current)}
            >
              {inspectorCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
            </button>
            {!inspectorCollapsed ? (
              <div className="sequence-inspector-title-group">
                <SlidersHorizontal size={14} />
                <h2 className="sequence-inspector-panel-title">Propiedades</h2>
              </div>
            ) : null}
          </div>
          {!inspectorCollapsed ? (
            <div id="sequence-inspector-content" className="sequence-inspector-content">
              {selectedInspector}
            </div>
          ) : null}
        </aside>
      </section>
      <div id="sequence-structured-description" className="sequence-structured-description" role="region" aria-label="Descripción estructurada del diagrama">
        <p>Diagrama de secuencia con {content.participants.length} participante{content.participants.length === 1 ? '' : 's'}, {messageCount} mensaje{messageCount === 1 ? '' : 's'} y {content.notes.length} nota{content.notes.length === 1 ? '' : 's'}.</p>
        <ul>
          {content.participants.map((participant) => <li key={`structured-participant:${participant.id}`}>Participante: {formatSequenceParticipantName(participant)}</li>)}
          {flatEntries.map((entry) => <li key={`structured-item:${entry.item.id}`} aria-level={entry.depth + 1}>{getSequenceStructuredItemLabel(entry.item, participantNames)}</li>)}
          {content.notes.map((note) => <li key={`structured-note:${note.id}`}>Nota: {note.text}</li>)}
        </ul>
      </div>
      <SequenceExportDialog
        open={exportDialogOpen}
        content={displayContent}
        layout={layout}
        options={exportOptions}
        onOptionsChange={setExportOptions}
        onClose={() => setExportDialogOpen(false)}
        onExportPng={() => { void exportPng(); }}
        onExportPdf={() => { void exportPdf(); }}
      />
      {isTemplatesOpen ? (
        <div
          className="sequence-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsTemplatesOpen(false);
          }}
        >
          <div
            ref={templateDialogRef}
            aria-labelledby="sequence-templates-dialog-title"
            aria-modal="true"
            className="sequence-modal-card sequence-templates-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            tabIndex={-1}
          >
            <div className="sequence-modal-header">
              <div className="sequence-modal-title">
                <LayoutTemplate size={22} />
                <div>
                  <h3 id="sequence-templates-dialog-title">Plantillas educativas de secuencia</h3>
                  <p>Ejemplos prediseñados listos para usar sin alterar proyectos existentes.</p>
                </div>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Cerrar"
                onClick={() => setIsTemplatesOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="sequence-templates-grid">
              {SEQUENCE_TEMPLATES.map((tmpl) => (
                <div key={tmpl.id} className="sequence-template-item">
                  <span className="sequence-template-badge">{tmpl.category}</span>
                  <h4>{tmpl.name}</h4>
                  <p>{tmpl.description}</p>
                  <div className="sequence-template-actions">
                    <button
                      type="button"
                      className="primary-action"
                      onClick={() => handleLoadTemplate(tmpl.id, false)}
                    >
                      Cargar en este diagrama
                    </button>
                    {onCreateSequenceDiagramArtifact ? (
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => handleLoadTemplate(tmpl.id, true)}
                      >
                        Crear como nuevo diagrama
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {exportDialogOpen ? (
        <div className="sequence-export-source" aria-hidden="true">
          <SequenceDiagramCanvas
            svgRef={(element) => { exportSvgRef.current = element; }}
            content={displayContent}
            layout={layout}
            selected={null}
            interactive={false}
            theme={theme}
            classNodesById={classNodesById}
            participantColorsEnabled={content.participantColors !== 'disabled'}
            onSelect={() => undefined}
            onParticipantPointerDown={() => undefined}
            onNotePointerDown={() => undefined}
            onNoteResizePointerDown={() => undefined}
            onFragmentPointerDown={() => undefined}
            onFragmentResizePointerDown={() => undefined}
          />
        </div>
      ) : null}
    </main>
  );
}
