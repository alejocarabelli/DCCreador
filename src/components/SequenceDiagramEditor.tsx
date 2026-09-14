import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  FileDown,
  FileUp,
  Focus,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Redo2,
  Search,
  Settings,
  StickyNote,
  Trash2,
  Undo2,
  UserRoundPlus,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type SyntheticEvent } from 'react';
import type { DiagramTheme, DiagramThemeId } from '../theme/themes';
import { themes } from '../theme/themes';
import type {
  ClassDiagramArtifact,
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
  SequenceParticipantKind,
  SequenceTimelineItem,
  UseCaseFlowArtifact,
} from '../types/diagram';
import { createId } from '../utils/id';
import {
  createSequenceFragment,
  createSequenceMessage,
  adjustOperandsForOperator,
  clampParticipantX,
  duplicateSequenceItem,
  findSequenceItem,
  flattenSequenceItems,
  formatSequenceMessageLabel,
  formatSequenceParticipantName,
  insertSequenceItem,
  insertSequenceItemAtY,
  insertSequenceItemBefore,
  moveSequenceItem,
  normalizeSequenceDiagramContent,
  removeSequenceItem,
  reparentSequenceItem,
  updateSequenceItem,
} from '../utils/sequenceDiagram';
import { buildSequenceLayout, SEQUENCE_HEADER_HEIGHT, SEQUENCE_MARGIN_X, SEQUENCE_TIMELINE_START } from '../utils/sequenceDiagramLayout';
import { exportSequencePdf, exportSequencePng } from '../utils/sequenceDiagramExport';
import { EditorIdentity } from './EditorIdentity';
import { SequenceDiagramCanvas } from './SequenceDiagramCanvas';
import { SequenceMessageDialog, messageDraftFields, quickMessageValues, type QuickMessageDraft } from './SequenceMessageDialog';

type SequenceSelection = { kind: 'participant' | 'message' | 'fragment' | 'note'; id: string } | null;

type SequenceDiagramEditorProps = {
  artifact: SequenceDiagramArtifact;
  canRedo: boolean;
  canUndo: boolean;
  project: DesignProject;
  theme: DiagramTheme;
  themeId: DiagramThemeId;
  onChangeContent: (content: SequenceDiagramContent, options?: { separateHistoryEntry?: boolean }) => void;
  onRedo: () => void;
  onUndo: () => void;
  onImportProject: (project: DesignProject) => void;
  onThemeChange: (themeId: DiagramThemeId) => void;
};

type MessageDraft = {
  type: SequenceMessageType;
  sourceId: string;
  targetId: string;
  name: string;
  newParticipantKind: SequenceParticipantKind;
  newParticipantName: string;
  placement: 'before' | 'after' | 'end';
};

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

