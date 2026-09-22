import type { AlternativeUseCaseFlow, UseCaseFlowContent, UseCaseFlowStep } from '../types/diagram';
import type { FlowTextField } from '../types/useCaseFlowEditor';
import type { ProjectSymbolIndex } from './projectSymbolIndex';
import { bulletLinePattern, numberedLinePattern, stepIndent } from './useCaseFlowText';

/*
 * The flow is written as plain text: numbered lines (`    3.1. Buscar …`),
 * `-` bullets for detail and free lines. Everything the editor shows on top of
 * that text (formatting, blocks, references, turn changes) and everything the
 * exports print is derived here, so the stored text stays the single truth.
 */

export type FlowLineKind = 'step' | 'bullet' | 'text';

export type FlowLine = {
  kind: FlowLineKind;
  /** Leading whitespace length. */
  indent: number;
  /** `3.1` for a numbered line. */
  number?: string;
  /** Number depth for a step (3.1 → 2); 0 for bullets and free text. */
  level: number;
  /** Marker as typed, with its indentation (`    3.1. `, `        - `). */
  marker: string;
  /** Text after the marker, without trailing path references. */
  body: string;
  /** Alternative paths referenced from this line with a trailing `[CA 2]`. */
  refs: string[];
  /** Trailing reference tokens as typed, including the spaces before them. */
  refSuffix: string;
};

const trailingRefPattern = /\s*\[(C\.?\s?A\.?\s*(?:N°\s*)?\d+)\]\s*$/i;

/** `CA 2`, `C.A N°2` and `ca2` name the same path. */
export const normalizeFlowCode = (code: string): string => {
  const digits = /(\d+)\s*$/.exec(code.trim())?.[1];
  return digits === undefined ? code.trim().toUpperCase() : `CA ${Number(digits)}`;
};

const splitTrailingRefs = (text: string): { body: string; refs: string[]; refSuffix: string } => {
  let body = text;
  const refs: string[] = [];

  for (let match = trailingRefPattern.exec(body); match !== null; match = trailingRefPattern.exec(body)) {
    refs.unshift(normalizeFlowCode(match[1]));
    body = body.slice(0, match.index);
  }

  return { body, refs, refSuffix: text.slice(body.length) };
};

export const parseFlowLine = (text: string): FlowLine => {
  const numbered = numberedLinePattern.exec(text);

  if (numbered !== null) {
    const { body, refs, refSuffix } = splitTrailingRefs(numbered[3]);
    return {
      kind: 'step',
      indent: numbered[1].length,
      number: numbered[2],
      level: numbered[2].split('.').length,
      marker: text.slice(0, text.length - numbered[3].length),
      body,
      refs,
      refSuffix,
    };
  }

  const bullet = bulletLinePattern.exec(text);

  if (bullet !== null) {
    const { body, refs, refSuffix } = splitTrailingRefs(bullet[2]);
    return {
      kind: 'bullet',
      indent: bullet[1].length,
      level: 0,
      marker: text.slice(0, text.length - bullet[2].length),
      body,
      refs,
      refSuffix,
    };
  }

  const indentation = /^\s*/.exec(text)?.[0] ?? '';
  const { body, refs, refSuffix } = splitTrailingRefs(text.slice(indentation.length));
  return { kind: 'text', indent: indentation.length, level: 0, marker: indentation, body, refs, refSuffix };
};

export const parseFlowText = (value: string): FlowLine[] => value.split('\n').map(parseFlowLine);

/**
 * Depth of each bullet counted from the step it details, so the first level
 * prints ●, the next ○ and the third ■ — as the handwritten documents do.
 */
export const getBulletDepths = (lines: FlowLine[]): number[] => {
  const stack: Array<{ indent: number; bullet: boolean }> = [];

  return lines.map((line) => {
    if (line.kind === 'text' && line.body.trim().length === 0) {
      return 0;
    }

    while (stack.length > 0 && stack[stack.length - 1].indent >= line.indent) {
      stack.pop();
    }

    let depth = 0;
    if (line.kind === 'bullet') {
      for (let index = stack.length - 1; index >= 0 && stack[index].bullet; index -= 1) {
        depth += 1;
      }
    }

    stack.push({ indent: line.indent, bullet: line.kind === 'bullet' });
    return depth;
  });
};

