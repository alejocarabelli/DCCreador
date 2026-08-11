import type { UseCaseFlowContent, UseCaseFlowStep } from '../types/diagram';

const numberedLinePattern = /^(\s*)(\d+(?:\.\d+)*)\.\s?(.*)$/;
const stepIndent = '    ';

const getStepLevel = (value: string): number => value.split('.').length;

const formatNumberedLine = (number: string, text = ''): string =>
  `${stepIndent.repeat(Math.max(0, getStepLevel(number) - 1))}${number}. ${text}`;

const getNextGlobalStepNumber = (counters: number[], level: number): string => {
  const normalizedLevel = Math.max(1, level);

  if (normalizedLevel === 1) {
    counters[0] = (counters[0] ?? 0) + 1;
    counters.length = 1;
    return String(counters[0]);
  }

  if (counters[0] === undefined) {
    counters[0] = 1;
  }

  for (let index = 1; index < normalizedLevel - 1; index += 1) {
    if (counters[index] === undefined) {
      counters[index] = 1;
    }
  }

  counters[normalizedLevel - 1] = (counters[normalizedLevel - 1] ?? 0) + 1;
  counters.length = normalizedLevel;
  return counters.join('.');
};

const normalizeFlowTextNumbering = (value: string, counters: number[]): string =>
  value
    .split('\n')
    .map((line) => {
      const match = numberedLinePattern.exec(line);

      if (match === null) {
        return line;
      }

      const nextNumber = getNextGlobalStepNumber(counters, getStepLevel(match[2]));
      return formatNumberedLine(nextNumber, match[3]);
    })
    .join('\n');

export const normalizeFlowRowsNumbering = (rows: UseCaseFlowStep[]): UseCaseFlowStep[] => {
  const counters: number[] = [];

  return rows.map((step) => ({
    ...step,
    actor: normalizeFlowTextNumbering(step.actor, counters),
    system: normalizeFlowTextNumbering(step.system, counters),
  }));
};

export const normalizeUseCaseFlowContentNumbering = (content: UseCaseFlowContent): UseCaseFlowContent => ({
  ...content,
  basicFlow: normalizeFlowRowsNumbering(content.basicFlow),
  alternativeFlows: content.alternativeFlows.map((flow) => ({
    ...flow,
    steps: normalizeFlowRowsNumbering(flow.steps),
  })),
});
