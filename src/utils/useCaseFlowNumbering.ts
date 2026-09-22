import type { UseCaseFlowContent, UseCaseFlowStep } from '../types/diagram';
import { getFirstStepNumber, normalizeFlowCode } from './flowDocument';

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

type NumberRemap = Map<string, string>;

const normalizeFlowTextNumbering = (value: string, counters: number[], remap: NumberRemap): string =>
  value
    .split('\n')
    .map((line) => {
      const match = numberedLinePattern.exec(line);

      if (match === null) {
        return line;
      }

      const nextNumber = getNextGlobalStepNumber(counters, getStepLevel(match[2]));
      // A new line is inserted with the number of the sibling below it, so when
      // an old number repeats the later line is the one references meant.
      remap.set(match[2], nextNumber);
      return formatNumberedLine(nextNumber, match[3]);
    })
    .join('\n');

const numberRows = (rows: UseCaseFlowStep[], firstStepNumber = 1): { remap: NumberRemap; rows: UseCaseFlowStep[] } => {
  const counters: number[] = firstStepNumber > 1 ? [firstStepNumber - 1] : [];
  const remap: NumberRemap = new Map();
  const numbered = rows.map((step) => ({
    ...step,
    actor: normalizeFlowTextNumbering(step.actor, counters, remap),
    system: normalizeFlowTextNumbering(step.system, counters, remap),
  }));
  return { remap, rows: numbered };
};

export const normalizeFlowRowsNumbering = (rows: UseCaseFlowStep[], firstStepNumber = 1): UseCaseFlowStep[] =>
  numberRows(rows, firstStepNumber).rows;

/*
 * `(paso 3.3)`, `paso 8 del camino básico`, `Retornar a paso [15] de CA 4`: the
 * target table comes from the qualifier, the current table otherwise.
 */
const stepReferencePattern =
  /(\bpasos?\s+(?:N°\s*)?\[?)(\d+(?:\.\d+)*)(\]?)(\s+(?:del?|de\s+la)\s+\[?(camino\s+b[aá]sico|C\.?\s?A\.?\s*(?:N°\s*)?\d+|camino\s+altern[oa]\s*(?:N°\s*)?\d+)\]?)?/gi;

const rewriteReferences = (
  value: string,
  ownRemap: NumberRemap,
  remapFor: (qualifier: string) => NumberRemap | undefined,
): string =>
  value.replace(stepReferencePattern, (whole, prefix: string, number: string, closing: string, suffix?: string, qualifier?: string) => {
    const remap = qualifier === undefined ? ownRemap : remapFor(qualifier);
    const next = remap?.get(number);
    return next === undefined || next === number ? whole : `${prefix}${next}${closing}${suffix ?? ''}`;
  });

const rewriteRows = (
  rows: UseCaseFlowStep[],
  ownRemap: NumberRemap,
  remapFor: (qualifier: string) => NumberRemap | undefined,
): UseCaseFlowStep[] =>
  rows.map((step) => {
    const actor = rewriteReferences(step.actor, ownRemap, remapFor);
    const system = rewriteReferences(step.system, ownRemap, remapFor);
    return actor === step.actor && system === step.system ? step : { ...step, actor, system };
  });

export const normalizeUseCaseFlowContentNumbering = (content: UseCaseFlowContent): UseCaseFlowContent => {
  const basic = numberRows(content.basicFlow);
  const withBasic = { ...content, basicFlow: basic.rows };
  const alternatives = content.alternativeFlows.map((flow) => ({
    flow,
    ...numberRows(flow.steps, getFirstStepNumber(withBasic, flow)),
  }));
  const remapByCode = new Map(alternatives.map((entry) => [normalizeFlowCode(entry.flow.code), entry.remap]));
  const remapFor = (qualifier: string): NumberRemap | undefined =>
    /b[aá]sico/i.test(qualifier) ? basic.remap : remapByCode.get(normalizeFlowCode(qualifier));

  return {
    ...content,
    basicFlow: rewriteRows(basic.rows, basic.remap, remapFor),
    alternativeFlows: alternatives.map((entry) => ({
      ...entry.flow,
      steps: rewriteRows(entry.rows, entry.remap, remapFor),
    })),
  };
};
