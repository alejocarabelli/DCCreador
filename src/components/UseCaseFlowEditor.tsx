import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
} from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileDown,
  FileText,
  FileUp,
  Keyboard,
  ListChecks,
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  AlternativeUseCaseFlow,
  ClassDiagramArtifact,
  DiagramProject,
  UseCaseFlowArtifact,
  UseCaseFlowContent,
  UseCaseFlowDescription,
  UseCaseFlowPriority,
  UseCaseFlowStep,
} from '../types/diagram';
import { IMPORT_INVALID_MESSAGE, IMPORT_UNREADABLE_MESSAGE, isImportableProject } from '../utils/projectImport';
import type { DiagramTheme } from '../theme/themes';
import { createId } from '../utils/id';
import { normalizeDiagramProject, normalizeUseCaseFlowContent } from '../utils/diagramNormalization';
import { buildProjectSymbolIndex } from '../utils/projectSymbolIndex';
import { normalizeUseCaseFlowContentNumbering } from '../utils/useCaseFlowNumbering';
import {
  appendLineRef,
  buildFlowDocument,
  buildFlowVocabulary,
  createStepLine,
  findFlowBranch,
  findPseudoEntities,
  flattenFlowRows,
  getDefaultFirstStepNumber,
  getFirstStepNumber,
  getTurnSwitchLevel,
  normalizeFlowCode,
  parseFlowText,
} from '../utils/flowDocument';
import { reviewUseCaseFlow, type FlowIssue } from '../utils/useCaseFlowReview';
import { createFlowDocx } from '../utils/flowExportDocx';
import { downloadBlob } from '../utils/pdfExport';
import { EditorIdentity } from './EditorIdentity';
import { ToolbarHistory } from './ToolbarHistory';
import { DiagramReviewPanel } from './DiagramReviewPanel';
import { FlowRichTextarea } from './FlowRichTextarea';
import type { DiagramSaveStatus } from '../hooks/useProjects';
import type { StepField, FlowTextField, CompletionSuggestion } from '../types/useCaseFlowEditor';
import {
  unique,
  matchesPrefix,
  buildFlowUsageIndex,
  buildFlowSuggestions,
  buildStateSuggestions,
  type FlowCompletionContext,
  type FlowCompletionTable,
} from '../utils/useCaseFlowCompletion';
import {
  getLineInfo,
  getMarkerLength,
  normalizeStateBulletShortcut,
  insertStateBulletLine,
  changeStateBulletLevel,
  removeOrPromoteStateBullet,
  insertLineAfterCurrent,
  changeLineLevel,
  insertFlowBulletLine,
  removeOrPromoteFlowMarker,
  ensureStepMarker,
} from '../utils/useCaseFlowText';
import { setCaretAfterRender, setCaretPositionAfterRender, setStateBulletCaretAfterRender } from '../utils/textCaret';
import { AutoGrowTextarea } from './AutoGrowTextarea';

type UseCaseFlowEditorProps = {
  artifact: UseCaseFlowArtifact;
  canRedo: boolean;
  saveStatus?: DiagramSaveStatus;
  canUndo: boolean;
  project: DiagramProject;
  theme: DiagramTheme;
  onChangeContent: (content: UseCaseFlowContent) => void;
  onImportProject: (project: DiagramProject) => void;
  onRedo: () => void;
  onUndo: () => void;
};

type DescriptionField = keyof UseCaseFlowDescription;

type FlowTableId = 'basic' | `alternative:${string}`;

type StateDescriptionField = Extract<DescriptionField, 'initialState' | 'finalState'>;

type FocusTarget = {
  field: FlowTextField;
  /** Selects this whole line once focused (used to show where an issue is). */
  lineIndex?: number;
  stepId: string;
  tableId: FlowTableId;
};

type FlowTableActions = {
  addRow: (afterIndex?: number, focusField?: StepField) => void;
  deleteRow: (stepId: string) => void;
  moveRow: (index: number, direction: -1 | 1) => void;
  updateRow: (stepId: string, field: StepField, value: string) => void;
};

type CompletionState =
  | {
      activeIndex: number;
      field: FlowTextField;
      kind: 'flow';
      caretPosition: number;
      stepId: string;
      suggestions: CompletionSuggestion[];
      tableId: FlowTableId;
      value: string;
    }
  | {
      activeIndex: number;
      kind: 'ref';
      stepId: string;
      suggestions: string[];
      tableId: FlowTableId;
    }
  | {
      activeIndex: number;
      field: StateDescriptionField;
      kind: 'state';
      suggestions: CompletionSuggestion[];
    };

const PRIORITIES: UseCaseFlowPriority[] = ['A', 'B', 'C'];

/** Rows longer than this fold with «Plegar pasos largos». */
const LONG_ROW_LINES = 10;

const SHORTCUTS: Array<[string, string]> = [
  ['↵', 'Paso siguiente, ya numerado'],
  ['Tab  ⇧Tab', 'Bajar o subir un nivel'],
  ['- al inicio', 'Viñeta de detalle'],
  ['⌘↵', 'Pasarle el turno al otro lado'],
  ['⌘⇧↵', 'Turno al revés (dentro o fuera del bloque)'],
  ['⌘.', 'Plegar o desplegar el paso'],
  ['⌘⇧A', 'Camino alternativo desde esta línea'],
  ['⌘ clic', 'Ir al paso o camino mencionado'],
];

const downloadTextFile = (filename: string, text: string, type: string): void => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const createEmptyStep = (): UseCaseFlowStep => ({
  id: createId(),
  actor: '',
  system: '',
  ref: '',
});

const createAlternativeFlow = (code: string): AlternativeUseCaseFlow => ({
  id: createId(),
  code,
  name: '',
  steps: [{ ...createEmptyStep(), system: '1. ' }],
});

const moveItem = <Item,>(items: Item[], index: number, direction: -1 | 1): Item[] => {
  const targetIndex = index + direction;

  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  const item = nextItems[index];
  nextItems[index] = nextItems[targetIndex];
  nextItems[targetIndex] = item;
  return nextItems;
};

const getNextAlternativeCode = (flows: AlternativeUseCaseFlow[]): string => {
  const usedNumbers = new Set(
    flows
      .map((flow) => /(\d+)\s*$/.exec(flow.code.trim())?.[1])
      .filter((value): value is string => value !== undefined)
      .map(Number),
  );

  let nextNumber = 1;
  while (usedNumbers.has(nextNumber)) {
    nextNumber += 1;
  }

  return `CA ${nextNumber}`;
};

const getCellKey = (tableId: FlowTableId, stepId: string, field: FlowTextField): string =>
  `${tableId}:${stepId}:${field}`;

const flowIdOf = (tableId: FlowTableId): string => tableId.replace('alternative:', '');

const selectLine = (element: HTMLTextAreaElement, lineIndex: number): void => {
  const lines = element.value.split('\n');
  const start = lines.slice(0, lineIndex).reduce((total, line) => total + line.length + 1, 0);
  element.setSelectionRange(start, start + (lines[lineIndex]?.length ?? 0));
};

const countLines = (value: string): number => (value.trim().length === 0 ? 0 : value.split('\n').length);

function CompletionMenu({
  activeIndex,
  className = '',
  suggestions,
  onPick,
}: {
  activeIndex: number;
  className?: string;
  suggestions: CompletionSuggestion[];
  onPick: (index: number) => void;
}) {
  return (
    <div className={`flow-completion-menu ${className}`} role="listbox">
      {suggestions.map((suggestion, index) => (
        <button
          aria-selected={index === activeIndex}
          className={index === activeIndex ? 'active' : undefined}
          key={suggestion.id}
          role="option"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(index)}
        >
          <span>{suggestion.label}</span>
          {suggestion.detail !== undefined ? <small>{suggestion.detail}</small> : null}
        </button>
      ))}
    </div>
  );
}