// ---------------------------------------------------------------------------
// Tables: the actor and system cells of every row read as one sequence.

export type FlowTableLine = FlowLine & {
  field: FlowTextField;
  lineIndex: number;
  rowIndex: number;
  stepId: string;
};

export const flattenFlowRows = (rows: UseCaseFlowStep[]): FlowTableLine[] =>
  rows.flatMap((row, rowIndex) =>
    (['actor', 'system'] as const).flatMap((field) =>
      row[field].length === 0
        ? []
        : parseFlowText(row[field]).map((line, lineIndex) => ({ ...line, field, lineIndex, rowIndex, stepId: row.id })),
    ),
  );

const blockOpenerPattern = /^(POR\s+CADA|SI\b|SINO\b|MIENTRAS\b|REPETIR\b)/i;

export const isBlockOpener = (body: string): boolean => blockOpenerPattern.test(body.trim());

/** Level of the step a line belongs to (its own level, or the step above a bullet). */
const getOwningStepLevel = (lines: FlowTableLine[], index: number): number => {
  for (let current = index; current >= 0; current -= 1) {
    if (lines[current].kind === 'step') {
      return lines[current].level;
    }
  }

  return 1;
};

/**
 * True when the line sits inside a POR CADA or SI block. There the other side
 * answers once per iteration or branch, so its turn keeps the block's numbering
 * (7.4.2.1 → 7.4.2.2) instead of opening the next main step.
 */
export const isInsideFlowBlock = (lines: FlowTableLine[], index: number): boolean => {
  let level = getOwningStepLevel(lines, index);

  if (level <= 1) {
    return false;
  }

  for (let current = index - 1; current >= 0 && level > 1; current -= 1) {
    const line = lines[current];

    if (line.kind !== 'step' || line.level >= level) {
      continue;
    }

    if (isBlockOpener(line.body)) {
      return true;
    }

    level = line.level;
  }

  return false;
};

/**
 * Level of the line that opens the other side's turn after `⌘↵`: the next main
 * step by default, the same level inside a block. `invert` swaps the two.
 */
export const getTurnSwitchLevel = (
  rows: UseCaseFlowStep[],
  stepId: string,
  field: FlowTextField,
  lineIndex: number,
  invert = false,
): number => {
  const lines = flattenFlowRows(rows);
  const index = lines.findIndex((line) => line.stepId === stepId && line.field === field && line.lineIndex === lineIndex);

  if (index < 0) {
    return 1;
  }

  const inside = isInsideFlowBlock(lines, index);
  const blockLevel = Math.max(2, getOwningStepLevel(lines, index));
  return inside !== invert ? blockLevel : 1;
};

/** `3.1.1. ` with the indentation of its level; numbering fixes the digits. */
export const createStepLine = (level: number, text = ''): string => {
  const safeLevel = Math.max(1, level);
  return `${stepIndent.repeat(safeLevel - 1)}${Array.from({ length: safeLevel }, () => '1').join('.')}. ${text}`;
};

// ---------------------------------------------------------------------------
// Alternative paths.

/** Where a path branches off: the first line in any table that references it. */
export const findFlowBranch = (
  content: UseCaseFlowContent,
  code: string,
): { number?: string; tableCode: 'basic' | string; stepId: string; field: FlowTextField; lineIndex: number } | null => {
  const target = normalizeFlowCode(code);
  const tables: Array<{ tableCode: string; rows: UseCaseFlowStep[] }> = [
    { tableCode: 'basic', rows: content.basicFlow },
    ...content.alternativeFlows
      .filter((flow) => normalizeFlowCode(flow.code) !== target)
      .map((flow) => ({ tableCode: normalizeFlowCode(flow.code), rows: flow.steps })),
  ];

  for (const table of tables) {
    const lines = flattenFlowRows(table.rows);
    const rowRefIndex = table.rows.findIndex((row) => row.ref.trim().length > 0 && normalizeFlowCode(row.ref) === target);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const referencesPath = line.refs.includes(target);
      const referencedByRow = rowRefIndex === line.rowIndex && index === lines.findIndex((candidate) => candidate.rowIndex === rowRefIndex);

      if (!referencesPath && !referencedByRow) {
        continue;
      }

      let number = line.number;
      for (let current = index; number === undefined && current >= 0; current -= 1) {
        number = lines[current].number;
      }

      return { number, tableCode: table.tableCode, stepId: line.stepId, field: line.field, lineIndex: line.lineIndex };
    }
  }

  return null;
};