export function SequenceDiagramEditor({
  artifact,
  canRedo,
  canUndo,
  project,
  theme,
  themeId,
  onChangeContent,
  onRedo,
  onUndo,
  onImportProject,
  onThemeChange,
}: SequenceDiagramEditorProps) {
  const content = useMemo(() => normalizeSequenceDiagramContent(artifact.content), [artifact.content]);
  const [selection, setSelection] = useState<SequenceSelection>(null);
  const [messageDraft, setMessageDraft] = useState<MessageDraft | null>(null);
  const [quickMessage, setQuickMessage] = useState<QuickMessageDraft | null>(null);
  const [outlineVisible, setOutlineVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedFragments, setCollapsedFragments] = useState<Set<string>>(() => new Set());
  const [zoom, setZoom] = useState(1);
  const [scrollPosition, setScrollPosition] = useState({ left: 0, top: 0 });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [fragmentPreview, setFragmentPreview] = useState<Record<string, Partial<SequenceFragment>>>({});
  const [participantPreview, setParticipantPreview] = useState<Record<string, number>>({});
  const [notePreview, setNotePreview] = useState<Record<string, Partial<SequenceNote>>>({});
  const [draggedOutlineItemId, setDraggedOutlineItemId] = useState<string | null>(null);
  const [outlineDropTargetId, setOutlineDropTargetId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toolbarRef = useRef<HTMLElement | null>(null);
  const canvasExpansionRef = useRef(0);

  const updateFragmentPreviews = useCallback((
    items: SequenceTimelineItem[],
    previews: Record<string, Partial<SequenceFragment>>,
  ): SequenceTimelineItem[] => items.map((item) => {
    if (item.kind !== 'fragment') return item;
    const preview = previews[item.id];
    const updated: SequenceFragment = preview ? { ...item, ...preview } : item;
    return {
      ...updated,
      operands: updated.operands.map((operand) => ({
        ...operand,
        items: updateFragmentPreviews(operand.items, previews),
      })),
    };
  }), []);

  const displayContent = useMemo<SequenceDiagramContent>(() => ({
    ...content,
    participants: content.participants.map((participant) => ({
      ...participant,
      x: participantPreview[participant.id] ?? participant.x,
    })),
    notes: content.notes.map((note) => ({ ...note, ...(notePreview[note.id] ?? {}) })),
    items: Object.keys(fragmentPreview).length > 0
      ? updateFragmentPreviews(content.items, fragmentPreview)
      : content.items,
  }), [content, fragmentPreview, notePreview, participantPreview, updateFragmentPreviews]);
  const layout = useMemo(() => buildSequenceLayout(displayContent), [displayContent]);
  const classDiagrams = project.artifacts.filter((candidate): candidate is ClassDiagramArtifact => candidate.type === 'class-diagram');
  const flows = project.artifacts.filter((candidate): candidate is UseCaseFlowArtifact => candidate.type === 'use-case-flow');
  const associatedClassDiagram = classDiagrams.find((candidate) => candidate.id === content.classDiagramArtifactId);
  const flatEntries = useMemo(() => flattenSequenceItems(content.items), [content.items]);
  const selectedItem = selection?.kind === 'message' || selection?.kind === 'fragment'
    ? findSequenceItem(content.items, selection.id)
    : null;
  const selectedParticipant = selection?.kind === 'participant'
    ? content.participants.find((participant) => participant.id === selection.id)
    : undefined;
  const selectedNote = selection?.kind === 'note' ? content.notes.find((note) => note.id === selection.id) : undefined;
  const methodOptions = selectedItem?.kind === 'message'
    ? [selectedItem.sourceId, selectedItem.targetId].flatMap((participantId) => {
        const participant = content.participants.find((candidate) => candidate.id === participantId);
        const classNode = associatedClassDiagram?.content.nodes.find((node) => node.id === participant?.classifierNodeId);
        return (classNode?.data.methods ?? []).map((method) => ({
          id: method.id,
          label: `${classNode?.data.name || participant?.classifierName || 'Clase'}.${method.name || 'método'}`,
          name: method.name,
          parameters: method.parameters,
          returnType: method.returnType,
        }));
      })
    : [];
  const quickMessageMethodOptions = useMemo(() => {
    if (!quickMessage?.targetId || !associatedClassDiagram) return [];
    const target = content.participants.find((p) => p.id === quickMessage.targetId);
    const classNode = associatedClassDiagram.content.nodes.find((node) => node.id === target?.classifierNodeId);
    return (classNode?.data.methods ?? []).map((method) => ({
      id: method.id,
      label: `${classNode?.data.name || target?.classifierName || 'Clase'}.${method.name || 'método'}()`,
      name: method.name,
      parameters: method.parameters,
      returnType: method.returnType,
    }));
  }, [quickMessage?.targetId, associatedClassDiagram, content.participants]);
  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback((current) => current === message ? null : current), 2400);
  }, []);

  const commit = useCallback((next: SequenceDiagramContent, separateHistoryEntry = true): void => {
    onChangeContent(normalizeSequenceDiagramContent(next), { separateHistoryEntry });
  }, [onChangeContent]);

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

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setMessageDraft(null);
      setQuickMessage(null);
      setParticipantPreview({});
      setNotePreview({});
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    const closeMenus = (event: MouseEvent): void => {
      if (toolbarRef.current?.contains(event.target as Node)) return;
      toolbarRef.current?.querySelectorAll('details[open]').forEach((details) => details.removeAttribute('open'));
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
    const maxParticipantX = Math.max(SEQUENCE_MARGIN_X, ...content.participants.map((p) => p.x));
    const diagramW = Math.max(400, maxParticipantX + SEQUENCE_MARGIN_X);
    const diagramH = Math.max(400, layout.height);
    const optimalZoom = Math.max(0.3, Math.min(1.2, Math.min(viewportW / diagramW, viewportH / diagramH)));
    setZoom(optimalZoom);
    scrollEl.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
  }, [content.participants, layout.height]);

  const handleToolbarMenuToggle = (event: SyntheticEvent<HTMLDetailsElement>): void => {
    const details = event.currentTarget;
    if (!details.open) return;
    toolbarRef.current?.querySelectorAll('details[open]').forEach((candidate) => {
      if (candidate !== details) candidate.removeAttribute('open');
    });
  };

  const addParticipant = (kind: SequenceParticipantKind): void => {
    const x = Math.max(120, ...content.participants.map((participant) => participant.x + 230));
    const participant: SequenceParticipant = {
      id: createId(),
      kind,
      name: kind === 'actor' ? 'Actor' : '',
      classifierName: kind === 'actor' ? '' : participantKindLabels[kind],
      x,
    };
    commit({ ...content, participants: [...content.participants, participant] });
    setSelection({ kind: 'participant', id: participant.id });
  };

  const beginMessage = (type: SequenceMessageType = 'synchronous'): void => {
    setQuickMessage(null);
    setMessageDraft({
      type,
      sourceId: selectedParticipant?.id ?? content.participants[0]?.id ?? '',
      targetId: content.participants[1]?.id ?? content.participants[0]?.id ?? '',
      name: '',
      newParticipantKind: 'object',
      newParticipantName: type === 'create' ? 'DTO ' : '',
      placement: selectedItem ? 'after' : 'end',
    });
  };

  const submitMessage = (event: FormEvent): void => {
    event.preventDefault();
    if (messageDraft === null || !messageDraft.sourceId) return;
    let nextParticipants = [...content.participants];
    let targetId = messageDraft.targetId;
    let createdParticipant: SequenceParticipant | undefined;
    if (messageDraft.type === 'create') {
      const x = Math.max(120, ...content.participants.map((participant) => participant.x + 230));
      createdParticipant = {
        id: createId(),
        kind: messageDraft.newParticipantKind,
        name: messageDraft.newParticipantKind === 'actor' ? messageDraft.newParticipantName || 'Actor' : '',
        classifierName: messageDraft.newParticipantKind === 'actor' ? '' : messageDraft.newParticipantName || 'Objeto',
        x,
      };
      targetId = createdParticipant.id;
      nextParticipants.push(createdParticipant);
    }
    if (!targetId) return;
    const message = createSequenceMessage(messageDraft.type, messageDraft.sourceId, targetId);
    message.name = messageDraft.type === 'return' ? '' : messageDraft.name.trim() || (messageDraft.type === 'create' ? 'create' : '');
    if (createdParticipant !== undefined) createdParticipant.createdByMessageId = message.id;
    if (messageDraft.type === 'destroy') {
      nextParticipants = nextParticipants.map((participant) => participant.id === targetId
        ? { ...participant, destroyedByMessageId: message.id }
        : participant);
    }
    const selectedId = selectedItem?.id;
    const nextItems = selectedId && messageDraft.placement === 'before'
      ? insertSequenceItemBefore(content.items, message, selectedId)
      : insertSequenceItem(
          content.items,
          message,
          selectedId && messageDraft.placement === 'after' ? { afterItemId: selectedId } : undefined,
        );
    commit(keepAnchoredNotesWithTimeline({
      ...content,
      participants: nextParticipants,
      items: nextItems,
    }));
    setSelection({ kind: 'message', id: message.id });
    setMessageDraft(null);
  };

  const connectLifelines = (sourceId: string, targetId: string, y: number): void => {
    setMessageDraft(null);
    setQuickMessage({ ...messageDraftFields(), sourceId, targetId, y, name: '', type: 'synchronous' });
  };

  const editMessageOnCanvas = (id: string): void => {
    const message = findSequenceItem(content.items, id);
    if (message?.kind !== 'message') return;
    setSelection({ kind: 'message', id });
    setMessageDraft(null);
    setQuickMessage({ ...messageDraftFields(message), sourceId: message.sourceId, targetId: message.targetId, y: layout.messageLayouts.get(id)?.y ?? 150, name: message.name, type: message.type, editId: id });
  };

  const saveQuickMessage = (event: FormEvent): void => {
    event.preventDefault();
    if (!quickMessage) return;
    if (![quickMessage.sourceId, quickMessage.targetId].every((id) => content.participants.some((p) => p.id === id))) { setQuickMessage(null); return; }
    if (quickMessage.type === 'create') {
      if (quickMessage.sourceId === quickMessage.targetId) { showFeedback('Un objeto no puede crearse a sí mismo.'); return; }
      const probe = createSequenceMessage('create', quickMessage.sourceId, quickMessage.targetId);
      const candidateItems = quickMessage.editId ? content.items : insertSequenceItemAtY(content.items, probe, layout, quickMessage.y);
      const ordered = flattenSequenceItems(candidateItems).map((entry) => entry.item).filter((item) => item.kind === 'message');
      const index = ordered.findIndex((item) => item.id === (quickMessage.editId ?? probe.id));
      const usedBefore = ordered.slice(0, index).some((item) => item.sourceId === quickMessage.targetId || item.targetId === quickMessage.targetId);
      const createdElsewhere = ordered.some((item) => item.id !== (quickMessage.editId ?? probe.id) && item.type === 'create' && item.targetId === quickMessage.targetId);
      if (usedBefore || createdElsewhere) { showFeedback('create() debe ser la primera interacción del objeto. Usá el botón create() para crear un DTO nuevo.'); return; }
    }
    if (quickMessage.editId) {
      commit(keepAnchoredNotesWithTimeline({ ...content, items: updateSequenceItem(content.items, quickMessage.editId, (item) => ({ ...item, ...quickMessageValues(quickMessage) } as SequenceMessage)) }));
    } else {
      const message = createSequenceMessage(quickMessage.type, quickMessage.sourceId, quickMessage.targetId);
      Object.assign(message, quickMessageValues(quickMessage));
      const items = insertSequenceItemAtY(content.items, message, layout, quickMessage.y);
      commit(keepAnchoredNotesWithTimeline({ ...content, items }));
      setSelection({ kind: 'message', id: message.id });
    }
    setQuickMessage(null);
  };

  const addReturn = (): void => {
    if (selectedItem?.kind !== 'message') return;
    const reply = createSequenceMessage('return', selectedItem.targetId, selectedItem.sourceId);
    reply.replyToMessageId = selectedItem.id;
    commit(keepAnchoredNotesWithTimeline({ ...content, items: insertSequenceItem(content.items, reply, { afterItemId: selectedItem.id }) }));
    setSelection({ kind: 'message', id: reply.id });
  };

  const addFragment = (operator: SequenceFragmentOperator): void => {
    const fragment = createSequenceFragment(operator);
    const afterItemId = selectedItem?.id;
    commit(keepAnchoredNotesWithTimeline({ ...content, items: insertSequenceItem(content.items, fragment, afterItemId ? { afterItemId } : undefined) }));
    setSelection({ kind: 'fragment', id: fragment.id });
  };

  const addNote = (): void => {
    const note: SequenceNote = {
      id: createId(),
      text: 'Nueva nota',
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

  const deleteSelection = (): void => {
    if (selection === null) return;
    if (selection.kind === 'participant') {
      const messageIds = new Set(flatEntries.filter((entry) => entry.item.kind === 'message' && (entry.item.sourceId === selection.id || entry.item.targetId === selection.id)).map((entry) => entry.item.id));
      const removeMessages = (items: SequenceTimelineItem[]): SequenceTimelineItem[] => items.flatMap((item): SequenceTimelineItem[] => {
        if (item.kind === 'message') return messageIds.has(item.id) ? [] : [item];
        return [{ ...item, operands: item.operands.map((operand) => ({ ...operand, items: removeMessages(operand.items) })) }];
      });
      commit({
        ...content,
        participants: content.participants.filter((participant) => participant.id !== selection.id),
        items: removeMessages(content.items),
        activations: content.activations.filter((activation) => activation.participantId !== selection.id),
        notes: content.notes.filter((note) => !(note.anchorKind === 'participant' && note.anchorId === selection.id)),
      });
    } else if (selection.kind === 'note') {
      commit({ ...content, notes: content.notes.filter((note) => note.id !== selection.id) });
    } else {
      const result = removeSequenceItem(content.items, selection.id);
      commit(keepAnchoredNotesWithTimeline({
        ...content,
        items: result.items,
        activations: content.activations.filter((activation) => activation.startMessageId !== selection.id && activation.endMessageId !== selection.id),
        notes: content.notes.map((note) => note.anchorId === selection.id ? { ...note, anchorKind: 'free', anchorId: undefined } : note),
      }));
    }
    setSelection(null);
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
      deleteSelectionRef.current();
    };
    window.addEventListener('keydown', handleDeleteSelection);
    return () => window.removeEventListener('keydown', handleDeleteSelection);
  }, [messageDraft, quickMessage]);

  const moveSelectedItem = useCallback((direction: -1 | 1): void => {
    if (selection?.kind !== 'message' && selection?.kind !== 'fragment') return;
    commit(keepAnchoredNotesWithTimeline({ ...content, items: moveSequenceItem(content.items, selection.id, direction) }));
  }, [commit, content, keepAnchoredNotesWithTimeline, selection]);

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
    const nearRight = element.scrollWidth - element.scrollLeft - element.clientWidth < 120;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    if (!nearRight && !nearBottom) return;
    canvasExpansionRef.current = now;
    commit({
      ...content,
      canvas: {
        width: nearRight ? content.canvas.width + 1200 : content.canvas.width,
        height: nearBottom ? content.canvas.height + 1200 : content.canvas.height,
      },
    }, false);
  };

  const duplicateSelectedItem = useCallback((): void => {
    if (selection?.kind !== 'message' && selection?.kind !== 'fragment') return;
    const result = duplicateSequenceItem(content.items, selection.id);
    commit(keepAnchoredNotesWithTimeline({ ...content, items: result.items }));
    if (result.duplicateId) setSelection({ kind: selection.kind, id: result.duplicateId });
  }, [commit, content, keepAnchoredNotesWithTimeline, selection]);

  useEffect(() => {
    const handleTimelineShortcuts = (event: KeyboardEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], dialog') !== null) return;
      if (messageDraft !== null || quickMessage !== null) return;

      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        if (selection?.kind === 'message' || selection?.kind === 'fragment') {
          event.preventDefault();
          moveSelectedItem(event.key === 'ArrowUp' ? -1 : 1);
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
    };
    window.addEventListener('keydown', handleTimelineShortcuts);
    return () => window.removeEventListener('keydown', handleTimelineShortcuts);
  }, [messageDraft, quickMessage, selection, moveSelectedItem, duplicateSelectedItem]);

  const startParticipantDrag = (participant: SequenceParticipant, event: ReactPointerEvent<SVGGElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = event.clientX;
    const original = participant.x;
    let finalX = original;
    const move = (pointerEvent: PointerEvent): void => {
      finalX = clampParticipantX(content.participants, participant.id, original + (pointerEvent.clientX - start) / zoom);
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
    if (event.button !== 0 || (event.target instanceof Element && event.target.hasAttribute('data-export-control'))) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY };
    let position = { x: note.x, y: note.y };
    const move = (pointerEvent: PointerEvent): void => {
      position = { x: Math.max(0, note.x + (pointerEvent.clientX - start.x) / zoom), y: Math.max(0, note.y + (pointerEvent.clientY - start.y) / zoom) };
      setNotePreview({ [note.id]: position });
    };
    const finish = (): void => {
      window.removeEventListener('pointermove', move);
      setNotePreview({});
      commit({ ...content, notes: content.notes.map((candidate) => candidate.id === note.id ? { ...candidate, ...position } : candidate) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };

  const startNoteResize = (note: SequenceNote, event: ReactPointerEvent<SVGRectElement>): void => {
    event.stopPropagation();
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY };
    let size = { width: note.width, height: note.height };
    const move = (pointerEvent: PointerEvent): void => {
      size = { width: Math.max(120, note.width + (pointerEvent.clientX - start.x) / zoom), height: Math.max(70, note.height + (pointerEvent.clientY - start.y) / zoom) };
      setNotePreview({ [note.id]: size });
    };
    const finish = (): void => {
      window.removeEventListener('pointermove', move);
      setNotePreview({});
      commit({ ...content, notes: content.notes.map((candidate) => candidate.id === note.id ? { ...candidate, ...size } : candidate) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };

  const startFragmentDrag = (fragment: SequenceFragment, event: ReactPointerEvent<SVGGElement>): void => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.hasAttribute('data-export-control'))) return;
    event.preventDefault();
    setSelection({ kind: 'fragment', id: fragment.id });
    const box = layout.fragmentLayouts.get(fragment.id);
    const startX = event.clientX;
    const startY = event.clientY;
    const origX = fragment.x ?? box?.x ?? 80;
    const origY = fragment.y ?? box?.y ?? 180;
    const origW = fragment.width ?? box?.width ?? 320;
    const origH = fragment.height ?? box?.height ?? 140;
    let finalPos = { x: origX, y: origY };

    const move = (pointerEvent: PointerEvent): void => {
      const dx = (pointerEvent.clientX - startX) / zoom;
      const dy = (pointerEvent.clientY - startY) / zoom;
      finalPos = {
        x: Math.max(20, Math.round(origX + dx)),
        y: Math.max(SEQUENCE_TIMELINE_START - 20, Math.round(origY + dy)),
      };
      setFragmentPreview({
        [fragment.id]: {
          x: finalPos.x,
          y: finalPos.y,
          width: origW,
          height: origH,
        },
      });
    };

    const finish = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      setFragmentPreview({});
      if (Math.abs(finalPos.x - origX) > 1 || Math.abs(finalPos.y - origY) > 1) {
        updateItem(fragment.id, {
          x: finalPos.x,
          y: finalPos.y,
          width: origW,
          height: origH,
        });
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
    const box = layout.fragmentLayouts.get(fragment.id);
    const startX = event.clientX;
    const startY = event.clientY;
    const origX = fragment.x ?? box?.x ?? 80;
    const origY = fragment.y ?? box?.y ?? 180;
    const origW = fragment.width ?? box?.width ?? 320;
    const origH = fragment.height ?? box?.height ?? 140;
    let finalGeom = { x: origX, y: origY, width: origW, height: origH };

    const move = (pointerEvent: PointerEvent): void => {
      const dx = (pointerEvent.clientX - startX) / zoom;
      const dy = (pointerEvent.clientY - startY) / zoom;
      let nextX = origX;
      let nextY = origY;
      let nextW = origW;
      let nextH = origH;

      if (handle === 'se' || handle === 'e' || handle === 'ne') {
        nextW = Math.max(140, Math.round(origW + dx));
      }
      if (handle === 'sw' || handle === 'w' || handle === 'nw') {
        const candidateW = origW - dx;
        if (candidateW >= 140) {
          nextX = Math.max(20, Math.round(origX + dx));
          nextW = Math.round(candidateW);
        } else {
          nextX = origX + origW - 140;
          nextW = 140;
        }
      }
      if (handle === 'se' || handle === 's' || handle === 'sw') {
        nextH = Math.max(60, Math.round(origH + dy));
      }
      if (handle === 'ne' || handle === 'n' || handle === 'nw') {
        const candidateH = origH - dy;
        if (candidateH >= 60) {
          nextY = Math.max(SEQUENCE_TIMELINE_START - 20, Math.round(origY + dy));
          nextH = Math.round(candidateH);
        } else {
          nextY = origY + origH - 60;
          nextH = 60;
        }
      }

      finalGeom = { x: nextX, y: nextY, width: nextW, height: nextH };
      setFragmentPreview({ [fragment.id]: finalGeom });
    };

    const finish = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      setFragmentPreview({});
      updateItem(fragment.id, finalGeom);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };


  const updateParticipant = (id: string, values: Partial<SequenceParticipant>): void => commit({
    ...content,
    participants: content.participants.map((participant) => participant.id === id ? { ...participant, ...values } : participant),
  }, false);
  const moveParticipantHorizontal = (participantId: string, direction: -1 | 1): void => {
    const sorted = [...content.participants].sort((a, b) => a.x - b.x);
    const index = sorted.findIndex((p) => p.id === participantId);
    if (index < 0) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    const currentX = sorted[index].x;
    const neighborX = sorted[targetIndex].x;
    const updated = content.participants.map((p) => {
      if (p.id === sorted[index].id) return { ...p, x: neighborX };
      if (p.id === sorted[targetIndex].id) return { ...p, x: currentX };
      return p;
    });
    updated.sort((a, b) => a.x - b.x);
    commit({ ...content, participants: updated });
  };
  const updateNote = (id: string, values: Partial<SequenceNote>): void => commit({
    ...content,
    notes: content.notes.map((note) => note.id === id ? { ...note, ...values } : note),
  }, false);
  const updateItem = (id: string, values: Partial<SequenceMessage> | Partial<SequenceFragment>): void => commit(keepAnchoredNotesWithTimeline({
    ...content,
    items: updateSequenceItem(content.items, id, (item) => ({ ...item, ...values } as SequenceTimelineItem)),
  }), false);

  const itemMatchesSearch = useCallback((item: SequenceTimelineItem, query: string): boolean => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return true;
    if (item.kind === 'message') {
      return `${item.name} ${item.arguments} ${item.flowReference}`.toLocaleLowerCase().includes(q);
    }
    const selfMatch = `${item.operator} ${item.name} ${item.operands.map((operand) => operand.guard).join(' ')}`.toLocaleLowerCase().includes(q);
    if (selfMatch) return true;
    return item.operands.some((operand) => operand.items.some((child) => itemMatchesSearch(child, query)));
  }, []);

  const hasOutlineMatches = useMemo(() => {
    if (searchQuery.trim().length === 0) return true;
    return content.items.some((item) => itemMatchesSearch(item, searchQuery));
  }, [content.items, searchQuery, itemMatchesSearch]);

  const renderOutline = (items: SequenceTimelineItem[], depth = 0): ReactNode => items.map((item) => {
    if (!itemMatchesSearch(item, searchQuery)) return null;
    const isCollapsed = item.kind === 'fragment' && collapsedFragments.has(item.id);
    return (
      <div key={item.id} className="sequence-outline-group">
        <button
          className={`sequence-outline-item ${selection?.id === item.id ? 'active' : ''} ${outlineDropTargetId === item.id ? 'drop-target' : ''}`}
          draggable
          style={{ paddingLeft: 10 + depth * 16 }}
          type="button"
          onClick={() => setSelection({ kind: item.kind, id: item.id })}
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
        onImportProject(JSON.parse(String(reader.result)) as DesignProject);
        showFeedback('Proyecto importado');
      } catch {
        window.alert('El archivo JSON no es válido.');
      }
    };
    reader.readAsText(file);
  };

  const exportPng = async (): Promise<void> => {
    if (!svgRef.current) return;
    try {
      await exportSequencePng(svgRef.current, artifact.name);
      showFeedback('PNG exportado');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo exportar el PNG.');
    }
  };

  const exportPdf = async (mode: 'multipage' | 'wide'): Promise<void> => {
    if (!svgRef.current) return;
    try {
      await exportSequencePdf(svgRef.current, artifact.name, mode);
      showFeedback(mode === 'multipage' ? 'PDF multipágina exportado' : 'PDF ancho exportado');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo exportar el PDF.');
    }
  };

  const locations = flatEntries.filter((entry) => entry.item.kind === 'fragment').flatMap((entry) => {
    const fragment = entry.item as SequenceFragment;
    return fragment.operands.map((operand, index) => ({ value: `${fragment.id}:${operand.id}`, label: `${fragment.operator} · ${operand.guard || `sección ${index + 1}`}` }));
  });

  const participantInspector = selectedParticipant ? (
    <>
      <div className="sequence-inspector-heading"><div><span>Participante</span><h3>{formatSequenceParticipantName(selectedParticipant)}</h3></div><button className="icon-button danger" type="button" title="Eliminar participante" onClick={deleteSelection}><Trash2 size={16} /></button></div>
      <div className="sequence-inspector-actions">
        <button className="secondary-action" type="button" title="Mover participante a la izquierda" onClick={() => moveParticipantHorizontal(selectedParticipant.id, -1)}>
          <ArrowLeft size={14} /> Izquierda
        </button>
        <button className="secondary-action" type="button" title="Mover participante a la derecha" onClick={() => moveParticipantHorizontal(selectedParticipant.id, 1)}>
          <ArrowRight size={14} /> Derecha
        </button>
      </div>
      <label><span>Tipo</span><select value={selectedParticipant.kind} onChange={(event) => updateParticipant(selectedParticipant.id, { kind: event.target.value as SequenceParticipantKind })}>{Object.entries(participantKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>Nombre de instancia</span><input value={selectedParticipant.name} onChange={(event) => updateParticipant(selectedParticipant.id, { name: event.target.value })} placeholder="casoActual" /></label>
      {selectedParticipant.kind !== 'actor' ? <label><span>Clase / tipo</span><input value={selectedParticipant.classifierName} onChange={(event) => updateParticipant(selectedParticipant.id, { classifierName: event.target.value })} placeholder="Caso" /></label> : null}
      {selectedParticipant.kind !== 'actor' ? <label><span>Vincular con clase</span><select value={selectedParticipant.classifierNodeId ?? ''} onChange={(event) => {
        const node = associatedClassDiagram?.content.nodes.find((candidate) => candidate.id === event.target.value);
        updateParticipant(selectedParticipant.id, { classifierNodeId: event.target.value || undefined, classifierName: node?.data.name || selectedParticipant.classifierName });
      }}><option value="">Sin vínculo</option>{associatedClassDiagram?.content.nodes.map((node) => <option key={node.id} value={node.id}>{node.data.name || 'Clase sin nombre'}</option>)}</select></label> : null}
      <section className="sequence-inspector-section"><h4>Activaciones manuales</h4><button className="secondary-action" type="button" onClick={() => {
        const participantMessages = layout.orderedMessages.filter((message) => message.sourceId === selectedParticipant.id || message.targetId === selectedParticipant.id);
        if (participantMessages.length === 0) return;
        const activation: SequenceActivation = { id: createId(), participantId: selectedParticipant.id, startMessageId: participantMessages[0].id, endMessageId: participantMessages.at(-1)?.id, level: 0, manual: true };
        commit({ ...content, activations: [...content.activations, activation] });
      }}><Plus size={14} /> Activación</button>
      {content.activations.filter((activation) => activation.manual && activation.participantId === selectedParticipant.id).map((activation) => <div className="sequence-activation-row" key={activation.id}><select value={activation.startMessageId} onChange={(event) => commit({ ...content, activations: content.activations.map((candidate) => candidate.id === activation.id ? { ...candidate, startMessageId: event.target.value } : candidate) })}>{layout.orderedMessages.map((message, index) => <option key={message.id} value={message.id}>Inicio · {index + 1}. {message.type === 'return' ? 'Retorno' : (message.name || messageTypeLabels[message.type])}</option>)}</select><select value={activation.endMessageId ?? ''} onChange={(event) => commit({ ...content, activations: content.activations.map((candidate) => candidate.id === activation.id ? { ...candidate, endMessageId: event.target.value || undefined } : candidate) })}><option value="">Automático</option>{layout.orderedMessages.map((message, index) => <option key={message.id} value={message.id}>Fin · {index + 1}. {message.type === 'return' ? 'Retorno' : (message.name || messageTypeLabels[message.type])}</option>)}</select><button className="icon-button" type="button" onClick={() => commit({ ...content, activations: content.activations.filter((candidate) => candidate.id !== activation.id) })}><Trash2 size={13} /></button></div>)}</section>
    </>
  ) : null;

  const messageInspector = selectedItem?.kind === 'message' ? (
    <>
      {/* Section 1: Header with actions */}
      <div className="sequence-inspector-heading"><div><span>Mensaje</span><h3>{selectedItem.type === 'return' ? 'Retorno' : selectedItem.name || 'Mensaje sin nombre'}</h3></div><button className="icon-button danger" type="button" onClick={deleteSelection}><Trash2 size={16} /></button></div>
      <div className="sequence-inspector-actions"><button className="secondary-action" type="button" onClick={() => moveSelectedItem(-1)}><ArrowUp size={14} /> Subir</button><button className="secondary-action" type="button" onClick={() => moveSelectedItem(1)}><ArrowDown size={14} /> Bajar</button><button className="secondary-action" type="button" onClick={duplicateSelectedItem}><Copy size={14} /> Duplicar</button></div>
      {selectedItem.type === 'create'
        ? <p className="sequence-inspector-hint">Este mensaje crea a su participante con create(). El tipo y el destino se gestionan al crearlo; para cambiarlos, eliminalo y usá el botón create() de la barra.</p>
        : <label><span>Tipo</span><select value={selectedItem.type} onChange={(event) => updateItem(selectedItem.id, { type: event.target.value as SequenceMessageType, ...(event.target.value === 'return' ? { name: '', arguments: '', parameterValues: '', returnType: '' } : {}) })}>{Object.entries(messageTypeLabels).filter(([value]) => value !== 'create').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}

      {/* Section 2: Route */}
      <section className="sequence-inspector-section"><h4>Ruta</h4>
        <div className="sequence-route-row"><label><span>Origen</span><select value={selectedItem.sourceId} onChange={(event) => updateItem(selectedItem.id, { sourceId: event.target.value })}>{content.participants.map((participant) => <option key={participant.id} value={participant.id}>{formatSequenceParticipantName(participant)}</option>)}</select></label><span className="sequence-route-arrow">→</span>{selectedItem.type === 'create'
          ? <label><span>Destino (creado)</span><input disabled value={content.participants.filter((participant) => participant.id === selectedItem.targetId).map(formatSequenceParticipantName).join('') || 'Participante no disponible'} /></label>
          : <label><span>Destino</span><select value={selectedItem.targetId} onChange={(event) => updateItem(selectedItem.id, { targetId: event.target.value })}>{content.participants.map((participant) => <option key={participant.id} value={participant.id}>{formatSequenceParticipantName(participant)}</option>)}</select></label>}</div>
        {selectedItem.type === 'synchronous' || selectedItem.type === 'asynchronous' ? <button className="secondary-action" type="button" onClick={addReturn}>+ Agregar retorno</button> : null}
      </section>

      {/* Section 3: Operation (collapsible, open by default) */}
      {selectedItem.type !== 'return' ? <details className="sequence-inspector-section sequence-collapsible-section" open><summary><h4>Operación</h4></summary>
        <label><span>Método vinculado</span><select value={selectedItem.operationMethodId ?? ''} onChange={(event) => {
          const method = methodOptions.find((candidate) => candidate.id === event.target.value);
          updateItem(selectedItem.id, method ? { operationMethodId: method.id, name: method.name, arguments: method.parameters, returnType: method.returnType } : { operationMethodId: undefined });
        }}>{selectedItem.operationMethodId && !methodOptions.some((method) => method.id === selectedItem.operationMethodId) ? <option value={selectedItem.operationMethodId}>Método no disponible</option> : null}<option value="">Texto libre</option>{methodOptions.map((method) => <option key={method.id} value={method.id}>{method.label}</option>)}</select>{selectedItem.operationMethodId && !methodOptions.some((method) => method.id === selectedItem.operationMethodId) ? <small className="sequence-reference-warning">La referencia falta, pero el texto del mensaje se conserva.</small> : null}</label>
        <label><span>Operación / texto</span><input value={selectedItem.name} onChange={(event) => updateItem(selectedItem.id, { name: event.target.value })} placeholder="buscarCaso" /></label>
        <label><span>Parámetros</span><input value={selectedItem.arguments} onChange={(event) => updateItem(selectedItem.id, { arguments: event.target.value })} placeholder="idCaso" /></label>
        <label><span>Valores concretos</span><input value={selectedItem.parameterValues} onChange={(event) => updateItem(selectedItem.id, { parameterValues: event.target.value })} placeholder="42, estado" /></label>
        <label><span>Resultado</span><input value={selectedItem.returnType} onChange={(event) => updateItem(selectedItem.id, { returnType: event.target.value })} placeholder="Caso" /></label>
      </details> : <p className="sequence-inspector-hint">Los retornos se muestran como línea discontinua, sin texto ni número.</p>}

      {/* Section 4: Context (collapsible, closed by default) */}
      <details className="sequence-inspector-section sequence-collapsible-section"><summary><h4>Contexto</h4></summary>
        <label><span>Referencia al flujo</span><input list="sequence-flow-steps" value={selectedItem.flowReference} onChange={(event) => updateItem(selectedItem.id, { flowReference: event.target.value })} placeholder="4.2 / CA 1" /><datalist id="sequence-flow-steps">{flows.flatMap((flow) => [...flow.content.basicFlow, ...flow.content.alternativeFlows.flatMap((alternative) => alternative.steps)]).flatMap((step) => [step.actor, step.system]).filter(Boolean).map((value) => <option key={value} value={value} />)}</datalist></label>
        <label><span>Ubicación</span><select value={findParentLocation(content, selectedItem.id)} onChange={(event) => commit(keepAnchoredNotesWithTimeline({ ...content, items: updateNestedItemLocation(content.items, selectedItem.id, event.target.value) }))}><option value="root">Secuencia principal</option>{locations.map((location) => <option key={location.value} value={location.value}>{location.label}</option>)}</select></label>
      </details>
    </>
  ) : null;

  const fragmentInspector = selectedItem?.kind === 'fragment' ? (
    <>
      <div className="sequence-inspector-heading"><div><span>Fragmento combinado</span><h3>{selectedItem.operator}</h3></div><button className="icon-button danger" type="button" onClick={deleteSelection}><Trash2 size={16} /></button></div>
      <div className="sequence-inspector-actions"><button className="secondary-action" type="button" onClick={() => moveSelectedItem(-1)}><ArrowUp size={14} /> Subir</button><button className="secondary-action" type="button" onClick={() => moveSelectedItem(1)}><ArrowDown size={14} /> Bajar</button><button className="secondary-action" type="button" onClick={duplicateSelectedItem}><Copy size={14} /> Duplicar</button></div>
      <details className="sequence-inspector-section sequence-collapsible-section" open><summary><h4>Configuración</h4></summary>
        <label><span>Operador</span><select value={selectedItem.operator} onChange={(event) => {
          const operator = event.target.value as SequenceFragmentOperator;
          updateItem(selectedItem.id, { operator, operands: adjustOperandsForOperator(operator, selectedItem.operands) });
        }}>{Object.entries(fragmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Nombre / referencia</span><input value={selectedItem.name} onChange={(event) => updateItem(selectedItem.id, { name: event.target.value })} placeholder={selectedItem.operator === 'ref' ? 'Otra interacción' : 'Descripción opcional'} /></label>
        <div className="sequence-fragment-span"><label><span>Desde participante</span><select value={selectedItem.startParticipantId ?? ''} onChange={(event) => updateItem(selectedItem.id, { startParticipantId: event.target.value || undefined })}><option value="">Primero</option>{content.participants.map((participant) => <option key={participant.id} value={participant.id}>{formatSequenceParticipantName(participant)}</option>)}</select></label><label><span>Hasta participante</span><select value={selectedItem.endParticipantId ?? ''} onChange={(event) => updateItem(selectedItem.id, { endParticipantId: event.target.value || undefined })}><option value="">Último</option>{content.participants.map((participant) => <option key={participant.id} value={participant.id}>{formatSequenceParticipantName(participant)}</option>)}</select></label></div>
      </details>
      <details className="sequence-inspector-section sequence-collapsible-section" open>
        <summary>
          <div className="sequence-section-heading" style={{ flex: 1, marginRight: 4 }}>
            <h4>Ramas / Secciones</h4>
            {(selectedItem.operator === 'alt' || selectedItem.operator === 'par') ? (
              <button className="icon-button" type="button" title="Agregar sección" onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateItem(selectedItem.id, { operands: [...selectedItem.operands, { id: createId(), guard: '', items: [] }] }); }}><Plus size={14} /></button>
            ) : null}
          </div>
        </summary>
        {selectedItem.operands.map((operand, index) => (
          <div className="sequence-operand-row" key={operand.id}>
            <input value={operand.guard} onChange={(event) => updateItem(selectedItem.id, { operands: selectedItem.operands.map((candidate) => candidate.id === operand.id ? { ...candidate, guard: event.target.value } : candidate) })} placeholder={index === 0 ? 'condición' : 'else'} />
            <button className="icon-button" disabled={selectedItem.operands.length <= 1} type="button" title="Eliminar rama" onClick={() => updateItem(selectedItem.id, { operands: selectedItem.operands.filter((candidate) => candidate.id !== operand.id) })}><Trash2 size={13} /></button>
          </div>
        ))}
      </details>
      <details className="sequence-inspector-section sequence-collapsible-section" open>
        <summary><h4>Posición y Tamaño</h4></summary>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
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
                if (Number.isFinite(val)) updateItem(selectedItem.id, { width: Math.max(140, Math.round(val)) });
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
                if (Number.isFinite(val)) updateItem(selectedItem.id, { height: Math.max(60, Math.round(val)) });
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
        <small style={{ color: 'var(--panel-muted-text, #60717f)', fontSize: '0.66rem', marginTop: '6px', display: 'block', lineHeight: 1.35 }}>
          Arrastrá el fragmento en el lienzo para moverlo libremente en X/Y, o tirá de sus bordes y esquinas para redimensionarlo, como en Enterprise Architect.
        </small>
      </details>
    </>
  ) : null;

  const noteInspector = selectedNote ? (
    <>
      <div className="sequence-inspector-heading"><div><span>Nota</span><h3>{selectedNote.text.trim().split('\n')[0].slice(0, 24) || 'Nota sin texto'}</h3></div><button className="icon-button danger" type="button" onClick={deleteSelection}><Trash2 size={16} /></button></div>
      <label><span>Contenido</span><textarea rows={7} value={selectedNote.text} onChange={(event) => updateNote(selectedNote.id, { text: event.target.value })} placeholder="Escribí aquí una nota de apoyo..." /></label>
      <label><span>Vincular con</span><select value={selectedNote.anchorKind === 'free' ? 'free' : `${selectedNote.anchorKind}:${selectedNote.anchorId ?? ''}`} onChange={(event) => {
        if (event.target.value === 'free') updateNote(selectedNote.id, { anchorKind: 'free', anchorId: undefined });
        else { const [anchorKind, anchorId] = event.target.value.split(':'); updateNote(selectedNote.id, { anchorKind: anchorKind as SequenceNote['anchorKind'], anchorId }); }
      }}>
        <option value="free">Sin vínculo (posición libre)</option>
        {content.participants.length > 0 ? (
          <optgroup label="Participantes">
            {content.participants.map((participant) => <option key={participant.id} value={`participant:${participant.id}`}>Participante · {formatSequenceParticipantName(participant)}</option>)}
          </optgroup>
        ) : null}
        {flatEntries.some((entry) => entry.item.kind === 'message') ? (
          <optgroup label="Mensajes">
            {flatEntries.filter((entry) => entry.item.kind === 'message').map((entry) => {
              const msg = entry.item as SequenceMessage;
              return <option key={msg.id} value={`message:${msg.id}`}>Mensaje · {msg.name || messageTypeLabels[msg.type]}</option>;
            })}
          </optgroup>
        ) : null}
        {flatEntries.some((entry) => entry.item.kind === 'fragment') ? (
          <optgroup label="Fragmentos combinados">
            {flatEntries.filter((entry) => entry.item.kind === 'fragment').map((entry) => {
              const frag = entry.item as SequenceFragment;
              return <option key={frag.id} value={`fragment:${frag.id}`}>Fragmento · {frag.operator} {frag.name ? `(${frag.name})` : ''}</option>;
            })}
          </optgroup>
        ) : null}
      </select></label>
      <p className="sequence-inspector-hint">Arrastrá la nota para moverla y usá el control de su esquina para cambiar el tamaño.</p>
    </>
  ) : null;

  return (
    <main className="editor-shell sequence-editor-shell">
      <header className="editor-toolbar" ref={toolbarRef}>
        <EditorIdentity artifactKind="Diagrama de secuencia" artifactName={artifact.name} projectName={project.name} />
        <div className="editor-toolbar-actions">
          <button className="toolbar-icon-action" type="button" title={outlineVisible ? 'Ocultar panel de estructura' : 'Mostrar panel de estructura'} onClick={() => setOutlineVisible(!outlineVisible)}>{outlineVisible ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>
          <span className="toolbar-divider" />
          <button className="toolbar-icon-action" disabled={!canUndo} type="button" title="Deshacer" onClick={onUndo}><Undo2 size={17} /></button>
          <button className="toolbar-icon-action" disabled={!canRedo} type="button" title="Rehacer" onClick={onRedo}><Redo2 size={17} /></button>
          <span className="toolbar-divider" />
          <details className="toolbar-menu" onToggle={handleToolbarMenuToggle}><summary><UserRoundPlus size={15} /> Participante</summary><div className="toolbar-menu-content">{Object.entries(participantKindLabels).map(([value, label]) => <button key={value} type="button" onClick={(event) => { addParticipant(value as SequenceParticipantKind); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{label}</button>)}</div></details>
          <button className="toolbar-primary-action" type="button" onClick={() => beginMessage()}><MessageSquarePlus size={16} /> Mensaje</button>
          <button className="secondary-action" type="button" disabled={content.participants.length === 0} title="Crear un objeto o DTO en este punto de la secuencia" onClick={() => beginMessage('create')}>create()</button>
          <details className="toolbar-menu" onToggle={handleToolbarMenuToggle}><summary>Fragmento</summary><div className="toolbar-menu-content sequence-fragment-menu">{Object.entries(fragmentLabels).map(([value, label]) => <button key={value} type="button" onClick={(event) => { addFragment(value as SequenceFragmentOperator); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{label}</button>)}</div></details>
          <button className="toolbar-icon-action" type="button" title="Agregar nota" onClick={addNote}><StickyNote size={17} /></button>
          <span className="toolbar-divider" />
          <details className="toolbar-menu" onToggle={handleToolbarMenuToggle}><summary><Settings size={15} /> Ajustes</summary><div className="toolbar-menu-content sequence-settings-menu"><div className="sequence-settings-section"><span className="sequence-settings-title">Visualización</span><label className="sequence-menu-check"><input type="checkbox" checked={content.showActivations} onChange={(event) => commit({ ...content, showActivations: event.target.checked })} /> Activaciones</label><label><span>Numeración</span><select value={content.numbering} onChange={(event) => commit({ ...content, numbering: event.target.value as SequenceDiagramContent['numbering'] })}><option value="sequential">Correlativa</option><option value="hierarchical">Jerárquica</option><option value="none">Sin números</option></select></label><label><span>Tema</span><select value={themeId} onChange={(event) => onThemeChange(event.target.value as DiagramThemeId)}>{themes.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label></div><div className="sequence-settings-section"><span className="sequence-settings-title">Referencias</span><label><span>Diagrama de clases</span><select value={content.classDiagramArtifactId ?? ''} onChange={(event) => commit({ ...content, classDiagramArtifactId: event.target.value || undefined })}>{content.classDiagramArtifactId && !associatedClassDiagram ? <option value={content.classDiagramArtifactId}>Referencia no disponible</option> : null}<option value="">Sin referencia</option>{classDiagrams.map((diagram) => <option key={diagram.id} value={diagram.id}>{diagram.name}</option>)}</select>{content.classDiagramArtifactId && !associatedClassDiagram ? <small>El diagrama asociado ya no existe.</small> : null}</label><label><span>Flujo de sucesos</span><select value={content.flowArtifactId ?? ''} onChange={(event) => commit({ ...content, flowArtifactId: event.target.value || undefined })}>{content.flowArtifactId && !flows.some((flow) => flow.id === content.flowArtifactId) ? <option value={content.flowArtifactId}>Referencia no disponible</option> : null}<option value="">Sin referencia</option>{flows.map((flow) => <option key={flow.id} value={flow.id}>{flow.name}</option>)}</select>{content.flowArtifactId && !flows.some((flow) => flow.id === content.flowArtifactId) ? <small>El flujo asociado ya no existe.</small> : null}</label></div><div className="sequence-settings-section"><span className="sequence-settings-title">Archivo</span><button type="button" onClick={() => downloadProjectJson(project)}><FileDown size={16} /> Exportar JSON</button><button type="button" onClick={exportPng}><FileDown size={16} /> Exportar PNG</button><button type="button" onClick={() => void exportPdf('multipage')}><FileDown size={16} /> PDF multipágina</button><button type="button" onClick={() => void exportPdf('wide')}><FileDown size={16} /> PDF ancho</button><button type="button" onClick={() => fileInputRef.current?.click()}><FileUp size={16} /> Importar JSON</button></div></div></details>
        </div>
      </header>
      <input ref={fileInputRef} className="hidden-file-input" type="file" accept="application/json" onChange={importJson} />
      {feedback ? <div className="editor-feedback">{feedback}</div> : null}
      {messageDraft ? (
        <form className="sequence-message-composer" onSubmit={submitMessage}>
          <div><strong>Nuevo mensaje</strong><span>Se insertará después del elemento seleccionado.</span></div>
          <label><span>Tipo</span><select value={messageDraft.type} onChange={(event) => setMessageDraft({ ...messageDraft, type: event.target.value as SequenceMessageType })}>{Object.entries(messageTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Origen</span><select value={messageDraft.sourceId} onChange={(event) => setMessageDraft({ ...messageDraft, sourceId: event.target.value })}>{content.participants.map((participant) => <option key={participant.id} value={participant.id}>{formatSequenceParticipantName(participant)}</option>)}</select></label>
          {messageDraft.type === 'create' ? <><label><span>Tipo creado</span><select value={messageDraft.newParticipantKind} onChange={(event) => setMessageDraft({ ...messageDraft, newParticipantKind: event.target.value as SequenceParticipantKind })}>{Object.entries(participantKindLabels).filter(([kind]) => kind !== 'actor').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Nombre</span><input autoFocus value={messageDraft.newParticipantName} onChange={(event) => setMessageDraft({ ...messageDraft, newParticipantName: event.target.value })} placeholder="Caso" /></label></> : <label><span>Destino</span><select value={messageDraft.targetId} onChange={(event) => setMessageDraft({ ...messageDraft, targetId: event.target.value })}>{content.participants.map((participant) => <option key={participant.id} value={participant.id}>{formatSequenceParticipantName(participant)}</option>)}</select></label>}
          {messageDraft.type !== 'return' ? <label><span>Operación</span><input autoFocus={messageDraft.type !== 'create'} value={messageDraft.name} onChange={(event) => setMessageDraft({ ...messageDraft, name: event.target.value })} placeholder={messageDraft.type === 'create' ? 'create' : 'operación'} /></label> : null}
          <label><span>Insertar</span><select value={messageDraft.placement} onChange={(event) => setMessageDraft({ ...messageDraft, placement: event.target.value as MessageDraft['placement'] })} disabled={!selectedItem}><option value="after">Después</option><option value="before">Antes</option><option value="end">Al final</option></select></label>
          <button className="primary-action" type="submit" disabled={content.participants.length === 0}><Plus size={15} /> Insertar</button><button className="icon-button" type="button" title="Cancelar" onClick={() => setMessageDraft(null)}><X size={16} /></button>
        </form>
      ) : null}
      <section className={`sequence-workspace ${outlineVisible ? '' : 'sequence-workspace-focused'}`}>
        <aside className="sequence-outline-panel" hidden={!outlineVisible}>
          <div className="sequence-panel-title"><div><span>Estructura</span><strong>{flatEntries.filter((entry) => entry.item.kind === 'message').length} mensajes</strong></div><button className="icon-button" type="button" title="Agregar mensaje" onClick={() => beginMessage()}><Plus size={15} /></button></div>
          <label className="sequence-search"><Search size={14} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar mensaje o bloque" /></label>
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
            <button className="icon-button" type="button" title="Subir" disabled={!(selection?.kind === 'message' || selection?.kind === 'fragment')} onClick={() => moveSelectedItem(-1)}><ArrowUp size={14} /></button>
            <button className="icon-button" type="button" title="Bajar" disabled={!(selection?.kind === 'message' || selection?.kind === 'fragment')} onClick={() => moveSelectedItem(1)}><ArrowDown size={14} /></button>
            <button className="icon-button" type="button" title="Duplicar" disabled={!(selection?.kind === 'message' || selection?.kind === 'fragment')} onClick={duplicateSelectedItem}><Copy size={14} /></button>
            <button className="icon-button danger" type="button" title="Eliminar" disabled={!selection} onClick={deleteSelection}><Trash2 size={14} /></button>
          </div>
        </aside>
        <section className="sequence-canvas-panel">
          <div className="sequence-canvas-guide"><button className="icon-button" title={outlineVisible ? 'Ocultar estructura' : 'Mostrar estructura'} onClick={() => setOutlineVisible(!outlineVisible)}>{outlineVisible ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button><span><strong>Conectá las líneas de vida</strong> · clic en origen y destino, o arrastrá entre ellas</span></div>
          {content.participants.length === 0 ? <div className="sequence-start-card"><span className="eyebrow">Tu primera interacción</span><h3>Empezá por los participantes</h3><p>Después conectá sus líneas de vida para contar qué ocurre, paso a paso.</p><div>{(['actor', 'boundary', 'control', 'entity', 'object'] as const).map((kind) => <button className="secondary-action" key={kind} onClick={() => addParticipant(kind)}><Plus size={14} />{participantKindLabels[kind]}</button>)}</div></div> : null}
          {quickMessage ? <SequenceMessageDialog draft={quickMessage} participants={content.participants} methodOptions={quickMessageMethodOptions} onChange={setQuickMessage} onSubmit={saveQuickMessage} onCancel={() => setQuickMessage(null)} /> : null}
          <div className="sequence-canvas-controls" data-export-control="true">
            <button type="button" title="Alejar" onClick={() => setZoom((value) => Math.max(0.3, value - 0.1))}><ZoomOut size={16} /></button>
            <button type="button" className="sequence-zoom-reset" title="Restablecer zoom al 100%" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button type="button" title="Acercar" onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))}><ZoomIn size={16} /></button>
            <button type="button" title="Ajustar participantes a la vista" onClick={fitDiagramToView}><Focus size={16} /></button>
          </div>
          {scrollPosition.top > 100 ? (
            <div className="sequence-sticky-participants" style={{ height: SEQUENCE_HEADER_HEIGHT * zoom + 14 }}>
              {content.participants.filter((participant) => !participant.createdByMessageId).map((participant) => (
                <button
                  key={participant.id}
                  type="button"
                  className={`sequence-sticky-participant-pill ${selection?.id === participant.id ? 'active' : ''}`}
                  title={`Seleccionar ${formatSequenceParticipantName(participant)}`}
                  style={{
                    left: participant.x * zoom - scrollPosition.left,
                    width: Math.max(72, Math.round(118 * zoom)),
                    fontSize: `${Math.max(9, Math.min(12, Math.round(11 * zoom)))}px`,
                  }}
                  onClick={() => setSelection({ kind: 'participant', id: participant.id })}
                >
                  {formatSequenceParticipantName(participant)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="sequence-canvas-scroll" ref={scrollRef} onScroll={(event) => handleCanvasScroll(event.currentTarget)}>
            <div className="sequence-canvas-scale" style={{ width: layout.width * zoom, height: layout.height * zoom }}>
              <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: layout.width, height: layout.height }}>
                <SequenceDiagramCanvas
                  content={displayContent}
                  layout={layout}
                  selected={selection}
                  theme={theme}
                  onSelect={setSelection}
                  onConnect={connectLifelines}
                  onEditMessage={editMessageOnCanvas}
                  onParticipantPointerDown={startParticipantDrag}
                  onNotePointerDown={startNoteDrag}
                  onNoteResizePointerDown={startNoteResize}
                  onFragmentPointerDown={startFragmentDrag}
                  onFragmentResizePointerDown={startFragmentResize}
                />
              </div>
            </div>
          </div>
        </section>
        <aside className="sequence-inspector-panel">
          <div className="sequence-inspector-content">{participantInspector ?? messageInspector ?? fragmentInspector ?? noteInspector ?? <div className="sequence-empty-inspector"><p className="eyebrow">Propiedades</p><h3>Seleccioná un elemento</h3><p>Editá participantes, mensajes, bloques y notas sin perder el contexto del diagrama.</p></div>}</div>
        </aside>
      </section>
      <div className="sequence-export-source" aria-hidden="true">
        <SequenceDiagramCanvas
          svgRef={(element) => { svgRef.current = element; }}
          content={displayContent}
          layout={layout}
          selected={null}
          theme={theme}
          onSelect={() => undefined}
          onParticipantPointerDown={() => undefined}
          onNotePointerDown={() => undefined}
          onNoteResizePointerDown={() => undefined}
          onFragmentPointerDown={() => undefined}
          onFragmentResizePointerDown={() => undefined}
        />
      </div>
    </main>
  );
}