export function UseCaseFlowEditor({
  artifact,
  canRedo,
  saveStatus = 'saved',
  canUndo,
  project,
  onChangeContent,
  onImportProject,
  onRedo,
  onUndo,
}: UseCaseFlowEditorProps) {
  const content = useMemo(() => normalizeUseCaseFlowContent(artifact.content), [artifact.content]);
  const toolbarRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);
  const cellRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const caretPositions = useRef(new Map<string, number>());
  const stateFieldRefs = useRef(new Map<StateDescriptionField, HTMLTextAreaElement>());
  const alternativeNameRefs = useRef(new Map<string, HTMLInputElement>());
  const foldSummaryRefs = useRef(new Map<string, HTMLButtonElement>());
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [focusedCell, setFocusedCell] = useState<FocusTarget | null>(null);
  const [focusedStateField, setFocusedStateField] = useState<StateDescriptionField | null>(null);
  const [pendingFocus, setPendingFocus] = useState<FocusTarget | null>(null);
  const [pendingNameFocus, setPendingNameFocus] = useState<string | null>(null);
  const [collapsedAlternativeIds, setCollapsedAlternativeIds] = useState<Set<string>>(() => new Set());
  const [collapsedRowIds, setCollapsedRowIds] = useState<Set<string>>(() => new Set());
  const [completionState, setCompletionState] = useState<CompletionState | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const classDiagramArtifacts = useMemo(
    () =>
      project.artifacts.filter(
        (currentArtifact): currentArtifact is ClassDiagramArtifact => currentArtifact.type === 'class-diagram',
      ),
    [project.artifacts],
  );
  const associatedClassDiagramId =
    content.classDiagramArtifactId !== undefined &&
    classDiagramArtifacts.some((classDiagramArtifact) => classDiagramArtifact.id === content.classDiagramArtifactId)
      ? content.classDiagramArtifactId
      : classDiagramArtifacts.length === 1
        ? classDiagramArtifacts[0].id
        : undefined;
  const associatedClassDiagram = classDiagramArtifacts.find(
    (classDiagramArtifact) => classDiagramArtifact.id === associatedClassDiagramId,
  );
  const symbolIndex = useMemo(() => buildProjectSymbolIndex(associatedClassDiagram), [associatedClassDiagram]);
  const flowUsageIndex = useMemo(() => buildFlowUsageIndex(content), [content]);
  const pseudoEntities = useMemo(
    () =>
      findPseudoEntities([
        ...content.basicFlow.flatMap((row) => [row.actor, row.system]),
        ...content.alternativeFlows.flatMap((flow) => flow.steps.flatMap((row) => [row.actor, row.system])),
      ]),
    [content.alternativeFlows, content.basicFlow],
  );
  const pseudoEntityNames = useMemo(() => pseudoEntities.map((entity) => entity.name).join('\n'), [pseudoEntities]);
  const vocabulary = useMemo(
    () => buildFlowVocabulary(symbolIndex, pseudoEntityNames.length === 0 ? [] : pseudoEntityNames.split('\n')),
    [pseudoEntityNames, symbolIndex],
  );
  const completionTables = useMemo<FlowCompletionTable[]>(() => {
    const toSteps = (rows: UseCaseFlowStep[]) =>
      flattenFlowRows(rows).flatMap((line) => (line.number === undefined ? [] : [{ number: line.number, text: line.body.trim() }]));
    return [
      { code: 'basic', qualifier: 'del camino básico', steps: toSteps(content.basicFlow) },
      ...content.alternativeFlows.map((flow) => ({
        code: normalizeFlowCode(flow.code),
        qualifier: `de ${normalizeFlowCode(flow.code)}`,
        steps: toSteps(flow.steps),
      })),
    ];
  }, [content.alternativeFlows, content.basicFlow]);
  const reviewIssues = useMemo(() => reviewUseCaseFlow(content, symbolIndex), [content, symbolIndex]);
  const refSuggestions = unique([
    ...content.alternativeFlows.map((flow) => flow.code).filter((code) => code.trim().length > 0),
    ...flowUsageIndex.refs,
  ]);
  const basicStepCount = completionTables[0].steps.filter((step) => !step.number.includes('.')).length;

  const showFeedback = (message: string): void => {
    setFeedbackMessage(message);

    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current);
    }

    feedbackTimeoutRef.current = window.setTimeout(() => setFeedbackMessage(null), 2200);
  };

  const commitContent = useCallback((nextContent: UseCaseFlowContent): void => {
    onChangeContent(normalizeUseCaseFlowContent(nextContent));
  }, [onChangeContent]);

  const commitNumberedContent = useCallback((nextContent: UseCaseFlowContent): void => {
    onChangeContent(normalizeUseCaseFlowContent(normalizeUseCaseFlowContentNumbering(nextContent)));
  }, [onChangeContent]);

  const updateDescription = (field: DescriptionField, value: string): void => {
    commitContent({
      ...content,
      description: {
        ...content.description,
        [field]: field === 'priority' ? (value as UseCaseFlowPriority) : value,
      },
    });
  };

  // -------------------------------------------------------------------------
  // Initial and final state.

  const openStateCompletion = (field: StateDescriptionField, value: string, position: number): void => {
    const suggestions = buildStateSuggestions(value, position, symbolIndex);
    setCompletionState((current) =>
      suggestions.length > 0
        ? { kind: 'state', field, suggestions, activeIndex: 0 }
        : current?.kind === 'state' && current.field === field ? null : current,
    );
  };

  const applyStateCompletion = (textarea: HTMLTextAreaElement, field: StateDescriptionField, index?: number): boolean => {
    if (completionState?.kind !== 'state' || completionState.field !== field) {
      return false;
    }

    const suggestion = completionState.suggestions[index ?? completionState.activeIndex];
    if (suggestion === undefined) {
      return false;
    }

    const insertion = suggestion.apply(textarea.value, textarea.selectionStart);
    updateDescription(field, insertion.value);
    setCompletionState(null);
    setCaretPositionAfterRender(textarea, insertion.caretPosition);
    window.requestAnimationFrame(() => openStateCompletion(field, insertion.value, insertion.caretPosition));
    return true;
  };

  const handleStateFieldKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
    field: StateDescriptionField,
  ): void => {
    const textarea = event.currentTarget;

    if (completionState?.kind === 'state' && completionState.field === field) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        moveCompletionSelection(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setCompletionState(null);
        return;
      }

      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey && applyStateCompletion(textarea, field)) {
        event.preventDefault();
        return;
      }
    }

    if (event.key === 'Backspace') {
      const result = removeOrPromoteStateBullet(textarea.value, textarea.selectionStart);

      if (result !== null) {
        event.preventDefault();
        updateDescription(field, result.value);
        setStateBulletCaretAfterRender(textarea, result.lineIndex, result.markerLength);
      }

      return;
    }

    if (event.key === 'Tab') {
      const result = changeStateBulletLevel(textarea.value, textarea.selectionStart, event.shiftKey ? -1 : 1);

      if (result !== null) {
        event.preventDefault();
        updateDescription(field, result.value);
        setStateBulletCaretAfterRender(textarea, result.lineIndex, result.markerLength);
      }

      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const result = insertStateBulletLine(textarea.value, textarea.selectionStart);
      updateDescription(field, result.value);
      setStateBulletCaretAfterRender(textarea, result.lineIndex, result.markerLength);
    }
  };

  const handleStateFieldChange = (
    field: StateDescriptionField,
    textarea: HTMLTextAreaElement,
  ): void => {
    const normalized = normalizeStateBulletShortcut(textarea.value, textarea.selectionStart);

    if (normalized === null) {
      updateDescription(field, textarea.value);
      openStateCompletion(field, textarea.value, textarea.selectionStart);
      return;
    }

    updateDescription(field, normalized.value);
    setStateBulletCaretAfterRender(textarea, normalized.lineIndex, normalized.markerLength);
  };

  const applyStateFieldAction = (
    field: StateDescriptionField,
    action: 'bullet' | 'clear' | 'indent' | 'outdent',
  ): void => {
    const textarea = stateFieldRefs.current.get(field);

    if (textarea === undefined) {
      return;
    }

    const result =
      action === 'bullet'
        ? insertStateBulletLine(textarea.value, textarea.selectionStart)
        : action === 'indent'
          ? changeStateBulletLevel(textarea.value, textarea.selectionStart, 1)
          : action === 'outdent'
            ? changeStateBulletLevel(textarea.value, textarea.selectionStart, -1)
            : removeOrPromoteStateBullet(textarea.value, textarea.selectionStart);

    if (result === null) {
      return;
    }

    updateDescription(field, result.value);
    setStateBulletCaretAfterRender(textarea, result.lineIndex, result.markerLength);
  };

  const updateAssociatedClassDiagram = (artifactId: string): void => {
    commitContent({
      ...content,
      classDiagramArtifactId: artifactId.length > 0 ? artifactId : undefined,
    });
  };

  // -------------------------------------------------------------------------
  // Rows.

  const getFlowRows = useCallback((tableId: FlowTableId): UseCaseFlowStep[] => {
    if (tableId === 'basic') {
      return content.basicFlow;
    }

    return content.alternativeFlows.find((flow) => flow.id === flowIdOf(tableId))?.steps ?? [];
  }, [content.alternativeFlows, content.basicFlow]);

  const withRows = useCallback((
    source: UseCaseFlowContent,
    tableId: FlowTableId,
    update: (rows: UseCaseFlowStep[]) => UseCaseFlowStep[],
  ): UseCaseFlowContent =>
    tableId === 'basic'
      ? { ...source, basicFlow: update(source.basicFlow) }
      : {
          ...source,
          alternativeFlows: source.alternativeFlows.map((flow) =>
            flow.id === flowIdOf(tableId) ? { ...flow, steps: update(flow.steps) } : flow,
          ),
        }, []);

  const insertRow = (tableId: FlowTableId, afterIndex: number | undefined, step: UseCaseFlowStep, focusField?: FlowTextField): void => {
    commitNumberedContent(withRows(content, tableId, (rows) => {
      const nextRows = [...rows];
      nextRows.splice(afterIndex === undefined ? nextRows.length : afterIndex + 1, 0, step);
      return nextRows;
    }));

    if (focusField !== undefined) {
      setPendingFocus({ tableId, stepId: step.id, field: focusField });
    }
  };

  const addRowForTable = (tableId: FlowTableId, afterIndex?: number, focusField: StepField = 'actor'): void => {
    insertRow(tableId, afterIndex, createEmptyStep(), focusField === 'ref' ? undefined : focusField);
  };

  const updateFlowCell = useCallback((
    tableId: FlowTableId,
    stepId: string,
    field: StepField,
    value: string,
    normalizeNumbering = false,
  ): void => {
    const nextContent = withRows(content, tableId, (rows) =>
      rows.map((step) => (step.id === stepId ? { ...step, [field]: value } : step)));
    (normalizeNumbering ? commitNumberedContent : commitContent)(nextContent);
  }, [commitContent, commitNumberedContent, content, withRows]);

  const deleteRow = (tableId: FlowTableId, stepId: string): void => {
    commitNumberedContent(withRows(content, tableId, (rows) => rows.filter((step) => step.id !== stepId)));
  };

  const moveRow = (tableId: FlowTableId, index: number, direction: -1 | 1): void => {
    commitNumberedContent(withRows(content, tableId, (rows) => moveItem(rows, index, direction)));
  };

  const addAlternativeFlow = (): void => {
    const nextFlow = createAlternativeFlow(getNextAlternativeCode(content.alternativeFlows));
    commitNumberedContent({
      ...content,
      alternativeFlows: [...content.alternativeFlows, nextFlow],
    });
    setCollapsedAlternativeIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(nextFlow.id);
      return nextIds;
    });
    setPendingNameFocus(nextFlow.id);
  };

  const deleteAlternativeFlow = (flowId: string): void => {
    commitNumberedContent({
      ...content,
      alternativeFlows: content.alternativeFlows.filter((flow) => flow.id !== flowId),
    });
  };

  const updateAlternativeFlow = (
    flowId: string,
    values: Partial<Pick<AlternativeUseCaseFlow, 'code' | 'name' | 'firstStepNumber'>>,
    normalizeNumbering = false,
  ): void => {
    const nextContent = {
      ...content,
      alternativeFlows: content.alternativeFlows.map((flow) => {
        if (flow.id !== flowId) return flow;
        const next = { ...flow, ...values };
        if ('firstStepNumber' in values && values.firstStepNumber === undefined) delete next.firstStepNumber;
        return next;
      }),
    };
    (normalizeNumbering ? commitNumberedContent : commitContent)(nextContent);
  };

  const getNormalizedMarkerLengthForCell = useCallback((
    tableId: FlowTableId,
    stepId: string,
    field: FlowTextField,
    value: string,
    lineIndex: number,
  ): number => {
    const normalized = normalizeUseCaseFlowContentNumbering(withRows(content, tableId, (rows) =>
      rows.map((step) => (step.id === stepId ? { ...step, [field]: value } : step))));
    const rows = tableId === 'basic'
      ? normalized.basicFlow
      : normalized.alternativeFlows.find((flow) => flow.id === flowIdOf(tableId))?.steps ?? [];
    const normalizedLine = rows.find((step) => step.id === stepId)?.[field].split('\n')[lineIndex] ?? '';
    return getMarkerLength(normalizedLine);
  }, [content, withRows]);

  // -------------------------------------------------------------------------
  // Turns, paths and folding.

  /** ⌘↵: the other side answers in a new row, numbered by the block rule. */
  const switchTurn = (
    tableId: FlowTableId,
    rowIndex: number,
    step: UseCaseFlowStep,
    field: FlowTextField,
    textarea: HTMLTextAreaElement,
    invert: boolean,
  ): void => {
    const { lineIndex } = getLineInfo(textarea.value, textarea.selectionStart);
    const rows = getFlowRows(tableId).map((row) => (row.id === step.id ? { ...row, [field]: textarea.value } : row));
    const level = getTurnSwitchLevel(rows, step.id, field, lineIndex, invert);
    const otherField: FlowTextField = field === 'actor' ? 'system' : 'actor';
    insertRow(tableId, rowIndex, { ...createEmptyStep(), [otherField]: createStepLine(level) }, otherField);
  };

  /** ⌘⇧A: a new alternative path that branches from the current line. */
  const createAlternativeFromLine = (
    tableId: FlowTableId,
    step: UseCaseFlowStep,
    field: FlowTextField,
    textarea: HTMLTextAreaElement,
  ): void => {
    const { lineIndex } = getLineInfo(textarea.value, textarea.selectionStart);
    const code = getNextAlternativeCode(content.alternativeFlows);
    const flow = createAlternativeFlow(code);
    const withRef = withRows(content, tableId, (rows) =>
      rows.map((row) => (row.id === step.id ? { ...row, [field]: appendLineRef(textarea.value, lineIndex, code) } : row)));
    commitNumberedContent({ ...withRef, alternativeFlows: [...withRef.alternativeFlows, flow] });
    setPendingNameFocus(flow.id);
    showFeedback(`${code} creado desde esta línea`);
  };

  const setRowCollapsed = (stepId: string, collapsed: boolean): void => {
    setCollapsedRowIds((current) => {
      const next = new Set(current);
      if (collapsed) next.add(stepId);
      else next.delete(stepId);
      return next;
    });
  };

  const expandRow = (tableId: FlowTableId, step: UseCaseFlowStep, field: FlowTextField): void => {
    setRowCollapsed(step.id, false);
    setPendingFocus({ tableId, stepId: step.id, field: step[field].trim().length > 0 ? field : field === 'actor' ? 'system' : 'actor' });
  };

  const foldLongRows = (): void => {
    const rows = [...content.basicFlow, ...content.alternativeFlows.flatMap((flow) => flow.steps)];
    const long = rows.filter((row) => countLines(row.actor) + countLines(row.system) > LONG_ROW_LINES);
    setCollapsedRowIds(new Set(long.map((row) => row.id)));
    showFeedback(long.length === 0 ? 'No hay pasos largos para plegar' : `${long.length} ${long.length === 1 ? 'paso plegado' : 'pasos plegados'}`);
  };

  const locateStep = (tableCode: string, number: string): FocusTarget | null => {
    const tableId: FlowTableId | undefined = tableCode === 'basic'
      ? 'basic'
      : (() => {
          const flow = content.alternativeFlows.find((candidate) => normalizeFlowCode(candidate.code) === tableCode);
          return flow === undefined ? undefined : `alternative:${flow.id}` as const;
        })();

    if (tableId === undefined) {
      return null;
    }

    const line = flattenFlowRows(getFlowRows(tableId)).find((candidate) => candidate.number === number);
    return line === undefined ? null : { tableId, stepId: line.stepId, field: line.field, lineIndex: line.lineIndex };
  };

  const revealAlternative = (flowId: string): void => {
    setCollapsedAlternativeIds((current) => {
      const next = new Set(current);
      next.delete(flowId);
      return next;
    });
    setPendingNameFocus(flowId);
  };

  const revealCell = (target: FocusTarget): void => {
    setRowCollapsed(target.stepId, false);
    if (target.tableId !== 'basic') {
      setCollapsedAlternativeIds((current) => {
        const next = new Set(current);
        next.delete(flowIdOf(target.tableId));
        return next;
      });
    }
    setPendingFocus(target);
  };

  /** ⌘-click on `(paso 3.2)`, `paso 8 del camino básico` or `[CA 2]` follows it. */
  const followReference = (event: MouseEvent<HTMLTextAreaElement>, tableId: FlowTableId): void => {
    if (!event.metaKey && !event.ctrlKey) {
      return;
    }

    const textarea = event.currentTarget;
    const { lineColumn, lineIndex, lines } = getLineInfo(textarea.value, textarea.selectionStart);
    const line = lines[lineIndex] ?? '';
    const currentTable = tableId === 'basic'
      ? 'basic'
      : normalizeFlowCode(content.alternativeFlows.find((flow) => flow.id === flowIdOf(tableId))?.code ?? '');
    const pattern =
      /\[(C\.?\s?A\.?\s*(?:N°\s*)?\d+)\]|\bpasos?\s+(?:N°\s*)?\[?(\d+(?:\.\d+)*)\]?(?:\s+(?:del?|de\s+la)\s+\[?(camino\s+b[aá]sico|C\.?\s?A\.?\s*(?:N°\s*)?\d+|camino\s+altern[oa]\s*(?:N°\s*)?\d+)\]?)?/gi;

    for (const match of line.matchAll(pattern)) {
      const start = match.index ?? 0;
      if (lineColumn < start || lineColumn > start + match[0].length) {
        continue;
      }

      event.preventDefault();
      if (match[1] !== undefined) {
        const flow = content.alternativeFlows.find((candidate) => normalizeFlowCode(candidate.code) === normalizeFlowCode(match[1]));
        if (flow === undefined) showFeedback(`${normalizeFlowCode(match[1])} todavía no existe`);
        else revealAlternative(flow.id);
        return;
      }

      const target = match[3] === undefined ? currentTable : /b[aá]sico/i.test(match[3]) ? 'basic' : normalizeFlowCode(match[3]);
      const located = locateStep(target, match[2]);
      if (located === null) showFeedback(`No existe el paso ${match[2]}`);
      else revealCell(located);
      return;
    }
  };

  const focusIssue = (issue: FlowIssue): void => {
    const location = issue.location;
    if (location === undefined) return;

    if (location.kind === 'alternative') {
      revealAlternative(location.table);
    } else if (location.kind === 'state') {
      const textarea = stateFieldRefs.current.get(location.field);
      if (textarea !== undefined) {
        textarea.focus();
        selectLine(textarea, location.lineIndex);
        textarea.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    } else {
      revealCell({
        tableId: location.table === 'basic' ? 'basic' : `alternative:${location.table}`,
        stepId: location.stepId,
        field: location.field,
        lineIndex: location.lineIndex,
      });
    }
  };

  // -------------------------------------------------------------------------
  // Completion.

  const getCompletionContext = (tableId: FlowTableId, stepId: string, field: FlowTextField): FlowCompletionContext => {
    const rows = getFlowRows(tableId);
    const rowIndex = rows.findIndex((row) => row.id === stepId);
    const precedingText = [
      ...rows.slice(0, Math.max(0, rowIndex)).flatMap((row) => [row.actor, row.system]),
      ...(field === 'system' && rowIndex >= 0 ? [rows[rowIndex].actor] : []),
    ].join('\n');
    const currentTable = tableId === 'basic'
      ? 'basic'
      : normalizeFlowCode(content.alternativeFlows.find((flow) => flow.id === flowIdOf(tableId))?.code ?? '');
    return { tables: completionTables, currentTable, precedingText, pseudoEntities };
  };

  const openFlowCompletion = (
    tableId: FlowTableId,
    stepId: string,
    field: FlowTextField,
    value: string,
    position: number,
  ): void => {
    const suggestions = buildFlowSuggestions(
      field,
      value,
      position,
      symbolIndex,
      flowUsageIndex,
      getCompletionContext(tableId, stepId, field),
    );

    if (suggestions.length === 0) {
      setCompletionState((currentState) =>
        currentState?.kind === 'flow' &&
        currentState.tableId === tableId &&
        currentState.stepId === stepId &&
        currentState.field === field
          ? null
          : currentState,
      );
      return;
    }

    setCompletionState({
      kind: 'flow',
      tableId,
      stepId,
      field,
      value,
      caretPosition: position,
      suggestions,
      activeIndex: 0,
    });
  };

  const applyFlowSuggestion = (
    textarea: HTMLTextAreaElement,
    tableId: FlowTableId,
    stepId: string,
    field: FlowTextField,
    suggestion: CompletionSuggestion,
  ): void => {
    const insertion = suggestion.apply(textarea.value, textarea.selectionStart);
    updateFlowCell(tableId, stepId, field, insertion.value, suggestion.normalizeNumbering === true);
    setCompletionState(null);
    setCaretPositionAfterRender(textarea, insertion.caretPosition);
    // A completed class opens its attributes, a completed attribute its values.
    window.requestAnimationFrame(() => openFlowCompletion(tableId, stepId, field, textarea.value, textarea.selectionStart));
  };

  const applyFlowCompletion = (
    textarea: HTMLTextAreaElement,
    tableId: FlowTableId,
    stepId: string,
    field: FlowTextField,
  ): boolean => {
    if (
      completionState === null ||
      completionState.kind !== 'flow' ||
      completionState.tableId !== tableId ||
      completionState.stepId !== stepId ||
      completionState.field !== field
    ) {
      return false;
    }

    const suggestion = completionState.suggestions[completionState.activeIndex];

    if (suggestion === undefined) {
      return false;
    }

    applyFlowSuggestion(textarea, tableId, stepId, field, suggestion);
    return true;
  };

  const openRefCompletion = (tableId: FlowTableId, stepId: string, value: string): void => {
    const suggestions = refSuggestions.filter((suggestion) => value.length === 0 || matchesPrefix(suggestion, value));

    if (suggestions.length === 0) {
      setCompletionState((currentState) =>
        currentState?.kind === 'ref' && currentState.tableId === tableId && currentState.stepId === stepId
          ? null
          : currentState,
      );
      return;
    }

    setCompletionState({ kind: 'ref', tableId, stepId, suggestions, activeIndex: 0 });
  };

  const applyRefCompletion = (
    input: HTMLInputElement,
    tableId: FlowTableId,
    stepId: string,
    actions: FlowTableActions,
  ): boolean => {
    if (
      completionState === null ||
      completionState.kind !== 'ref' ||
      completionState.tableId !== tableId ||
      completionState.stepId !== stepId
    ) {
      return false;
    }

    const suggestion = completionState.suggestions[completionState.activeIndex];

    if (suggestion === undefined) {
      return false;
    }

    actions.updateRow(stepId, 'ref', suggestion);
    setCompletionState(null);
    setCaretPositionAfterRender(input, suggestion.length);
    return true;
  };

  const moveCompletionSelection = (direction: -1 | 1): void => {
    setCompletionState((currentState) => {
      if (currentState === null || currentState.suggestions.length === 0) {
        return currentState;
      }

      return {
        ...currentState,
        activeIndex:
          (currentState.activeIndex + direction + currentState.suggestions.length) %
          currentState.suggestions.length,
      } as CompletionState;
    });
  };

  const handleFlowCellKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
    tableId: FlowTableId,
    step: UseCaseFlowStep,
    field: FlowTextField,
    rowIndex: number,
  ): void => {
    const textarea = event.currentTarget;
    const value = textarea.value;
    const cellKey = getCellKey(tableId, step.id, field);
    const command = event.metaKey || event.ctrlKey;

    if (
      completionState?.kind === 'flow' &&
      completionState.tableId === tableId &&
      completionState.stepId === step.id &&
      completionState.field === field &&
      !command
    ) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveCompletionSelection(1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveCompletionSelection(-1);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setCompletionState(null);
        return;
      }

      if ((event.key === 'Tab' && !event.shiftKey) || (event.key === 'Enter' && !event.shiftKey)) {
        event.preventDefault();
        if (applyFlowCompletion(textarea, tableId, step.id, field)) {
          return;
        }
      }
    }

    if (command && event.key === 'Enter') {
      event.preventDefault();
      setCompletionState(null);
      updateFlowCell(tableId, step.id, field, value, true);
      switchTurn(tableId, rowIndex, step, field, textarea, event.shiftKey);
      return;
    }

    if (command && event.key === '.') {
      event.preventDefault();
      setRowCollapsed(step.id, true);
      window.requestAnimationFrame(() => foldSummaryRefs.current.get(`${step.id}:${field}`)?.focus());
      return;
    }

    if (command && event.shiftKey && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      setCompletionState(null);
      createAlternativeFromLine(tableId, step, field, textarea);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const result = changeLineLevel(value, textarea.selectionStart, event.shiftKey ? -1 : 1);
      const markerLength = getNormalizedMarkerLengthForCell(tableId, step.id, field, result.value, result.lineIndex);
      updateFlowCell(tableId, step.id, field, result.value, true);
      caretPositions.current.set(cellKey, textarea.selectionStart);
      setCaretAfterRender(textarea, result.lineIndex, markerLength);
      return;
    }

    if (event.key === 'Backspace') {
      const result = removeOrPromoteFlowMarker(value, textarea.selectionStart);

      if (result !== null) {
        event.preventDefault();
        const markerLength = getNormalizedMarkerLengthForCell(tableId, step.id, field, result.value, result.lineIndex);
        updateFlowCell(tableId, step.id, field, result.value, true);
        setCaretAfterRender(textarea, result.lineIndex, markerLength);
      }

      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const result = insertLineAfterCurrent(ensureStepMarker(value), textarea.selectionStart);
      const markerLength = getNormalizedMarkerLengthForCell(tableId, step.id, field, result.value, result.lineIndex);
      updateFlowCell(tableId, step.id, field, result.value, true);
      setCaretAfterRender(textarea, result.lineIndex, markerLength);
      return;
    }
  };

  const handleRefKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    tableId: FlowTableId,
    stepId: string,
    actions: FlowTableActions,
  ): void => {
    if (
      completionState?.kind === 'ref' &&
      completionState.tableId === tableId &&
      completionState.stepId === stepId
    ) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveCompletionSelection(1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveCompletionSelection(-1);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setCompletionState(null);
        return;
      }

      if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        applyRefCompletion(event.currentTarget, tableId, stepId, actions);
      }
    }
  };

  const applyFocusedCellAction = (
    tableId: FlowTableId,
    action: 'bullet' | 'indent' | 'outdent' | 'step' | 'substep',
  ): void => {
    if (focusedCell === null || focusedCell.tableId !== tableId) {
      addRowForTable(tableId);
      return;
    }

    const cellKey = getCellKey(focusedCell.tableId, focusedCell.stepId, focusedCell.field);
    const textarea = cellRefs.current.get(cellKey);

    if (textarea === undefined) {
      addRowForTable(tableId);
      return;
    }

    const caretPosition = caretPositions.current.get(cellKey) ?? textarea.selectionStart;
    const result =
      action === 'bullet'
        ? insertFlowBulletLine(textarea.value, caretPosition)
        : action === 'indent'
          ? changeLineLevel(textarea.value, caretPosition, 1)
          : action === 'outdent'
            ? changeLineLevel(textarea.value, caretPosition, -1)
            : insertLineAfterCurrent(ensureStepMarker(textarea.value), caretPosition, action === 'substep');
    const markerLength = getNormalizedMarkerLengthForCell(
      focusedCell.tableId,
      focusedCell.stepId,
      focusedCell.field,
      result.value,
      result.lineIndex,
    );
    updateFlowCell(focusedCell.tableId, focusedCell.stepId, focusedCell.field, result.value, true);
    setCaretAfterRender(textarea, result.lineIndex, markerLength);
  };

  const toggleAlternativeCollapsed = (flowId: string): void => {
    setCollapsedAlternativeIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(flowId)) {
        nextIds.delete(flowId);
      } else {
        nextIds.add(flowId);
      }

      return nextIds;
    });
  };

  // -------------------------------------------------------------------------
  // Files.

  const fileBaseName = (content.description.useCaseName.trim() || artifact.name).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'caso de uso';

  const exportDocument = async (format: 'pdf' | 'docx'): Promise<void> => {
    const document = buildFlowDocument(content, artifact.name, symbolIndex);

    try {
      if (format === 'docx') {
        downloadBlob(`${fileBaseName}.docx`, createFlowDocx(document));
      } else {
        const { createFlowPdf } = await import('../utils/flowExportPdf');
        downloadBlob(`${fileBaseName}.pdf`, createFlowPdf(document));
      }
      showFeedback(format === 'pdf' ? 'PDF exportado' : 'Documento de Word exportado');
    } catch {
      showFeedback('No se pudo exportar el documento. Probá de nuevo.');
    }
  };

  const exportProjectJson = (): void => {
    downloadTextFile(`${project.name.trim() || 'proyecto'}.json`, JSON.stringify(project, null, 2), 'application/json');
    showFeedback('JSON exportado');
  };

  const importProjectJson = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];

    if (file === undefined) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));

        if (!isImportableProject(parsed)) {
          showFeedback(IMPORT_INVALID_MESSAGE);
          return;
        }

        onImportProject(normalizeDiagramProject(parsed));
        showFeedback('JSON importado');
      } catch {
        showFeedback(IMPORT_UNREADABLE_MESSAGE);
      }

      event.target.value = '';
    };
    reader.readAsText(file);
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
    const closeOnOutsideClick = (event: globalThis.MouseEvent): void => {
      if (toolbarRef.current?.contains(event.target as Node)) {
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

  useEffect(
    () => () => {
      if (feedbackTimeoutRef.current !== null) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (pendingFocus === null) {
      return;
    }

    const cellKey = getCellKey(pendingFocus.tableId, pendingFocus.stepId, pendingFocus.field);
    const textarea = cellRefs.current.get(cellKey);

    if (textarea === undefined) {
      return;
    }

    textarea.focus();
    if (pendingFocus.lineIndex !== undefined) {
      selectLine(textarea, pendingFocus.lineIndex);
      textarea.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else if (textarea.value.trim().length === 0) {
      const markerLength = getNormalizedMarkerLengthForCell(
        pendingFocus.tableId,
        pendingFocus.stepId,
        pendingFocus.field,
        '1. ',
        0,
      );
      updateFlowCell(pendingFocus.tableId, pendingFocus.stepId, pendingFocus.field, '1. ', true);
      window.requestAnimationFrame(() => textarea.setSelectionRange(markerLength, markerLength));
    } else {
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      textarea.scrollIntoView({ block: 'nearest' });
    }
    setPendingFocus(null);
  }, [content, getNormalizedMarkerLengthForCell, pendingFocus, updateFlowCell]);

  useEffect(() => {
    if (pendingNameFocus === null) {
      return;
    }

    const input = alternativeNameRefs.current.get(pendingNameFocus);
    if (input === undefined) {
      return;
    }

    input.focus();
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setPendingNameFocus(null);
  }, [content, pendingNameFocus]);

  // -------------------------------------------------------------------------
  // Rendering.

  const renderFlowCompletion = (tableId: FlowTableId, stepId: string, field: FlowTextField) => {
    if (
      completionState === null ||
      completionState.kind !== 'flow' ||
      completionState.tableId !== tableId ||
      completionState.stepId !== stepId ||
      completionState.field !== field
    ) {
      return null;
    }

    const suggestions = completionState.suggestions;
    return (
      <CompletionMenu
        activeIndex={completionState.activeIndex}
        suggestions={suggestions}
        onPick={(index) => {
          const textarea = cellRefs.current.get(getCellKey(tableId, stepId, field));
          if (textarea !== undefined) {
            applyFlowSuggestion(textarea, tableId, stepId, field, suggestions[index]);
          }
        }}
      />
    );
  };

  const renderStateCompletion = (field: StateDescriptionField) => {
    if (completionState?.kind !== 'state' || completionState.field !== field) {
      return null;
    }

    return (
      <CompletionMenu
        activeIndex={completionState.activeIndex}
        className="flow-state-completion-menu"
        suggestions={completionState.suggestions}
        onPick={(index) => {
          const textarea = stateFieldRefs.current.get(field);
          if (textarea !== undefined) {
            applyStateCompletion(textarea, field, index);
          }
        }}
      />
    );
  };

  const renderRefCompletion = (tableId: FlowTableId, stepId: string, actions: FlowTableActions) => {
    if (
      completionState === null ||
      completionState.kind !== 'ref' ||
      completionState.tableId !== tableId ||
      completionState.stepId !== stepId
    ) {
      return null;
    }

    return (
      <div className="flow-completion-menu flow-ref-completion-menu">
        {completionState.suggestions.map((suggestion, index) => (
          <button
            className={index === completionState.activeIndex ? 'active' : undefined}
            key={suggestion}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              actions.updateRow(stepId, 'ref', suggestion);
              setCompletionState(null);
            }}
          >
            <span>{suggestion}</span>
          </button>
        ))}
      </div>
    );
  };

  const renderFoldSummary = (tableId: FlowTableId, step: UseCaseFlowStep, field: FlowTextField) => {
    const value = step[field];
    if (value.trim().length === 0) {
      return <div className="flow-fold-empty" />;
    }

    const lines = parseFlowText(value);
    const first = lines.find((line) => line.body.trim().length > 0) ?? lines[0];
    const hidden = lines.length - 1;

    return (
      <button
        className="flow-fold-summary"
        ref={(element) => {
          const key = `${step.id}:${field}`;
          if (element === null) foldSummaryRefs.current.delete(key);
          else foldSummaryRefs.current.set(key, element);
        }}
        type="button"
        title="Desplegar (⌘.)"
        onClick={() => expandRow(tableId, step, field)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === '.') {
            event.preventDefault();
            expandRow(tableId, step, field);
          }
        }}
      >
        <ChevronRight aria-hidden="true" size={13} />
        <span className="flow-fold-number">{first.number !== undefined ? `${first.number}.` : ''}</span>
        <span className="flow-fold-text">{first.body.trim()}</span>
        {hidden > 0 ? <span className="flow-fold-count">{hidden} {hidden === 1 ? 'línea' : 'líneas'} más</span> : null}
      </button>
    );
  };

  const renderFlowCell = (
    tableId: FlowTableId,
    step: UseCaseFlowStep,
    field: FlowTextField,
    index: number,
    actions: FlowTableActions,
  ) => (
    <>
      <FlowRichTextarea
        className="flow-cell-editor"
        value={step[field]}
        variant="flow"
        vocabulary={vocabulary}
        placeholder={field === 'actor' ? '1. Acción del actor' : '2. Respuesta del sistema'}
        minRows={1}
        aria-label={`${field === 'actor' ? 'Actor' : 'Sistema'}, fila ${index + 1}`}
        ref={(element) => {
          const key = getCellKey(tableId, step.id, field);
          if (element === null) {
            cellRefs.current.delete(key);
          } else {
            cellRefs.current.set(key, element);
          }
        }}
        onBlur={(event) => {
          updateFlowCell(tableId, step.id, field, event.currentTarget.value, true);
          window.setTimeout(() => setCompletionState((current) => (current?.kind === 'flow' ? null : current)), 120);
        }}
        onChange={(event) => {
          actions.updateRow(step.id, field, event.target.value);
          openFlowCompletion(tableId, step.id, field, event.target.value, event.target.selectionStart);
        }}
        onClick={(event) => followReference(event, tableId)}
        onFocus={(event) => {
          setFocusedCell({ tableId, stepId: step.id, field });
          openFlowCompletion(tableId, step.id, field, event.target.value, event.target.selectionStart);
        }}
        onKeyDown={(event) => handleFlowCellKeyDown(event, tableId, step, field, index)}
        onSelect={(event) => {
          caretPositions.current.set(getCellKey(tableId, step.id, field), event.currentTarget.selectionStart);
        }}
      />
      {renderFlowCompletion(tableId, step.id, field)}
    </>
  );

  const renderFlowRows = (tableId: FlowTableId, rows: UseCaseFlowStep[], actions: FlowTableActions) => (
    <div className="flow-table-wrap">
      {focusedCell?.tableId === tableId ? (
        <div className="flow-inline-toolbar">
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFocusedCellAction(tableId, 'step')}>
            Paso
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFocusedCellAction(tableId, 'substep')}>
            Subpaso
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFocusedCellAction(tableId, 'bullet')}>
            Viñeta
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFocusedCellAction(tableId, 'outdent')}>
            Subir
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFocusedCellAction(tableId, 'indent')}>
            Bajar
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const focusedRowIndex = rows.findIndex((row) => row.id === focusedCell.stepId);
              actions.addRow(focusedRowIndex >= 0 ? focusedRowIndex : undefined, focusedCell.field);
            }}
          >
            Fila debajo
          </button>
          <span className="flow-inline-hint"><kbd>⌘↵</kbd> turno del otro lado</span>
        </div>
      ) : null}
      <table className="flow-table document-flow-table">
        <colgroup>
          <col className="flow-actor-column" />
          <col className="flow-system-column" />
          <col className="flow-ref-column" />
          <col className="flow-actions-column" />
        </colgroup>
        <thead>
          <tr>
            <th>Actor</th>
            <th>Sistema</th>
            <th title="Referencia a un camino alternativo">Ref.</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="flow-empty-cell" colSpan={4}>
                <button className="secondary-action" type="button" onClick={() => actions.addRow()}>
                  <Plus size={15} />
                  Agregar primera fila
                </button>
              </td>
            </tr>
          ) : (
            rows.map((step, index) => {
              const collapsed = collapsedRowIds.has(step.id);
              const lineCount = countLines(step.actor) + countLines(step.system);

              return (
                <tr className={`flow-editable-row${collapsed ? ' flow-row-collapsed' : ''}`} key={step.id}>
                  <td>{collapsed ? renderFoldSummary(tableId, step, 'actor') : renderFlowCell(tableId, step, 'actor', index, actions)}</td>
                  <td>{collapsed ? renderFoldSummary(tableId, step, 'system') : renderFlowCell(tableId, step, 'system', index, actions)}</td>
                  <td className="flow-ref-cell">
                    <input
                      aria-label={`Referencia, fila ${index + 1}`}
                      className="flow-ref-input"
                      value={step.ref}
                      placeholder="CA 1"
                      onBlur={() => window.setTimeout(() => setCompletionState((current) => (current?.kind === 'ref' ? null : current)), 120)}
                      onChange={(event) => {
                        actions.updateRow(step.id, 'ref', event.target.value);
                        openRefCompletion(tableId, step.id, event.target.value);
                      }}
                      onFocus={(event) => openRefCompletion(tableId, step.id, event.target.value)}
                      onKeyDown={(event) => handleRefKeyDown(event, tableId, step.id, actions)}
                    />
                    {renderRefCompletion(tableId, step.id, actions)}
                  </td>
                  <td className="flow-row-actions">
                    <div className="flow-row-action-menu">
                      <button aria-label="Agregar fila debajo" type="button" title="Agregar fila debajo" onClick={() => actions.addRow(index, 'actor')}>
                        <Plus size={13} />
                      </button>
                      <button
                        aria-label={collapsed ? 'Desplegar paso' : 'Plegar paso'}
                        disabled={!collapsed && lineCount <= 1}
                        type="button"
                        title={collapsed ? 'Desplegar (⌘.)' : 'Plegar (⌘.)'}
                        onClick={() => setRowCollapsed(step.id, !collapsed)}
                      >
                        {collapsed ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
                      </button>
                      <button aria-label="Mover fila arriba" type="button" disabled={index === 0} onClick={() => actions.moveRow(index, -1)} title="Mover arriba">
                        ↑
                      </button>
                      <button aria-label="Mover fila abajo" type="button" disabled={index === rows.length - 1} onClick={() => actions.moveRow(index, 1)} title="Mover abajo">
                        ↓
                      </button>
                      <button aria-label="Eliminar fila" type="button" onClick={() => actions.deleteRow(step.id)} title="Eliminar fila">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      {rows.length > 0 ? (
        <button className="secondary-action flow-add-row-action" type="button" onClick={() => actions.addRow()}>
          <Plus size={15} />
          Agregar fila
        </button>
      ) : null}
    </div>
  );

  const tableActions = (tableId: FlowTableId): FlowTableActions => ({
    addRow: (afterIndex, focusField) => addRowForTable(tableId, afterIndex, focusField),
    deleteRow: (stepId) => deleteRow(tableId, stepId),
    moveRow: (index, direction) => moveRow(tableId, index, direction),
    updateRow: (stepId, field, value) => updateFlowCell(tableId, stepId, field, value),
  });

  const renderStateField = (field: StateDescriptionField, label: string, placeholder: string) => (
    <div className="flow-field flow-wide-field flow-state-field">
      <label className="flow-field-label" htmlFor={`flow-${field}`}>{label}</label>
      {focusedStateField === field ? (
        <div className="flow-inline-toolbar state-inline-toolbar">
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyStateFieldAction(field, 'bullet')}>
            Viñeta
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyStateFieldAction(field, 'indent')}>
            Subnivel
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyStateFieldAction(field, 'outdent')}>
            Subir nivel
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyStateFieldAction(field, 'clear')}>
            Quitar marcador
          </button>
          <span className="flow-inline-hint">«Instancia de» sugiere clases y «con:» sus atributos</span>
        </div>
      ) : null}
      <div className="flow-state-editor">
        <FlowRichTextarea
          className="state-bullet-editor"
          id={`flow-${field}`}
          value={content.description[field]}
          variant="state"
          vocabulary={vocabulary}
          placeholder={placeholder}
          minRows={4}
          ref={(element) => {
            if (element === null) {
              stateFieldRefs.current.delete(field);
            } else {
              stateFieldRefs.current.set(field, element);
            }
          }}
          onBlur={() => window.setTimeout(() => {
            setFocusedStateField(null);
            setCompletionState((current) => (current?.kind === 'state' ? null : current));
          }, 120)}
          onChange={(event) => handleStateFieldChange(field, event.target)}
          onFocus={() => setFocusedStateField(field)}
          onKeyDown={(event) => handleStateFieldKeyDown(event, field)}
        />
        {renderStateCompletion(field)}
      </div>
    </div>
  );

  const errorCount = reviewIssues.filter((issue) => issue.kind === 'error').length;

  return (
    <main className="editor-shell flow-editor-shell">
      <header className="editor-toolbar" ref={toolbarRef}>
        <EditorIdentity artifactKind="Especificación de caso de uso" artifactType={'use-case-flow'} artifactName={artifact.name} projectName={project.name} />
        <div className="editor-toolbar-actions">
          <ToolbarHistory canRedo={canRedo} canUndo={canUndo} saveStatus={saveStatus} onRedo={onRedo} onUndo={onUndo} />
          <div className="toolbar-group">
            <button
              className="secondary-action flow-fold-action"
              type="button"
              title="Plegar los pasos de más de 10 líneas"
              aria-label="Plegar pasos largos"
              onClick={foldLongRows}
            >
              <ChevronsDownUp size={15} /> <span className="toolbar-label">Plegar</span>
            </button>
            <button
              className="secondary-action flow-fold-action"
              type="button"
              title="Desplegar todos los pasos"
              aria-label="Desplegar todos los pasos"
              disabled={collapsedRowIds.size === 0}
              onClick={() => setCollapsedRowIds(new Set())}
            >
              <ChevronsUpDown size={15} /> <span className="toolbar-label">Desplegar</span>
            </button>
            <details className="toolbar-menu flow-shortcuts-menu" onToggle={handleToolbarMenuToggle}>
              <summary aria-label="Atajos de teclado" title="Atajos de teclado"><Keyboard size={15} /> <span className="toolbar-label">Atajos</span></summary>
              <div className="toolbar-menu-content flow-shortcuts">
                <dl>
                  {SHORTCUTS.map(([keys, description]) => (
                    <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{description}</dd></div>
                  ))}
                </dl>
              </div>
            </details>
          </div>
          <div className="toolbar-group">
            <button
              aria-label={`Revisar el flujo${reviewIssues.length > 0 ? `: ${reviewIssues.length} observaciones` : ''}`}
              aria-pressed={reviewOpen}
              className={`secondary-action toolbar-review-action${errorCount > 0 ? ' has-errors' : reviewIssues.length > 0 ? ' has-warnings' : ''}`}
              type="button"
              title="Revisar referencias, bloques y clases"
              onClick={() => setReviewOpen((open) => !open)}
            >
              <ListChecks size={15} /> <span className="toolbar-label">Revisar</span>
              {reviewIssues.length > 0 ? <span className="toolbar-count">{reviewIssues.length}</span> : null}
            </button>
          </div>
          <div className="toolbar-group">
            <details className="toolbar-menu" onToggle={handleToolbarMenuToggle}>
              <summary>Archivo</summary>
              <div className="toolbar-menu-content file-menu">
                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    void exportDocument('pdf');
                  }}
                >
                  <FileText size={17} />
                  Exportar PDF
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    void exportDocument('docx');
                  }}
                >
                  <FileText size={17} />
                  Exportar Word (.docx)
                </button>
                <hr />
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
              </div>
            </details>
          </div>
        </div>
      </header>
      {feedbackMessage !== null ? <div className="editor-feedback" role="status">{feedbackMessage}</div> : null}
      <input
        className="hidden-file-input"
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={importProjectJson}
      />

      <div className={`flow-editor-body${reviewOpen ? ' review-open' : ''}`}>
        <section className="flow-document">
          <nav className="flow-section-nav" aria-label="Secciones de la especificación">
            <a href="#descripcion-general">Especificación</a>
            <a href="#camino-basico">Camino básico <span>{basicStepCount}</span></a>
            <a href="#caminos-alternativos">Caminos alternativos <span>{content.alternativeFlows.length}</span></a>
          </nav>

          <section className="flow-card flow-sheet" id="descripcion-general">
            <div className="flow-sheet-title">
              <input
                aria-label="Nombre del caso de uso"
                className="flow-title-input"
                value={content.description.useCaseName}
                placeholder={artifact.name}
                onChange={(event) => updateDescription('useCaseName', event.target.value)}
              />
            </div>
            <div className="flow-meta-row">
              <label className="flow-field flow-field-number">
                <span className="flow-field-label">Número</span>
                <input
                  inputMode="numeric"
                  value={content.description.useCaseNumber}
                  placeholder="3"
                  onChange={(event) => updateDescription('useCaseNumber', event.target.value)}
                />
              </label>
              <label className="flow-field flow-field-actor">
                <span className="flow-field-label">Actor</span>
                <input
                  value={content.description.actor}
                  placeholder="Consultor"
                  onChange={(event) => updateDescription('actor', event.target.value)}
                />
              </label>
              <div className="flow-field flow-field-priority">
                <span className="flow-field-label" id="flow-priority-label">Prioridad</span>
                <div aria-labelledby="flow-priority-label" className="flow-priority" role="radiogroup">
                  {PRIORITIES.map((priority) => (
                    <button
                      aria-checked={content.description.priority === priority}
                      className={content.description.priority === priority ? 'active' : undefined}
                      key={priority}
                      role="radio"
                      type="button"
                      onClick={() => updateDescription('priority', priority)}
                    >
                      {priority}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flow-field flow-field-diagram">
                <span className="flow-field-label">Diagrama de clases</span>
                <select
                  value={associatedClassDiagramId ?? ''}
                  onChange={(event) => updateAssociatedClassDiagram(event.target.value)}
                >
                  <option value="">
                    {classDiagramArtifacts.length === 0 ? 'Sin diagramas de clases' : 'Sin referencia'}
                  </option>
                  {classDiagramArtifacts.map((classDiagramArtifact) => (
                    <option key={classDiagramArtifact.id} value={classDiagramArtifact.id}>
                      {classDiagramArtifact.name}
                    </option>
                  ))}
                </select>
                {content.classDiagramArtifactId !== undefined && associatedClassDiagram === undefined ? (
                  <small>La referencia guardada ya no existe.</small>
                ) : null}
              </label>
            </div>
            <div className="flow-description-grid">
              <label className="flow-field flow-wide-field">
                <span className="flow-field-label">Descripción</span>
                <AutoGrowTextarea
                  value={content.description.description}
                  minRows={2}
                  placeholder="Qué logra el actor con este caso de uso y en qué condiciones."
                  onChange={(event) => updateDescription('description', event.target.value)}
                />
              </label>
              <label className="flow-field flow-wide-field">
                <span className="flow-field-label">Parámetros de entrada</span>
                <AutoGrowTextarea
                  value={content.description.inputParameters}
                  minRows={1}
                  placeholder="VcodConsultor, VnroTramite, acción (Confirmar-Rechazar)"
                  onChange={(event) => updateDescription('inputParameters', event.target.value)}
                />
              </label>
              <label className="flow-field">
                <span className="flow-field-label">Precondición</span>
                <AutoGrowTextarea
                  value={content.description.precondition}
                  minRows={2}
                  placeholder="El consultor inició sesión en el sistema."
                  onChange={(event) => updateDescription('precondition', event.target.value)}
                />
              </label>
              <label className="flow-field">
                <span className="flow-field-label">Postcondición</span>
                <AutoGrowTextarea
                  value={content.description.postcondition}
                  minRows={2}
                  placeholder="Qué queda verdadero al terminar."
                  onChange={(event) => updateDescription('postcondition', event.target.value)}
                />
              </label>
              {renderStateField('initialState', 'Estado inicial', 'Instancia de Consultor con:\n• fechaHoraBajaConsultor igual a vacío')}
              {renderStateField('finalState', 'Estado final', 'Si …\nInstancia de TramiteEstado creada con:\n• fechaDesdeTramiteEstado igual a fecha actual')}
            </div>
          </section>

          <section className="flow-card" id="camino-basico">
            <div className="flow-section-heading">
              <h4>Camino básico</h4>
            </div>
            {renderFlowRows('basic', content.basicFlow, tableActions('basic'))}
          </section>

          <section className="flow-card" id="caminos-alternativos">
            <div className="flow-section-heading">
              <h4>Caminos alternativos</h4>
              <button className="secondary-action" type="button" onClick={addAlternativeFlow}>
                <Plus size={15} />
                Agregar camino
              </button>
            </div>
            {content.alternativeFlows.length === 0 ? (
              <p className="flow-empty">
                Para abrir uno desde un paso, poné el cursor en esa línea y apretá <kbd>⌘⇧A</kbd>.
              </p>
            ) : (
              content.alternativeFlows.map((flow) => {
                const isCollapsed = collapsedAlternativeIds.has(flow.id);
                const tableId: FlowTableId = `alternative:${flow.id}`;
                const branch = findFlowBranch(content, flow.code);
                const defaultFirst = getDefaultFirstStepNumber(content, flow);
                const branchTable = branch === null
                  ? ''
                  : branch.tableCode === 'basic' ? 'del camino básico' : `de ${branch.tableCode}`;

                return (
                  <article className="alternative-flow-card" id={`camino-${flow.id}`} key={flow.id}>
                    <div className="alternative-flow-header">
                      <button
                        className="alternative-collapse-button"
                        type="button"
                        onClick={() => toggleAlternativeCollapsed(flow.id)}
                        aria-expanded={!isCollapsed}
                        aria-label={isCollapsed ? `Expandir ${flow.code}` : `Colapsar ${flow.code}`}
                      >
                        {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      </button>
                      <strong className="alternative-code">{flow.code}</strong>
                      <input
                        aria-label={`Nombre de ${flow.code}`}
                        className="alternative-name-input"
                        ref={(element) => {
                          if (element === null) alternativeNameRefs.current.delete(flow.id);
                          else alternativeNameRefs.current.set(flow.id, element);
                        }}
                        value={flow.name}
                        placeholder="Datos inconsistentes"
                        onChange={(event) => updateAlternativeFlow(flow.id, { name: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && flow.steps[0] !== undefined) {
                            event.preventDefault();
                            setCollapsedAlternativeIds((current) => {
                              const next = new Set(current);
                              next.delete(flow.id);
                              return next;
                            });
                            setPendingFocus({ tableId, stepId: flow.steps[0].id, field: 'system' });
                          }
                        }}
                      />
                      {branch !== null && branch.number !== undefined ? (
                        <button
                          className="alternative-branch"
                          type="button"
                          title="Ir al paso desde el que se toma este camino"
                          onClick={() => revealCell({
                            tableId: branch.tableCode === 'basic'
                              ? 'basic'
                              : `alternative:${content.alternativeFlows.find((candidate) => normalizeFlowCode(candidate.code) === branch.tableCode)?.id ?? ''}`,
                            stepId: branch.stepId,
                            field: branch.field,
                            lineIndex: branch.lineIndex,
                          })}
                        >
                          desde paso {branch.number} {branchTable}
                        </button>
                      ) : (
                        <span className="alternative-branch alternative-branch-missing">sin paso de origen</span>
                      )}
                      <label className="alternative-first-step" title="Número con el que empieza este camino">
                        <span>empieza en</span>
                        <input
                          inputMode="numeric"
                          min={1}
                          type="number"
                          value={flow.firstStepNumber ?? ''}
                          placeholder={String(defaultFirst)}
                          onChange={(event) => {
                            const parsed = Number.parseInt(event.target.value, 10);
                            updateAlternativeFlow(
                              flow.id,
                              { firstStepNumber: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined },
                              true,
                            );
                          }}
                        />
                      </label>
                      <button
                        aria-label={`Eliminar ${flow.code}`}
                        className="alternative-delete"
                        type="button"
                        title={`Eliminar ${flow.code}`}
                        onClick={() => deleteAlternativeFlow(flow.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {!isCollapsed ? renderFlowRows(tableId, flow.steps, tableActions(tableId)) : (
                      <p className="alternative-collapsed-summary">
                        {getFirstStepNumber(content, flow)}. {flattenFlowRows(flow.steps).find((line) => line.body.trim().length > 0)?.body.trim() ?? 'Sin pasos'}
                      </p>
                    )}
                  </article>
                );
              })
            )}
          </section>
        </section>
        {reviewOpen ? (
          <DiagramReviewPanel
            helper="Comprueba referencias a pasos y caminos, bloques SI y POR CADA, y que las clases y atributos existan en el diagrama asociado. No reemplaza la corrección del flujo."
            issues={reviewIssues}
            title="Revisión del flujo"
            onClose={() => setReviewOpen(false)}
            onFocus={focusIssue}
          />
        ) : null}
      </div>
    </main>
  );
}