/** A path continues the main numbering: branching at 7.4 it starts at 8. */
export const getDefaultFirstStepNumber = (content: UseCaseFlowContent, flow: AlternativeUseCaseFlow): number => {
  const branch = findFlowBranch(content, flow.code);
  const main = Number(branch?.number?.split('.')[0]);
  return Number.isFinite(main) && main > 0 ? main + 1 : 1;
};

export const getFirstStepNumber = (content: UseCaseFlowContent, flow: AlternativeUseCaseFlow): number =>
  flow.firstStepNumber ?? getDefaultFirstStepNumber(content, flow);

/** Appends ` [CA 2]` to a line once. */
export const appendLineRef = (value: string, lineIndex: number, code: string): string => {
  const lines = value.split('\n');
  const line = parseFlowLine(lines[lineIndex] ?? '');

  if (line.refs.includes(normalizeFlowCode(code))) {
    return value;
  }

  lines[lineIndex] = `${(lines[lineIndex] ?? '').trimEnd()} [${normalizeFlowCode(code)}]`;
  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// Inline tokens, shared by the live formatting and the exports.

export type FlowInlineKind = 'plain' | 'class' | 'attribute' | 'keyword' | 'stepRef' | 'pathRef' | 'literal';

export type FlowInlineToken = { kind: FlowInlineKind; text: string };

export type FlowVocabulary = { attributes: Set<string>; classes: Set<string> };

export const buildFlowVocabulary = (symbolIndex: ProjectSymbolIndex, extraClasses: string[] = []): FlowVocabulary => ({
  classes: new Set([...symbolIndex.classes.map((symbolClass) => symbolClass.name), ...extraClasses]),
  attributes: new Set(symbolIndex.classes.flatMap((symbolClass) => symbolClass.attributes.map((attribute) => attribute.name))),
});

/** Names introduced with `Definir pseudoentidad DTOX(…)`, which read as classes. */
export const findPseudoEntities = (texts: string[]): Array<{ fields: string[]; name: string }> => {
  const found = new Map<string, string[]>();

  texts.forEach((text) => {
    for (const match of text.matchAll(/Definir\s+pseudo-?entidad\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][\wÁÉÍÓÚÜÑáéíóúüñ]*)\s*\(([^)]*)\)/gi)) {
      const fields = match[2]
        .split(',')
        .map((field) => field.trim())
        .filter((field) => field.length > 0);
      found.set(match[1], fields);
    }
  });

  return Array.from(found, ([name, fields]) => ({ name, fields }));
};

const keywordPattern = /^(POR\s+CADA|FIN\s+SI|FIN\s+CU|FIN\s+CASO\s+DE\s+USO|SINO|SI|MIENTRAS|REPETIR|Retornar\s+a|Ir\s+a)\b/i;

const inlinePattern =
  /(\((?:ver\s+)?pasos?\s+[^)]*\))|(\bpasos?\s+(?:N°\s*)?\[?\d+(?:\.\d+)*\]?)|(\[C\.?\s?A\.?\s*(?:N°\s*)?\d+\])|("[^"\n]*"?|“[^”\n]*”?)|([A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][\wÁÉÍÓÚÜÑáéíóúüñ]*)/g;

