import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';
import { ChevronDown, ChevronRight, FileDown, FileUp, Plus, Redo2, Trash2, Undo2 } from 'lucide-react';
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
import { themes, type DiagramTheme, type DiagramThemeId } from '../theme/themes';
import { createId } from '../utils/id';
import { normalizeDiagramProject, normalizeUseCaseFlowContent } from '../utils/diagramNormalization';
import { buildProjectSymbolIndex } from '../utils/projectSymbolIndex';
import { normalizeFlowRowsNumbering, normalizeUseCaseFlowContentNumbering } from '../utils/useCaseFlowNumbering';
import { EditorIdentity } from './EditorIdentity';
import type { StepField, FlowTextField, CompletionSuggestion } from '../types/useCaseFlowEditor';
import { unique, matchesPrefix, buildFlowUsageIndex, buildFlowSuggestions } from '../utils/useCaseFlowCompletion';
import {
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
  canUndo: boolean;
  project: DiagramProject;
  theme: DiagramTheme;
  themeId: DiagramThemeId;
  onChangeContent: (content: UseCaseFlowContent) => void;
  onImportProject: (project: DiagramProject) => void;
  onRedo: () => void;
  onThemeChange: (themeId: DiagramThemeId) => void;
  onUndo: () => void;
};

type DescriptionField = keyof UseCaseFlowDescription;

type FlowTableId = 'basic' | `alternative:${string}`;

type StateDescriptionField = Extract<DescriptionField, 'initialState' | 'finalState'>;

