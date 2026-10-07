/**
 * Quote-aware completion for the quick message field.
 *
 * Messages to the persistence indirection look like
 *   buscar("Articulo", "codigo < 10 AND stockActual > 20"): List<Object>
 *   buscar("Reposicion", "estado = "+estado.toString()): List<Object>
 * so what can be suggested depends on where the caret is: the first quoted
 * string is a class, the second is a condition over that class's own
 * attributes, and anything outside quotes is a participant of the diagram.
 */

export type SignatureClassInfo = {
  name: string;
  attributes: Array<{ name: string; type: string }>;
  /** Association role names the condition may use, e.g. `estado`, `detalleReposicionList`. */
  roles: string[];
};

export type SignatureCompletionData = {
  classes: SignatureClassInfo[];
  instanceNames: string[];
  /** Condition values already used elsewhere in the project, by `Class|attribute`. */
  usedValues?: Record<string, string[]>;
  /** Return type of the method the message is linked to, if any. */
  returnType?: string;
};

export type SignatureCompletionKind =
  | 'class'
  | 'attribute'
  | 'operator'
  | 'value'
  | 'connector'
  | 'instance'
  | 'return-type';

export type SignatureCompletionOption = { id: string; text: string; label: string };

export type SignatureCompletion = {
  kind: SignatureCompletionKind;
  /** Range of the text the chosen option replaces. */
  start: number;
  end: number;
  options: SignatureCompletionOption[];
};

export const conditionOperators = ['=', '<>', '>=', '<=', '>', '<', 'contains'] as const;
const operatorPattern = '(?:<>|<=|>=|=|<|>|contains)';
const identifierPattern = /[\p{L}\p{N}_.]*$/u;

/** Keeps the straight quotes the signature parser expects when macOS substitutes smart ones. */
export const normalizeSignatureQuotes = (text: string): string =>
  text.replace(/[“”„]/g, '"').replace(/[‘’]/g, "'");

const rank = (candidate: string, query: string): number => {
  const lower = candidate.toLocaleLowerCase();
  const wanted = query.toLocaleLowerCase();
  if (!wanted) return 1;
  if (lower.startsWith(wanted)) return 0;
  return lower.includes(wanted) ? 1 : -1;
};

const pick = (
  candidates: SignatureCompletionOption[],
  query: string,
  limit = 6,
): SignatureCompletionOption[] => candidates
  .map((option) => ({ option, score: rank(option.text, query) }))
  .filter(({ score }) => score >= 0)
  .sort((a, b) => a.score - b.score)
  .slice(0, limit)
  .map(({ option }) => option);

type Scan = {
  /** Index of the first "(" , or -1 before it. */
  open: number;
  /** Index of the ")" that closes it before the caret, or -1. */
  close: number;
  /** Which comma-separated argument the caret is in. */
  argument: number;
  /** Where the current argument starts, after the comma or "(". */
  argumentStart: number;
  /** Index of the open quote the caret is inside of, or -1. */
  quoteStart: number;
  quoteChar: string;
  /** The text of every closed or open quoted argument seen so far, by argument index. */
  quoted: Record<number, string>;
};

const scan = (text: string, caret: number): Scan => {
  const result: Scan = { open: -1, close: -1, argument: 0, argumentStart: 0, quoteStart: -1, quoteChar: '', quoted: {} };
  let depth = 0;
  for (let index = 0; index < caret; index += 1) {
    const char = text[index];
    if (result.quoteStart !== -1) {
      if (char === result.quoteChar) {
        result.quoted[result.argument] = text.slice(result.quoteStart + 1, index);
        result.quoteStart = -1;
      }
      continue;
    }
    if (result.open === -1) {
      if (char === '(') {
        result.open = index;
        depth = 1;
        result.argumentStart = index + 1;
      }
      continue;
    }
    if (char === '"') {
      result.quoteStart = index;
      result.quoteChar = char;
    } else if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        result.close = index;
        return result;
      }
    } else if (char === ',' && depth === 1) {
      result.argument += 1;
      result.argumentStart = index + 1;
    }
  }
  if (result.quoteStart !== -1) result.quoted[result.argument] = text.slice(result.quoteStart + 1, caret);
  return result;
};

const findClass = (data: SignatureCompletionData, name: string | undefined): SignatureClassInfo | undefined => {
  const wanted = name?.trim().toLocaleLowerCase();
  return wanted ? data.classes.find((candidate) => candidate.name.trim().toLocaleLowerCase() === wanted) : undefined;
};