export const tokenizeFlowInline = (text: string, vocabulary: FlowVocabulary, detectKeyword = true): FlowInlineToken[] => {
  const tokens: FlowInlineToken[] = [];
  const push = (kind: FlowInlineKind, value: string): void => {
    if (value.length === 0) {
      return;
    }

    const previous = tokens[tokens.length - 1];
    if (previous !== undefined && previous.kind === kind && kind === 'plain') {
      previous.text += value;
      return;
    }

    tokens.push({ kind, text: value });
  };

  let rest = text;
  if (detectKeyword) {
    const keyword = keywordPattern.exec(text);
    if (keyword !== null) {
      push('keyword', keyword[0]);
      rest = text.slice(keyword[0].length);
    }
  }

  let lastIndex = 0;
  for (const match of rest.matchAll(inlinePattern)) {
    const index = match.index ?? 0;
    push('plain', rest.slice(lastIndex, index));
    lastIndex = index + match[0].length;

    if (match[1] !== undefined || match[2] !== undefined) {
      push('stepRef', match[0]);
    } else if (match[3] !== undefined) {
      push('pathRef', match[0]);
    } else if (match[4] !== undefined) {
      push('literal', match[0]);
    } else if (vocabulary.classes.has(match[0])) {
      push('class', match[0]);
    } else if (vocabulary.attributes.has(match[0])) {
      push('attribute', match[0]);
    } else {
      push('plain', match[0]);
    }
  }

  push('plain', rest.slice(lastIndex));
  return tokens;
};

/** `Si el estado …` lines title each scenario of the initial and final states. */
export const isStateScenarioHeading = (line: string): boolean => /^\s*Si\b/i.test(line) && !/^\s*[•◦▪-]/.test(line);

// ---------------------------------------------------------------------------
// Document model, printed by the PDF and Word exports.

export type FlowDocSegment = { bold?: boolean; italic?: boolean; text: string; underline?: boolean };

export type FlowDocLine = {
  /** 0 = ●, 1 = ○, 2 = ■. */
  bullet?: number;
  bold?: boolean;
  /** Visual depth, in indentation steps. */
  depth: number;
  /** `3.1.` for a numbered line. */
  number?: string;
  refs: string[];
  segments: FlowDocSegment[];
};

export type FlowDocRow = { actor: FlowDocLine[]; ref: string; system: FlowDocLine[] };

export type FlowDocTable = { rows: FlowDocRow[]; title: string };

export type FlowDocField = { label: string; lines: FlowDocLine[] };

export type FlowDocument = {
  alternatives: FlowDocTable[];
  basic: FlowDocTable;
  fields: FlowDocField[];
  title: string;
};

const plainSegments = (text: string): FlowDocSegment[] => (text.length === 0 ? [] : [{ text }]);

const flowCellToDocLines = (value: string): FlowDocLine[] => {
  if (value.trim().length === 0) {
    return [];
  }

  const lines = parseFlowText(value);
  const bulletDepths = getBulletDepths(lines);
  let stepDepth = 0;

  return lines
    .map((line, index) => {
      if (line.kind === 'step') {
        stepDepth = line.level - 1;
        return {
          bold: line.level === 1,
          depth: stepDepth,
          number: `${line.number}.`,
          refs: line.refs,
          segments: plainSegments(line.body.trim()),
        };
      }

      if (line.kind === 'bullet') {
        return {
          bullet: Math.min(2, bulletDepths[index]),
          depth: stepDepth + 1 + bulletDepths[index],
          refs: line.refs,
          segments: plainSegments(line.body.trim()),
        };
      }

      return { depth: stepDepth + (line.indent > 0 ? 1 : 0), refs: line.refs, segments: plainSegments(line.body.trim()) };
    })
    .filter((line, index, all) => line.segments.length > 0 || line.number !== undefined || (index > 0 && index < all.length - 1));
};

const stateBulletPattern = /^(\s*)([•◦▪-])\s?(.*)$/;