type FocusTarget = {
  field: FlowTextField;
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
  steps: [createEmptyStep()],
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
      .map((flow) => /^CA\s+(\d+)$/i.exec(flow.code.trim())?.[1])
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

export function UseCaseFlowEditor({
  artifact,
  canRedo,
  canUndo,
  project,
  themeId,
  onChangeContent,
  onImportProject,
  onRedo,
  onThemeChange,
  onUndo,
}: UseCaseFlowEditorProps) {
  const content = normalizeUseCaseFlowContent(artifact.content);
  const toolbarRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);
  const cellRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const caretPositions = useRef(new Map<string, number>());
  const stateFieldRefs = useRef(new Map<StateDescriptionField, HTMLTextAreaElement>());
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [focusedCell, setFocusedCell] = useState<FocusTarget | null>(null);
  const [focusedStateField, setFocusedStateField] = useState<StateDescriptionField | null>(null);
  const [pendingFocus, setPendingFocus] = useState<FocusTarget | null>(null);
  const [collapsedAlternativeIds, setCollapsedAlternativeIds] = useState<Set<string>>(() => new Set());
  const [completionState, setCompletionState] = useState<CompletionState | null>(null);
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
  const refSuggestions = unique([
    ...content.alternativeFlows.map((flow) => flow.code).filter((code) => code.trim().length > 0),
    ...flowUsageIndex.refs,
  ]);

  const showFeedback = (message: string): void => {
    setFeedbackMessage(message);

    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current);
    }

    feedbackTimeoutRef.current = window.setTimeout(() => setFeedbackMessage(null), 1800);
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

  const handleStateFieldKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
    field: StateDescriptionField,
  ): void => {
    const textarea = event.currentTarget;

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

  const addBasicStep = (afterIndex?: number, focusField: StepField = 'actor'): void => {
    const nextStep = createEmptyStep();
    const nextFlow = [...content.basicFlow];
    nextFlow.splice(afterIndex === undefined ? nextFlow.length : afterIndex + 1, 0, nextStep);
    commitNumberedContent({ ...content, basicFlow: nextFlow });

    if (focusField === 'actor' || focusField === 'system') {
      setPendingFocus({ tableId: 'basic', stepId: nextStep.id, field: focusField });
    }
  };

  const updateBasicStep = useCallback((
    stepId: string,
    field: StepField,
    value: string,
    normalizeNumbering = false,
  ): void => {
    const nextContent = {
      ...content,
      basicFlow: content.basicFlow.map((step) => (step.id === stepId ? { ...step, [field]: value } : step)),
    };
    (normalizeNumbering ? commitNumberedContent : commitContent)(nextContent);
  }, [commitContent, commitNumberedContent, content]);

  const deleteBasicStep = (stepId: string): void => {
    commitNumberedContent({ ...content, basicFlow: content.basicFlow.filter((step) => step.id !== stepId) });
  };

  const moveBasicStep = (index: number, direction: -1 | 1): void => {
    commitNumberedContent({ ...content, basicFlow: moveItem(content.basicFlow, index, direction) });
  };

  const addAlternativeFlow = (): void => {
    const nextFlow = createAlternativeFlow(getNextAlternativeCode(content.alternativeFlows));
    commitContent({
      ...content,
      alternativeFlows: [...content.alternativeFlows, nextFlow],
    });
    setCollapsedAlternativeIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(nextFlow.id);
      return nextIds;
    });
    setPendingFocus({ tableId: `alternative:${nextFlow.id}`, stepId: nextFlow.steps[0].id, field: 'actor' });
  };

  const deleteAlternativeFlow = (flowId: string): void => {
    commitContent({
      ...content,
      alternativeFlows: content.alternativeFlows.filter((flow) => flow.id !== flowId),
    });
  };

  const updateAlternativeFlow = useCallback((
    flowId: string,
    values: Partial<Pick<AlternativeUseCaseFlow, 'code' | 'name' | 'steps'>>,
    normalizeNumbering = false,
  ): void => {
    const nextContent = {
      ...content,
      alternativeFlows: content.alternativeFlows.map((flow) =>
        flow.id === flowId ? { ...flow, ...values } : flow,
      ),
    };
    (normalizeNumbering ? commitNumberedContent : commitContent)(nextContent);
  }, [commitContent, commitNumberedContent, content]);

  const addAlternativeStep = (flowId: string, afterIndex?: number, focusField: StepField = 'actor'): void => {
    const flow = content.alternativeFlows.find((currentFlow) => currentFlow.id === flowId);

    if (flow === undefined) {
      return;
    }

    const nextStep = createEmptyStep();
    const nextSteps = [...flow.steps];
    nextSteps.splice(afterIndex === undefined ? nextSteps.length : afterIndex + 1, 0, nextStep);
    updateAlternativeFlow(flowId, { steps: nextSteps }, true);

    if (focusField === 'actor' || focusField === 'system') {
      setPendingFocus({ tableId: `alternative:${flowId}`, stepId: nextStep.id, field: focusField });
    }
  };

  const updateAlternativeStep = useCallback((
    flowId: string,
    stepId: string,
    field: StepField,
    value: string,
    normalizeNumbering = false,
  ): void => {
    const flow = content.alternativeFlows.find((currentFlow) => currentFlow.id === flowId);

    if (flow === undefined) {
      return;
    }

    updateAlternativeFlow(
      flowId,
      {
        steps: flow.steps.map((step) => (step.id === stepId ? { ...step, [field]: value } : step)),
      },
      normalizeNumbering,
    );
  }, [content.alternativeFlows, updateAlternativeFlow]);

  const deleteAlternativeStep = (flowId: string, stepId: string): void => {
    const flow = content.alternativeFlows.find((currentFlow) => currentFlow.id === flowId);

    if (flow === undefined) {
      return;
    }

    updateAlternativeFlow(flowId, { steps: flow.steps.filter((step) => step.id !== stepId) }, true);
  };

  const moveAlternativeStep = (flowId: string, index: number, direction: -1 | 1): void => {
    const flow = content.alternativeFlows.find((currentFlow) => currentFlow.id === flowId);

    if (flow === undefined) {
      return;
    }

    updateAlternativeFlow(flowId, { steps: moveItem(flow.steps, index, direction) }, true);
  };

  const updateFlowCell = useCallback((
    tableId: FlowTableId,
    stepId: string,
    field: StepField,
    value: string,
    normalizeNumbering = false,
  ): void => {
    if (tableId === 'basic') {
      updateBasicStep(stepId, field, value, normalizeNumbering);
      return;
    }

    updateAlternativeStep(tableId.replace('alternative:', ''), stepId, field, value, normalizeNumbering);
  }, [updateAlternativeStep, updateBasicStep]);

  const getFlowRows = useCallback((tableId: FlowTableId): UseCaseFlowStep[] => {
    if (tableId === 'basic') {
      return content.basicFlow;
    }

    return content.alternativeFlows.find((flow) => flow.id === tableId.replace('alternative:', ''))?.steps ?? [];
  }, [content.alternativeFlows, content.basicFlow]);

  const getNormalizedMarkerLengthForCell = useCallback((
    tableId: FlowTableId,
    stepId: string,
    field: FlowTextField,
    value: string,
    lineIndex: number,
  ): number => {
    const rows = getFlowRows(tableId);
    const normalizedRows = normalizeFlowRowsNumbering(
      rows.map((step) => (step.id === stepId ? { ...step, [field]: value } : step)),
    );
    const normalizedStep = normalizedRows.find((step) => step.id === stepId);
    const normalizedLine = normalizedStep?.[field].split('\n')[lineIndex] ?? '';
    return getMarkerLength(normalizedLine);
  }, [getFlowRows]);

  const addRowForTable = (tableId: FlowTableId, afterIndex?: number, focusField?: StepField): void => {
    if (tableId === 'basic') {
      addBasicStep(afterIndex, focusField);
      return;
    }

    addAlternativeStep(tableId.replace('alternative:', ''), afterIndex, focusField);
  };

  const openFlowCompletion = (
    tableId: FlowTableId,
    stepId: string,
    field: FlowTextField,
    value: string,
    position: number,
  ): void => {
    const suggestions = buildFlowSuggestions(field, value, position, symbolIndex, flowUsageIndex);

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

    const insertion = suggestion.apply(textarea.value, textarea.selectionStart);
    updateFlowCell(tableId, stepId, field, insertion.value);
    setCompletionState(null);
    setCaretPositionAfterRender(textarea, insertion.caretPosition);
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

    if (
      completionState?.kind === 'flow' &&
      completionState.tableId === tableId &&
      completionState.stepId === step.id &&
      completionState.field === field
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

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      addRowForTable(tableId, rowIndex, field);
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
          throw new Error('Formato inválido');
        }

        onImportProject(normalizeDiagramProject(parsed));
        showFeedback('JSON importado');
      } catch {
        window.alert('No se pudo importar el JSON. Revisá que sea un proyecto válido.');
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
    if (textarea.value.trim().length === 0) {
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
    }
    setPendingFocus(null);
  }, [content, getNormalizedMarkerLengthForCell, pendingFocus, updateFlowCell]);

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

    return (
      <div className="flow-completion-menu">
        {completionState.suggestions.map((suggestion, index) => (
          <button
            className={index === completionState.activeIndex ? 'active' : undefined}
            key={suggestion.id}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const textarea = cellRefs.current.get(getCellKey(tableId, stepId, field));
              if (textarea !== undefined) {
                const insertion = suggestion.apply(completionState.value, completionState.caretPosition);
                updateFlowCell(tableId, stepId, field, insertion.value);
                setCaretPositionAfterRender(textarea, insertion.caretPosition);
              }
              setCompletionState(null);
            }}
          >
            <span>{suggestion.label}</span>
            {suggestion.detail !== undefined ? <small>{suggestion.detail}</small> : null}
          </button>
        ))}
      </div>
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
            <th title="Referencia">Ref.</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4}>
                <button className="secondary-action" type="button" onClick={() => actions.addRow()}>
                  <Plus size={15} />
                  Agregar primera fila
                </button>
              </td>
            </tr>
          ) : (
            rows.map((step, index) => (
              <tr className="flow-editable-row" key={step.id}>
                <td>
                  <AutoGrowTextarea
                    className="flow-cell-editor"
                    value={step.actor}
                    placeholder="1. Acción del actor"
                    minRows={1}
                    inputRef={(element) => {
                      const key = getCellKey(tableId, step.id, 'actor');
                      if (element === null) {
                        cellRefs.current.delete(key);
                      } else {
                        cellRefs.current.set(key, element);
                      }
                    }}
                    onBlur={(event) => {
                      updateFlowCell(tableId, step.id, 'actor', event.currentTarget.value, true);
                      window.setTimeout(() => setCompletionState(null), 120);
                    }}
                    onChange={(event) => {
                      actions.updateRow(step.id, 'actor', event.target.value);
                      openFlowCompletion(tableId, step.id, 'actor', event.target.value, event.target.selectionStart);
                    }}
                    onFocus={(event) => {
                      setFocusedCell({ tableId, stepId: step.id, field: 'actor' });
                      openFlowCompletion(tableId, step.id, 'actor', event.target.value, event.target.selectionStart);
                    }}
                    onKeyDown={(event) => handleFlowCellKeyDown(event, tableId, step, 'actor', index)}
                    onSelect={(event) => {
                      caretPositions.current.set(getCellKey(tableId, step.id, 'actor'), event.currentTarget.selectionStart);
                      openFlowCompletion(tableId, step.id, 'actor', event.currentTarget.value, event.currentTarget.selectionStart);
                    }}
                  />
                  {renderFlowCompletion(tableId, step.id, 'actor')}
                </td>
                <td>
                  <AutoGrowTextarea
                    className="flow-cell-editor"
                    value={step.system}
                    placeholder="1. Respuesta del sistema"
                    minRows={1}
                    inputRef={(element) => {
                      const key = getCellKey(tableId, step.id, 'system');
                      if (element === null) {
                        cellRefs.current.delete(key);
                      } else {
                        cellRefs.current.set(key, element);
                      }
                    }}
                    onBlur={(event) => {
                      updateFlowCell(tableId, step.id, 'system', event.currentTarget.value, true);
                      window.setTimeout(() => setCompletionState(null), 120);
                    }}
                    onChange={(event) => {
                      actions.updateRow(step.id, 'system', event.target.value);
                      openFlowCompletion(tableId, step.id, 'system', event.target.value, event.target.selectionStart);
                    }}
                    onFocus={(event) => {
                      setFocusedCell({ tableId, stepId: step.id, field: 'system' });
                      openFlowCompletion(tableId, step.id, 'system', event.target.value, event.target.selectionStart);
                    }}
                    onKeyDown={(event) => handleFlowCellKeyDown(event, tableId, step, 'system', index)}
                    onSelect={(event) => {
                      caretPositions.current.set(getCellKey(tableId, step.id, 'system'), event.currentTarget.selectionStart);
                      openFlowCompletion(tableId, step.id, 'system', event.currentTarget.value, event.currentTarget.selectionStart);
                    }}
                  />
                  {renderFlowCompletion(tableId, step.id, 'system')}
                </td>
                <td className="flow-ref-cell">
                  <input
                    className="flow-ref-input"
                    value={step.ref}
                    placeholder="CA 1"
                    onBlur={() => window.setTimeout(() => setCompletionState(null), 120)}
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
                    <button type="button" title="Agregar fila debajo" onClick={() => actions.addRow(index, 'actor')}>
                      +
                    </button>
                    <button type="button" disabled={index === 0} onClick={() => actions.moveRow(index, -1)} title="Mover arriba">
                      ↑
                    </button>
                    <button type="button" disabled={index === rows.length - 1} onClick={() => actions.moveRow(index, 1)} title="Mover abajo">
                      ↓
                    </button>
                    <button type="button" onClick={() => actions.deleteRow(step.id)} title="Eliminar fila">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))
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

  return (
    <main className="editor-shell flow-editor-shell">
      <header className="editor-toolbar" ref={toolbarRef}>
        <EditorIdentity artifactKind="Especificación de caso de uso" artifactName={artifact.name} projectName={project.name} />
        <div className="editor-toolbar-actions">
          <button className="toolbar-icon-action" aria-label="Deshacer" title="Deshacer última acción" type="button" onClick={onUndo} disabled={!canUndo}>
            <Undo2 size={17} />
          </button>
          <button className="toolbar-icon-action" aria-label="Rehacer" title="Rehacer acción deshecha" type="button" onClick={onRedo} disabled={!canRedo}>
            <Redo2 size={17} />
          </button>
          <span className="toolbar-divider" aria-hidden="true" />
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
            </div>
          </details>
          <details className="toolbar-menu" onToggle={handleToolbarMenuToggle}>
            <summary>Tema</summary>
            <div className="toolbar-menu-content theme-menu">
              <label className="theme-selector compact-theme-selector">
                <span>Temas</span>
                <select value={themeId} onChange={(event) => onThemeChange(event.target.value as DiagramThemeId)}>
                  {themes.map((themeOption) => (
                    <option key={themeOption.id} value={themeOption.id}>
                      {themeOption.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
        </div>
      </header>
      {feedbackMessage !== null ? <div className="editor-feedback">{feedbackMessage}</div> : null}
      <input
        className="hidden-file-input"
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={importProjectJson}
      />

      <section className="flow-document">
        <div className="flow-document-header">
          <div className="flow-document-header-main">
            <div>
              <p className="eyebrow">Especificación del caso de uso</p>
              <h3>{artifact.name}</h3>
            </div>
            <label className="flow-associated-diagram-selector">
              <span>Diagrama de clases asociado</span>
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
          <nav className="flow-section-nav" aria-label="Secciones de la especificación">
            <a href="#descripcion-general">Descripción general</a>
            <a href="#camino-basico">Camino básico</a>
            <a href="#caminos-alternativos">Caminos alternativos</a>
          </nav>
        </div>

        <section className="flow-card" id="descripcion-general">
          <div className="flow-section-heading">
            <div>
              <p className="eyebrow">Descripción general</p>
              <h4>Datos del caso de uso</h4>
            </div>
          </div>
          <div className="flow-description-grid">
            <label>
              <span>Nombre del caso de uso</span>
              <input
                value={content.description.useCaseName}
                onChange={(event) => updateDescription('useCaseName', event.target.value)}
              />
            </label>
            <label>
              <span>Actor</span>
              <input
                value={content.description.actor}
                onChange={(event) => updateDescription('actor', event.target.value)}
              />
            </label>
            <label>
              <span>Prioridad</span>
              <select
                value={content.description.priority}
                onChange={(event) => updateDescription('priority', event.target.value)}
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </label>
            <label>
              <span>Parámetros de entrada</span>
              <input
                value={content.description.inputParameters}
                onChange={(event) => updateDescription('inputParameters', event.target.value)}
              />
            </label>
            <label className="flow-wide-field">
              <span>Descripción</span>
              <AutoGrowTextarea
                value={content.description.description}
                minRows={3}
                onChange={(event) => updateDescription('description', event.target.value)}
              />
            </label>
            <label className="flow-wide-field">
              <span>Precondición</span>
              <AutoGrowTextarea
                value={content.description.precondition}
                minRows={3}
                onChange={(event) => updateDescription('precondition', event.target.value)}
              />
            </label>
            <label className="flow-wide-field">
              <span>Postcondición</span>
              <AutoGrowTextarea
                value={content.description.postcondition}
                minRows={3}
                onChange={(event) => updateDescription('postcondition', event.target.value)}
              />
            </label>
            <label className="flow-wide-field flow-state-field">
              <span>Estado inicial</span>
              {focusedStateField === 'initialState' ? (
                <div className="flow-inline-toolbar state-inline-toolbar">
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyStateFieldAction('initialState', 'bullet')}>
                    Viñeta
                  </button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyStateFieldAction('initialState', 'indent')}>
                    Subnivel
                  </button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyStateFieldAction('initialState', 'outdent')}>
                    Subir nivel
                  </button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyStateFieldAction('initialState', 'clear')}>
                    Quitar marcador
                  </button>
                </div>
              ) : null}
              <AutoGrowTextarea
                className="state-bullet-editor"
                value={content.description.initialState}
                minRows={5}
                inputRef={(element) => {
                  if (element === null) {
                    stateFieldRefs.current.delete('initialState');
                  } else {
                    stateFieldRefs.current.set('initialState', element);
                  }
                }}
                onBlur={() => window.setTimeout(() => setFocusedStateField(null), 120)}
                onChange={(event) => handleStateFieldChange('initialState', event.target)}
                onFocus={() => setFocusedStateField('initialState')}
                onKeyDown={(event) => handleStateFieldKeyDown(event, 'initialState')}
              />
            </label>
            <label className="flow-wide-field flow-state-field">
              <span>Estado final</span>
              {focusedStateField === 'finalState' ? (
                <div className="flow-inline-toolbar state-inline-toolbar">
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyStateFieldAction('finalState', 'bullet')}>
                    Viñeta
                  </button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyStateFieldAction('finalState', 'indent')}>
                    Subnivel
                  </button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyStateFieldAction('finalState', 'outdent')}>
                    Subir nivel
                  </button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyStateFieldAction('finalState', 'clear')}>
                    Quitar marcador
                  </button>
                </div>
              ) : null}
              <AutoGrowTextarea
                className="state-bullet-editor"
                value={content.description.finalState}
                minRows={5}
                inputRef={(element) => {
                  if (element === null) {
                    stateFieldRefs.current.delete('finalState');
                  } else {
                    stateFieldRefs.current.set('finalState', element);
                  }
                }}
                onBlur={() => window.setTimeout(() => setFocusedStateField(null), 120)}
                onChange={(event) => handleStateFieldChange('finalState', event.target)}
                onFocus={() => setFocusedStateField('finalState')}
                onKeyDown={(event) => handleStateFieldKeyDown(event, 'finalState')}
              />
            </label>
          </div>
        </section>

        <section className="flow-card" id="camino-basico">
          <div className="flow-section-heading">
            <div>
              <p className="eyebrow">Flujo de sucesos</p>
              <h4>Camino básico</h4>
            </div>
          </div>
          {renderFlowRows('basic', content.basicFlow, {
            addRow: addBasicStep,
            deleteRow: deleteBasicStep,
            moveRow: moveBasicStep,
            updateRow: updateBasicStep,
          })}
        </section>

        <section className="flow-card" id="caminos-alternativos">
          <div className="flow-section-heading">
            <div>
              <p className="eyebrow">Caminos alternativos</p>
              <h4>Extensiones y excepciones</h4>
            </div>
            <button className="secondary-action" type="button" onClick={addAlternativeFlow}>
              <Plus size={15} />
              Agregar camino
            </button>
          </div>
          {content.alternativeFlows.length === 0 ? (
            <p className="flow-empty">Todavía no hay caminos alternativos.</p>
          ) : (
            content.alternativeFlows.map((flow) => {
              const isCollapsed = collapsedAlternativeIds.has(flow.id);

              return (
                <article className="alternative-flow-card" key={flow.id}>
                  <div className="alternative-flow-header">
                    <button
                      className="alternative-collapse-button"
                      type="button"
                      onClick={() => toggleAlternativeCollapsed(flow.id)}
                      aria-label={isCollapsed ? 'Expandir camino alternativo' : 'Colapsar camino alternativo'}
                    >
                      {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <strong className="alternative-code">{flow.code}</strong>
                    <label>
                      <span>Nombre</span>
                      <input
                        value={flow.name}
                        placeholder="Especialista inexistente"
                        onChange={(event) => updateAlternativeFlow(flow.id, { name: event.target.value })}
                      />
                    </label>
                    <button type="button" onClick={() => deleteAlternativeFlow(flow.id)}>
                      <Trash2 size={15} />
                      Eliminar
                    </button>
                  </div>
                  {!isCollapsed
                    ? renderFlowRows(`alternative:${flow.id}`, flow.steps, {
                        addRow: (afterIndex, focusField) => addAlternativeStep(flow.id, afterIndex, focusField),
                        deleteRow: (stepId) => deleteAlternativeStep(flow.id, stepId),
                        moveRow: (index, direction) => moveAlternativeStep(flow.id, index, direction),
                        updateRow: (stepId, field, value) => updateAlternativeStep(flow.id, stepId, field, value),
                      })
                    : null}
                </article>
              );
            })
          )}
        </section>
      </section>
    </main>
  );
}