const completeCondition = (
  condition: string,
  base: number,
  data: SignatureCompletionData,
  searchedClass: SignatureClassInfo | undefined,
): SignatureCompletion | null => {
  // Only the clause after the last AND / OR matters.
  const connectors = [...condition.matchAll(/\s(?:AND|OR)\s/gi)];
  const clauseStart = connectors.length > 0
    ? (connectors[connectors.length - 1].index ?? 0) + connectors[connectors.length - 1][0].length
    : 0;
  const clause = condition.slice(clauseStart);
  const offset = base + clauseStart;
  const parts = clause.match(new RegExp(`^(\\s*)([\\p{L}\\p{N}_.]*)(\\s*)(${operatorPattern}?)(\\s*)([\\s\\S]*)$`, 'u'));
  if (!parts) return null;
  const [, lead, attribute, spaceAfterAttribute, operator, spaceAfterOperator, rest] = parts;
  const attributeStart = offset + lead.length;

  if (!operator && !spaceAfterAttribute && !rest) {
    if (!searchedClass) return null;
    const candidates: SignatureCompletionOption[] = [
      ...searchedClass.attributes.map((member) => ({ id: `attribute:${member.name}`, text: member.name, label: `${searchedClass.name}${member.type ? ` · ${member.type}` : ''}` })),
      ...searchedClass.roles.map((role) => ({ id: `role:${role}`, text: role, label: `Relación de ${searchedClass.name}` })),
    ];
    return { kind: 'attribute', start: attributeStart, end: attributeStart + attribute.length, options: pick(candidates, attribute) };
  }
  if (!attribute) return null;

  if (!operator) {
    // "codigo " or "codigo con": the operator comes next.
    if (!/^[=<>a-z]*$/i.test(rest)) return null;
    const start = attributeStart + attribute.length + spaceAfterAttribute.length;
    const options = conditionOperators
      .filter((candidate) => candidate.startsWith(rest.toLocaleLowerCase()))
      .map((candidate) => ({ id: `operator:${candidate}`, text: candidate, label: candidate === 'contains' ? 'contiene' : 'operador' }));
    return { kind: 'operator', start, end: start + rest.length, options };
  }

  if (!spaceAfterOperator && !rest) {
    // "codigo =": still choosing among =, <=, <> ...
    const start = attributeStart + attribute.length + spaceAfterAttribute.length;
    const options = conditionOperators
      .filter((candidate) => candidate.startsWith(operator))
      .map((candidate) => ({ id: `operator:${candidate}`, text: candidate, label: candidate === 'contains' ? 'contiene' : 'operador' }));
    return { kind: 'operator', start, end: start + operator.length, options };
  }

  const valueStart = offset + clause.length - rest.length;
  const unclosedQuote = (rest.match(/'/g) ?? []).length % 2 === 1;
  const finished = rest.match(/^([\s\S]*\S)\s+([A-Za-z]*)$/);
  if (!unclosedQuote && finished) {
    const token = finished[2];
    const options = pick(
      ['AND', 'OR'].map((text) => ({ id: `connector:${text}`, text, label: text === 'AND' ? 'y' : 'o' })),
      token,
    ).filter((option) => option.text.toLocaleLowerCase().startsWith(token.toLocaleLowerCase()));
    return { kind: 'connector', start: valueStart + rest.length - token.length, end: valueStart + rest.length, options };
  }

  const remembered = data.usedValues?.[`${searchedClass?.name.toLocaleLowerCase()}|${attribute.toLocaleLowerCase()}`] ?? [];
  const options = pick(remembered.map((value) => ({ id: `value:${value}`, text: value, label: 'Ya usado' })), rest)
    .filter((option) => option.text !== rest);
  return { kind: 'value', start: valueStart, end: valueStart + rest.length, options };
};

const isSearchMethod = (name: string): boolean => name.trim().toLocaleLowerCase() === 'buscar';

export const getSignatureCompletion = (
  text: string,
  caret: number,
  data: SignatureCompletionData,
): SignatureCompletion | null => {
  const position = Math.max(0, Math.min(caret, text.length));
  const state = scan(text, position);

  if (state.open === -1) return null;
  const methodName = text.slice(0, state.open).trim();

  if (state.close !== -1) {
    // After ")": the text following ":" is the return type.
    const afterClose = text.slice(state.close + 1, position);
    const colon = afterClose.indexOf(':');
    if (colon === -1 || !data.returnType) return null;
    const typed = afterClose.slice(colon + 1).trimStart();
    const start = position - typed.length;
    const options = pick([{ id: 'return-type', text: data.returnType, label: 'Retorno del método' }], typed)
      .filter((option) => option.text !== typed);
    return { kind: 'return-type', start, end: position, options };
  }

  if (state.quoteStart !== -1) {
    if (!isSearchMethod(methodName)) return null;
    const content = state.quoted[state.argument] ?? '';
    const contentStart = state.quoteStart + 1;
    if (state.argument === 0) {
      const options = pick(data.classes.map((candidate) => ({ id: `class:${candidate.name}`, text: candidate.name, label: 'Clase' })), content)
        .filter((option) => option.text !== content);
      return { kind: 'class', start: contentStart, end: position, options };
    }
    if (state.argument === 1) {
      return completeCondition(content, contentStart, data, findClass(data, state.quoted[0]));
    }
    return null;
  }

  // Outside quotes: participants of the diagram, the way the PDF passes them
  // (guardar(articulo1), "estado = "+estado.toString()).
  const argumentText = text.slice(state.argumentStart, position);
  const token = argumentText.match(identifierPattern)?.[0] ?? '';
  const before = argumentText.slice(0, argumentText.length - token.length).trimEnd();
  if (before !== '' && !before.endsWith('+') && !before.endsWith(',')) return null;
  if (isSearchMethod(methodName) && before === '' && token === '') return null;
  const dot = token.lastIndexOf('.');
  if (dot !== -1) {
    const owner = token.slice(0, dot);
    const member = token.slice(dot + 1);
    if (!data.instanceNames.includes(owner)) return null;
    const options = pick([{ id: `member:${owner}.toString()`, text: 'toString()', label: 'Valor como texto' }], member)
      .filter((option) => option.text !== member);
    return { kind: 'instance', start: position - member.length, end: position, options };
  }
  const options = pick(data.instanceNames.map((name) => ({ id: `instance:${name}`, text: name, label: 'Participante' })), token)
    .filter((option) => option.text !== token);
  return { kind: 'instance', start: position - token.length, end: position, options };
};

/**
 * What goes into the field when an option is accepted. Choosing a class
 * continues straight into the condition string, as the signature always does.
 */
export const applySignatureCompletion = (
  text: string,
  completion: SignatureCompletion,
  option: SignatureCompletionOption,
): { text: string; caret: number } => {
  let insert = option.text;
  let end = completion.end;
  if (completion.kind === 'class') {
    const closesAlready = text.slice(end).trimStart().startsWith('"');
    insert = closesAlready ? option.text : `${option.text}", "`;
    if (closesAlready) end = completion.end;
  } else if (completion.kind === 'attribute' || completion.kind === 'connector') {
    insert = `${option.text} `;
  } else if (completion.kind === 'operator') {
    insert = `${option.text} `;
  }
  const next = text.slice(0, completion.start) + insert + text.slice(end);
  return { text: next, caret: completion.start + insert.length };
};

/** Signature text inserted when a method is picked from the list. */
export const methodInsertText = (method: { name: string; parameters: string; returnType: string }): string => {
  const name = method.name.trim().toLocaleLowerCase();
  // Passing the class and the condition as strings is how persistence is queried.
  if (name === 'buscar') return `${method.name}("`;
  if (name === 'guardar') return `${method.name}(`;
  return `${method.name}(${method.parameters})${method.returnType ? `: ${method.returnType}` : ''}`;
};

type MessageLike = { kind: string; name?: string; arguments?: string; parameterValues?: string; operands?: Array<{ items: MessageLike[] }> };

/** Condition values written before, so `nombre = 'Creada'` can be offered again. */
export const collectUsedConditionValues = (itemLists: MessageLike[][]): Record<string, string[]> => {
  const used: Record<string, Set<string>> = {};
  const visit = (items: MessageLike[]): void => {
    for (const item of items) {
      if (item.kind === 'fragment') {
        for (const operand of item.operands ?? []) visit(operand.items);
        continue;
      }
      if (!isSearchMethod(item.name ?? '')) continue;
      const args = `${item.parameterValues ?? ''}`.trim() || `${item.arguments ?? ''}`;
      const match = args.match(/^\s*"([^"]*)"\s*,\s*"([^"]*)"/);
      if (!match) continue;
      for (const clause of match[2].split(/\s(?:AND|OR)\s/i)) {
        const parts = clause.match(new RegExp(`^\\s*([\\p{L}\\p{N}_.]+)\\s*${operatorPattern}\\s*(\\S[\\s\\S]*?)\\s*$`, 'u'));
        if (!parts) continue;
        const key = `${match[1].trim().toLocaleLowerCase()}|${parts[1].toLocaleLowerCase()}`;
        (used[key] ??= new Set()).add(parts[2]);
      }
    }
  };
  itemLists.forEach(visit);
  return Object.fromEntries(Object.entries(used).map(([key, values]) => [key, [...values]]));
};