const stateTextToDocLines = (value: string, vocabulary: FlowVocabulary): FlowDocLine[] => {
  if (value.trim().length === 0) {
    return [];
  }

  return value.split('\n').map((raw) => {
    const bullet = stateBulletPattern.exec(raw);
    const text = (bullet?.[3] ?? raw).trim();
    const segments: FlowDocSegment[] = tokenizeFlowInline(text, vocabulary, false).map((token) => ({
      text: token.text,
      underline: token.kind === 'class' || undefined,
      italic: token.kind === 'attribute' || undefined,
    }));

    if (bullet !== null) {
      const level = Math.floor(bullet[1].length / stepIndent.length);
      return { bullet: Math.min(2, level), depth: level + 1, refs: [], segments };
    }

    const heading = isStateScenarioHeading(raw);
    return {
      bold: heading || undefined,
      depth: 0,
      refs: [],
      segments: heading ? segments.map((segment) => ({ ...segment, bold: true })) : segments,
    };
  });
};

const toDocRows = (rows: UseCaseFlowStep[]): FlowDocRow[] =>
  rows
    .filter((row) => row.actor.trim().length > 0 || row.system.trim().length > 0)
    .map((row) => ({ actor: flowCellToDocLines(row.actor), system: flowCellToDocLines(row.system), ref: row.ref.trim() }));

export const buildFlowDocument = (
  content: UseCaseFlowContent,
  artifactName: string,
  symbolIndex: ProjectSymbolIndex,
): FlowDocument => {
  const allText = [
    ...content.basicFlow.flatMap((row) => [row.actor, row.system]),
    ...content.alternativeFlows.flatMap((flow) => flow.steps.flatMap((row) => [row.actor, row.system])),
  ];
  const vocabulary = buildFlowVocabulary(
    symbolIndex,
    findPseudoEntities(allText).map((entity) => entity.name),
  );
  const description = content.description;
  const textField = (label: string, value: string): FlowDocField => ({
    label,
    lines: value.split('\n').map((line) => ({ depth: 0, refs: [], segments: plainSegments(line) })),
  });

  return {
    title: description.useCaseName.trim() || artifactName,
    fields: [
      textField('Número', description.useCaseNumber),
      textField('Nombre Caso de Uso', description.useCaseName.trim() || artifactName),
      textField('Actor', description.actor),
      textField('Descripción', description.description),
      textField('Prioridad', description.priority),
      textField('Parámetros de entrada', description.inputParameters),
      textField('Precondición', description.precondition),
      textField('Postcondición', description.postcondition),
      { label: 'Estado Inicial', lines: stateTextToDocLines(description.initialState, vocabulary) },
      { label: 'Estado final', lines: stateTextToDocLines(description.finalState, vocabulary) },
    ],
    basic: { title: 'CAMINO BÁSICO', rows: toDocRows(content.basicFlow) },
    alternatives: content.alternativeFlows.map((flow) => {
      const number = /(\d+)\s*$/.exec(flow.code)?.[1] ?? flow.code;
      return {
        title: `CAMINO ALTERNO N° ${number}${flow.name.trim().length > 0 ? ` : ${flow.name.trim()}` : ''}`,
        rows: toDocRows(flow.steps),
      };
    }),
  };
};

/** `CA 2` → `C.A N°2`, the way the reference column is written by hand. */
export const formatPathRef = (code: string): string => {
  const digits = /(\d+)\s*$/.exec(code)?.[1];
  return digits === undefined ? code : `C.A N°${digits}`;
};

export type FlowDocRowPart = { actor: FlowDocLine[]; ref: string; system: FlowDocLine[] };

/**
 * Splits a row where a system line carries its own reference, so the Ref.
 * column prints `C.A N°2` level with line 2.2 rather than at the top of step 2.
 */
export const splitRowByRefs = (row: FlowDocRow): FlowDocRowPart[] => {
  const parts: FlowDocRowPart[] = [];
  const firstRefs = [row.ref, ...row.actor.flatMap((line) => line.refs)].filter((ref) => ref.length > 0);

  row.system.forEach((line, index) => {
    if (index === 0 || line.refs.length > 0) {
      parts.push({ actor: [], system: [], ref: line.refs.map(formatPathRef).join(' ') });
    }
    parts[parts.length - 1].system.push(line);
  });

  if (parts.length === 0) {
    parts.push({ actor: [], system: [], ref: '' });
  }

  parts[0].actor = row.actor;
  parts[0].ref = [...firstRefs.map(formatPathRef), parts[0].ref].filter((ref) => ref.length > 0).join(' ');
  return parts;
};
