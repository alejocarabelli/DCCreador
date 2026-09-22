import type { UseCaseFlowStep } from './diagram';

export type StepField = keyof Omit<UseCaseFlowStep, 'id'>;

export type FlowTextField = Extract<StepField, 'actor' | 'system'>;

export type TextInsertion = {
  caretPosition: number;
  value: string;
};

export type CompletionSuggestion = {
  detail?: string;
  id: string;
  label: string;
  /** Multi-line snippets renumber the cell once inserted. */
  normalizeNumbering?: boolean;
  apply: (value: string, position: number) => TextInsertion;
};

export type FlowUsageIndex = {
  classes: string[];
  refs: string[];
  variables: string[];
};
