import type { UseCaseFlowContent } from '../types/diagram';
import type { ProjectSymbolClass, ProjectSymbolIndex } from './projectSymbolIndex';
import type { FlowTextField, TextInsertion, CompletionSuggestion, FlowUsageIndex } from '../types/useCaseFlowEditor';
import { numberedLinePattern, bulletLinePattern, stepIndent, getLineInfo } from './useCaseFlowText';

const actorPrimitives = ['Iniciar CU', 'Ingresar', 'Seleccionar', 'Confirmar', 'Elegir'];

const systemPrimitives = [
  'Mostrar',
  'Mostrar mensaje',
  'Controlar',
  'Buscar',
  'Leer',
  'POR CADA',
  'SI',
  'SINO',
  'FIN SI',
  'Comprobar',
  'Crear',
  'Modificar',
  'Seleccionar instancia',
  'Calcular',
  'Guardar cambios',
  'Guardar',
  'Fin CU',
  'Invocar servicio',
  'Establecer conexión con',
  'Retornar a paso',
  'Ir a paso',
  'Ir a CU',
  'Definir pseudoentidad',
];

const identifier = '[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][\\wÁÉÍÓÚÜÑáéíóúüñ]*';

const normalizeSearch = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const unique = <Value extends string>(values: Value[]): Value[] => Array.from(new Set(values));

export const matchesPrefix = (value: string, query: string): boolean =>
  normalizeSearch(value).startsWith(normalizeSearch(query));

/** Steps of the flow tables, used to suggest `(paso N)` and returns. */
export type FlowCompletionTable = {
  code: 'basic' | string;
  /** `del camino básico`, `de CA 4`. */
  qualifier: string;
  steps: Array<{ number: string; text: string }>;
};

export type FlowCompletionContext = {
  /** Every table of the flow, the current one included. */
  tables: FlowCompletionTable[];
  /** Code of the table being edited. */
  currentTable: 'basic' | string;
  /** Text of the current table before this cell, to find what was read, searched or defined. */
  precedingText: string;
  pseudoEntities: Array<{ fields: string[]; name: string }>;
};

const getLineBeforeCaret = (value: string, position: number): { line: string; lineIndex: number; lineStart: number } => {
  const info = getLineInfo(value, position);
  return {
    line: value.slice(info.lineStart, position),
    lineIndex: info.lineIndex,
    lineStart: info.lineStart,
  };
};

const stripFlowMarker = (line: string): { body: string; marker: string } => {
  const numberedMatch = numberedLinePattern.exec(line);

  if (numberedMatch !== null) {
    return { body: numberedMatch[3], marker: `${numberedMatch[1]}${numberedMatch[2]}. ` };
  }

  const bulletMatch = bulletLinePattern.exec(line);

  if (bulletMatch !== null) {
    return { body: bulletMatch[2], marker: `${bulletMatch[1]}- ` };
  }

  const indentation = /^(\s*)/.exec(line)?.[1] ?? '';
  return { body: line.slice(indentation.length), marker: indentation };
};

const getReplacementRange = (position: number, query: string): { end: number; start: number } => ({
  end: position,
  start: Math.max(0, position - query.length),
});

const replaceRange = (value: string, start: number, end: number, insertText: string): TextInsertion => ({
  value: `${value.slice(0, start)}${insertText}${value.slice(end)}`,
  caretPosition: start + insertText.length,
});

const getLastToken = (body: string): string => body.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][\wÁÉÍÓÚÜÑáéíóúüñ]*$/)?.[0] ?? body.trim();

const createReplaceSuggestion = (
  id: string,
  label: string,
  query: string,
  insertText: string,
  detail?: string,
): CompletionSuggestion => ({
  id,
  label,
  detail,
  apply: (value, position) => {
    const range = getReplacementRange(position, query);
    return replaceRange(value, range.start, range.end, insertText);
  },
});

/**
 * Replaces `query` with `insertText` and puts the caret at the `|` marker in it
 * (the end when there is none). Lets snippets leave the caret inside `SI [ | ]`.
 */
const createSnippetSuggestion = (
  id: string,
  label: string,
  query: string,
  insertText: string,
  detail: string,
): CompletionSuggestion => ({
  id,
  label,
  detail,
  normalizeNumbering: true,
  apply: (value, position) => {
    const caretIndex = insertText.indexOf('|');
    const text = caretIndex < 0 ? insertText : insertText.replace('|', '');
    const range = getReplacementRange(position, query);
    const result = replaceRange(value, range.start, range.end, text);
    return caretIndex < 0 ? result : { ...result, caretPosition: range.start + caretIndex };
  },
});

const findClass = (symbolIndex: ProjectSymbolIndex, className: string): ProjectSymbolClass | undefined =>
  symbolIndex.classes.find((symbolClass) => normalizeSearch(symbolClass.name) === normalizeSearch(className));

const conditionContextPattern = new RegExp(
  `(?:Buscar|Crear|Modificar)\\s+(?:instancias?\\s+)?(?:de\\s+)?(${identifier})\\b[^\\n]*?(?:con|creada\\s+con|modificada\\s+con)?:\\s*$`,
  'i',
);

const getPreviousSearchClass = (
  lines: string[],
  lineIndex: number,
  symbolIndex: ProjectSymbolIndex,
): ProjectSymbolClass | undefined => {
  for (let currentIndex = lineIndex - 1; currentIndex >= 0; currentIndex -= 1) {
    const line = lines[currentIndex];

    if (bulletLinePattern.test(line)) {
      continue;
    }

    const match = conditionContextPattern.exec(line);
    return match === null ? undefined : findClass(symbolIndex, match[1]);
  }

  return undefined;
};

/** The DTO being filled on the bullets under `Crear instancia de DTOX con:`. */
const getPreviousCreatedEntity = (
  lines: string[],
  lineIndex: number,
  context: FlowCompletionContext | undefined,
): { fields: string[]; name: string } | undefined => {
  for (let currentIndex = lineIndex - 1; currentIndex >= 0; currentIndex -= 1) {
    const line = lines[currentIndex];

    if (bulletLinePattern.test(line)) {
      continue;
    }

    const match = new RegExp(`(?:Crear|Modificar)\\s+instancias?\\s+(?:de\\s+)?(${identifier})`, 'i').exec(line);
    return match === null ? undefined : context?.pseudoEntities.find((entity) => entity.name === match[1]);
  }

  return undefined;
};

export const buildFlowUsageIndex = (content: UseCaseFlowContent): FlowUsageIndex => {
  const allSteps = [...content.basicFlow, ...content.alternativeFlows.flatMap((flow) => flow.steps)];
  const allText = allSteps.map((step) => `${step.actor}\n${step.system}`).join('\n');
  const classes = unique(
    Array.from(allText.matchAll(/\b(?:Buscar|Crear|Modificar|Leer)\s+instancias?\s+(?:de\s+)?([A-ZÁÉÍÓÚÜÑ][\wÁÉÍÓÚÜÑáéíóúüñ]*)/g)).map(
      (match) => match[1],
    ),
  );
  const variables = unique(Array.from(allText.matchAll(/\bv[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_]\w*/g)).map((match) => match[0]));
  const refs = unique(allSteps.map((step) => step.ref.trim()).filter((ref) => ref.length > 0));

  return { classes, refs, variables };
};

const buildClassConditionSuggestions = (
  value: string,
  position: number,
  symbolClass: ProjectSymbolClass,
): CompletionSuggestion[] => {
  const { line, lineStart } = getLineBeforeCaret(value, position);
  const { body } = stripFlowMarker(line);
  const valueMatch = new RegExp(`(${identifier})\\s*(?:=|igual\\s+a)\\s*("?[\\wÁÉÍÓÚÜÑáéíóúüñ]*)?$`, 'i').exec(body);

  if (valueMatch !== null) {
    const attribute = symbolClass.attributes.find(
      (currentAttribute) => normalizeSearch(currentAttribute.name) === normalizeSearch(valueMatch[1]),
    );

    if (attribute !== undefined && symbolClass.parametricValues.length > 0) {
      const query = valueMatch[2] ?? '';
      return symbolClass.parametricValues
        .filter((valueOption) => query.length === 0 || matchesPrefix(valueOption, query.replace(/^"/, '')))
        .slice(0, 7)
        .map((valueOption) => ({
          id: `value:${symbolClass.name}:${attribute.name}:${valueOption}`,
          label: `"${valueOption}"`,
          detail: 'valor paramétrico',
          apply: (currentValue, currentPosition) => {
            const start = Math.max(lineStart, currentPosition - query.length);
            return replaceRange(currentValue, start, currentPosition, `"${valueOption}"`);
          },
        }));
    }

    return [];
  }

  if (/\s\S+\s+$/.test(body) || /\s(?:igual|distint|menor|mayor)/i.test(body)) {
    return [];
  }

  const query = getLastToken(body);

  return symbolClass.attributes
    .filter((attribute) => query.length === 0 || matchesPrefix(attribute.name, query))
    .slice(0, 9)
    .map((attribute) => {
      const insertText = /^fechaHora(Baja|Fin)/i.test(attribute.name)
        ? `${attribute.name} igual a null`
        : `${attribute.name} igual a `;

      return createReplaceSuggestion(
        `attribute:${symbolClass.name}:${attribute.name}`,
        attribute.name,
        query,
        insertText,
        attribute.type.length > 0 ? attribute.type : 'atributo',
      );
    });
};

/** Values read earlier (`Leer de instancia X (paso 3.3):` + bullets), with their step. */
const findReadValues = (text: string): Array<{ name: string; step?: string }> => {
  const values: Array<{ name: string; step?: string }> = [];
  let currentStep: string | undefined;
  let readingStep: string | undefined;
  let readingIndent = -1;

  text.split('\n').forEach((line) => {
    const numbered = numberedLinePattern.exec(line);
    const bullet = bulletLinePattern.exec(line);

    if (numbered !== null) {
      currentStep = numbered[2];
      readingStep = /^Leer\b/i.test(numbered[3].trim()) ? currentStep : undefined;
      readingIndent = numbered[1].length;
      const inline = /^Leer\b[^:]*?\b(?:el|la|los|las)\s+(\w+)\s*$/i.exec(numbered[3].trim());
      if (inline !== null) {
        values.push({ name: inline[1], step: currentStep });
      }
      return;
    }

    if (bullet !== null && readingStep !== undefined && bullet[1].length > readingIndent) {
      const name = new RegExp(`^(${identifier})\\s*$`).exec(bullet[2].trim())?.[1];
      if (name !== undefined) {
        values.push({ name, step: readingStep });
      }
    }
  });

  return values;
};

/** Longest common run of letters, so `codigoConsultor` finds `codConsultor`. */
const similarity = (left: string, right: string): number => {
  const a = normalizeSearch(left);
  const b = normalizeSearch(right);
  let best = 0;
  for (let start = 0; start < a.length; start += 1) {
    for (let end = start + best + 1; end <= a.length; end += 1) {
      if (!b.includes(a.slice(start, end))) break;
      best = end - start;
    }
  }
  return best;
};

const buildValueSuggestions = (
  body: string,
  context: FlowCompletionContext | undefined,
  currentValue: string,
  lineIndex: number,
): CompletionSuggestion[] => {
  const match = new RegExp(`^(${identifier})\\s+igual\\s+a\\s+(${identifier})?$`, 'i').exec(body.trim());

  if (match === null || context === undefined) {
    return [];
  }

  const field = match[1];
  const query = match[2] ?? '';
  const before = `${context.precedingText}\n${currentValue.split('\n').slice(0, lineIndex).join('\n')}`;
  const seen = new Set<string>();

  return findReadValues(before)
    .reverse()
    .filter((candidate) => {
      const key = `${candidate.name}:${candidate.step ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return query.length === 0 || matchesPrefix(candidate.name, query);
    })
    .sort((left, right) => similarity(right.name, field) - similarity(left.name, field))
    .slice(0, 6)
    .map((candidate) => {
      const insert = candidate.step === undefined ? candidate.name : `${candidate.name} (paso ${candidate.step})`;
      return createReplaceSuggestion(`value:${insert}`, insert, query, insert, 'valor leído');
    });
};

const buildStepReferenceSuggestions = (
  body: string,
  context: FlowCompletionContext | undefined,
  currentValue: string,
  lineIndex: number,
): CompletionSuggestion[] => {
  if (context === undefined) {
    return [];
  }

  // `(paso 3.` → steps of this table written before the caret.
  const inline = /\(pasos?\s+(\d+(?:\.\d+)*\.?)?$/i.exec(body);
  if (inline !== null) {
    const query = inline[1] ?? '';
    const before = `${context.precedingText}\n${currentValue.split('\n').slice(0, lineIndex).join('\n')}`;
    const steps = before
      .split('\n')
      .map((line) => numberedLinePattern.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => ({ number: match[2], text: match[3].trim() }))
      .filter((step) => query.length === 0 || step.number.startsWith(query))
      .reverse()
      .slice(0, 8);

    return steps.map((step) =>
      createReplaceSuggestion(`step-ref:${step.number}`, `${step.number}`, query, `${step.number})`, step.text.slice(0, 60)),
    );
  }

  // `Retornar a paso ` / `Ir a paso ` → main steps of every table, qualified.
  const returning = /\b(?:Retornar|Volver|Ir)\s+a(?:l)?\s+paso\s+(\d*)$/i.exec(body);
  if (returning !== null) {
    const query = returning[1] ?? '';
    return context.tables
      .flatMap((table) =>
        table.steps
          .filter((step) => !step.number.includes('.'))
          .filter((step) => query.length === 0 || step.number.startsWith(query))
          .map((step) => ({ step, table })),
      )
      .sort((left, right) => Number(left.table.code !== 'basic') - Number(right.table.code !== 'basic'))
      .slice(0, 12)
      .map(({ step, table }) => {
        const insert = table.code === context.currentTable ? step.number : `${step.number} ${table.qualifier}`;
        return createReplaceSuggestion(
          `return:${table.code}:${step.number}`,
          `${step.number} ${table.qualifier}`,
          query,
          insert,
          step.text.slice(0, 60),
        );
      });
  }

  return [];
};

const buildBlockSnippets = (query: string, line: string): CompletionSuggestion[] => {
  const numbered = numberedLinePattern.exec(line);

  if (numbered === null || query.length === 0) {
    return [];
  }

  const indent = numbered[1];
  const number = numbered[2];
  const parts = number.split('.').map(Number);
  const sibling = (offset: number): string => [...parts.slice(0, -1), parts[parts.length - 1] + offset].join('.');
  const childIndent = `${indent}${stepIndent}`;
  const suggestions: CompletionSuggestion[] = [];

  if (matchesPrefix('SI', query)) {
    suggestions.push(
      createSnippetSuggestion('snippet:si', 'SI [ … ]', query, `SI [ | ]\n${childIndent}${number}.1. `, 'condición con pasos'),
      createSnippetSuggestion(
        'snippet:si-sino',
        'SI … SINO … FIN SI',
        query,
        `SI [ | ]\n${childIndent}${number}.1. \n${indent}${sibling(1)}. SINO\n${childIndent}${sibling(1)}.1. \n${indent}${sibling(2)}. FIN SI`,
        'condición con alternativa',
      ),
    );
  }

  return suggestions;
};

export const buildFlowSuggestions = (
  field: FlowTextField,
  value: string,
  position: number,
  symbolIndex: ProjectSymbolIndex,
  flowUsageIndex: FlowUsageIndex,
  context?: FlowCompletionContext,
): CompletionSuggestion[] => {
  const { line, lineIndex } = getLineBeforeCaret(value, position);
  const { body } = stripFlowMarker(line);
  const query = getLastToken(body);
  const suggestions: CompletionSuggestion[] = [];

  if (field === 'actor') {
    return actorPrimitives
      .filter((primitive) => query.length > 0 && matchesPrefix(primitive, query))
      .map((primitive) => createReplaceSuggestion(`actor:${primitive}`, primitive, query, `${primitive} `, 'acción Actor'));
  }

  const references = buildStepReferenceSuggestions(body, context, value, lineIndex);
  if (references.length > 0) {
    return references;
  }

  const lines = value.split('\n');
  const isBulletLine = bulletLinePattern.test(line);

  if (isBulletLine) {
    const values = buildValueSuggestions(body, context, value, lineIndex);
    if (values.length > 0) {
      return values;
    }

    const currentSearchClass = getPreviousSearchClass(lines, lineIndex, symbolIndex);
    if (currentSearchClass !== undefined) {
      return buildClassConditionSuggestions(value, position, currentSearchClass);
    }

    const entity = getPreviousCreatedEntity(lines, lineIndex, context);
    if (entity !== undefined && !/\s/.test(body.trim())) {
      return entity.fields
        .filter((entityField) => query.length === 0 || matchesPrefix(entityField, query))
        .map((entityField) =>
          createReplaceSuggestion(`entity-field:${entity.name}:${entityField}`, entityField, query, `${entityField} igual a `, entity.name),
        );
    }
  }

  const buscarClassMatch = /Buscar\s+instancias?\s+(?:de\s+)?([A-Za-zÁÉÍÓÚÜÑáéíóúüñ_]*)$/i.exec(body);
  if (buscarClassMatch !== null) {
    const classQuery = buscarClassMatch[1] ?? '';
    return symbolIndex.classes
      .filter((symbolClass) => classQuery.length === 0 || matchesPrefix(symbolClass.name, classQuery))
      .slice(0, 8)
      .map((symbolClass) => ({
        id: `buscar-class:${symbolClass.name}`,
        label: symbolClass.name,
        detail: 'clase',
        apply: (currentValue, currentPosition) => {
          const range = getReplacementRange(currentPosition, classQuery);
          const lineIndent = /^(\s*)/.exec(line)?.[1] ?? '';
          return replaceRange(currentValue, range.start, range.end, `${symbolClass.name} con:\n${lineIndent}${stepIndent}- `);
        },
      }));
  }

  const lineIndent = /^(\s*)/.exec(line)?.[1] ?? '';

  // `Crear instancia de DTOC` → the pseudo-entity with one bullet per field.
  const createEntityMatch = new RegExp(`Crear\\s+instancias?\\s+(?:de\\s+)?(${identifier}|)$`, 'i').exec(body);
  if (createEntityMatch !== null && context !== undefined) {
    const entityQuery = createEntityMatch[1];
    suggestions.push(
      ...context.pseudoEntities
        .filter((entity) => entityQuery.length === 0 || matchesPrefix(entity.name, entityQuery))
        .slice(0, 6)
        .map((entity): CompletionSuggestion => ({
          id: `crear-entity:${entity.name}`,
          label: entity.name,
          detail: `pseudoentidad · ${entity.fields.length} campos`,
          apply: (currentValue, currentPosition) => {
            const range = getReplacementRange(currentPosition, entityQuery);
            const bulletIndent = `${lineIndent}${stepIndent}`;
            const fields = entity.fields.length > 0 ? entity.fields : [''];
            const head = `${entity.name} con:\n${bulletIndent}- ${fields[0]}${fields[0].length > 0 ? ' igual a ' : ''}`;
            const tail = fields.slice(1).map((entityField) => `\n${bulletIndent}- ${entityField} igual a `).join('');
            const inserted = replaceRange(currentValue, range.start, range.end, `${head}${tail}`);
            return { ...inserted, caretPosition: range.start + head.length };
          },
        })),
    );
  }

  const createClassSnippet = (primitive: 'Crear' | 'Modificar' | 'POR CADA'): CompletionSuggestion[] => {
    const classMatch = new RegExp(`${primitive}\\s+(?:instancias?\\s+)?(?:de\\s+)?([A-Za-zÁÉÍÓÚÜÑáéíóúüñ_]*)$`, 'i').exec(body);
    if (classMatch === null) {
      return [];
    }

    const classQuery = classMatch[1] ?? '';
    return symbolIndex.classes
      .filter((symbolClass) => classQuery.length === 0 || matchesPrefix(symbolClass.name, classQuery))
      .slice(0, 6)
      .map((symbolClass): CompletionSuggestion => {
        if (primitive === 'POR CADA') {
          // Loops over what an earlier step found: `(paso 3.2)` when there is one.
          const searched = findSearchStep(context, value, lineIndex, symbolClass.name);
          const numbered = numberedLinePattern.exec(line);
          const child = numbered === null ? '' : `\n${lineIndent}${stepIndent}${numbered[2]}.1. `;
          return createSnippetSuggestion(
            `${primitive}:${symbolClass.name}`,
            symbolClass.name,
            classQuery,
            `${symbolClass.name}${searched === undefined ? '' : ` (paso ${searched})`}${child}|`,
            'clase',
          );
        }

        return createReplaceSuggestion(
          `${primitive}:${symbolClass.name}`,
          symbolClass.name,
          classQuery,
          `${symbolClass.name} con:\n${lineIndent}${stepIndent}- `,
          'clase',
        );
      });
  };

  suggestions.push(...createClassSnippet('Crear'));
  suggestions.push(...createClassSnippet('Modificar'));
  suggestions.push(...createClassSnippet('POR CADA'));

  if (/Leer\s+$/i.test(body) || /^Leer\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_]*$/i.test(body)) {
    const leerQuery = body.replace(/^Leer\s*/i, '');
    const usedClasses = symbolIndex.classes.filter(
      (symbolClass) => flowUsageIndex.classes.length === 0 || flowUsageIndex.classes.includes(symbolClass.name),
    );
    suggestions.push(
      ...usedClasses.flatMap((symbolClass) =>
        symbolClass.attributes
          .filter((attribute) => leerQuery.length === 0 || matchesPrefix(attribute.name, leerQuery))
          .slice(0, 4)
          .map((attribute) =>
            createReplaceSuggestion(
              `leer-attribute:${symbolClass.name}:${attribute.name}`,
              attribute.name,
              leerQuery,
              attribute.name,
              `atributo de ${symbolClass.name}`,
            ),
          ),
      ),
      ...usedClasses
        .filter((symbolClass) => leerQuery.length === 0 || matchesPrefix(symbolClass.name, leerQuery))
        .slice(0, 5)
        .map((symbolClass) =>
          createReplaceSuggestion(
            `leer-class:${symbolClass.name}`,
            `instancia ${symbolClass.name} relacionada`,
            leerQuery,
            `instancia ${symbolClass.name} relacionada a instancia `,
            'clase relacionada',
          ),
        ),
    );
  }

  if (/Comprobar\s+/i.test(body) || /Calcular\s+/i.test(body)) {
    suggestions.push(
      ...flowUsageIndex.variables
        .filter((variable) => query.length === 0 || matchesPrefix(variable, query))
        .slice(0, 5)
        .map((variable) => createReplaceSuggestion(`variable:${variable}`, variable, query, variable, 'variable del flujo')),
    );
  }

  // Primitives only open a line, never mid-sentence.
  const opensLine = body.trim() === query;

  if (opensLine) {
    suggestions.push(...buildBlockSnippets(query, line));
  }

  const primitiveSuggestions = systemPrimitives
    .filter((primitive) => opensLine && query.length > 0 && matchesPrefix(primitive, query))
    .filter((primitive) => primitive !== 'SI')
    .map((primitive) => {
      if (primitive === 'Buscar') {
        return createReplaceSuggestion('primitive:buscar-instancia', 'Buscar instancia', query, 'Buscar instancia ', 'snippet');
      }

      if (primitive === 'Crear') {
        return createReplaceSuggestion('primitive:crear-instancia', 'Crear instancia de', query, 'Crear instancia de ', 'snippet');
      }

      if (primitive === 'Modificar') {
        return createReplaceSuggestion('primitive:modificar-instancia', 'Modificar instancia de', query, 'Modificar instancia de ', 'snippet');
      }

      if (primitive === 'POR CADA') {
        return createReplaceSuggestion('primitive:por-cada-instancia', 'POR CADA instancia de', query, 'POR CADA instancia de ', 'snippet');
      }

      if (primitive === 'Mostrar mensaje') {
        return createSnippetSuggestion('primitive:mostrar-mensaje', 'Mostrar mensaje: "…"', query, 'Mostrar mensaje: "|"', 'primitiva Sistema');
      }

      if (primitive === 'Definir pseudoentidad') {
        return createSnippetSuggestion('primitive:definir', 'Definir pseudoentidad DTO…(…)', query, 'Definir pseudoentidad DTO|()', 'primitiva Sistema');
      }

      if (primitive === 'Leer') {
        return createReplaceSuggestion('primitive:leer', 'Leer', query, 'Leer ', 'primitiva Sistema');
      }

      return createReplaceSuggestion(`system:${primitive}`, primitive, query, `${primitive} `, 'primitiva Sistema');
    });

  suggestions.push(...primitiveSuggestions);

  return unique(suggestions.map((suggestion) => suggestion.id))
    .map((id) => suggestions.find((suggestion) => suggestion.id === id))
    .filter((suggestion): suggestion is CompletionSuggestion => suggestion !== undefined)
    .slice(0, 10);
};

/** Number of the latest step that searched instances of `className`. */
const findSearchStep = (
  context: FlowCompletionContext | undefined,
  currentValue: string,
  lineIndex: number,
  className: string,
): string | undefined => {
  const before = `${context?.precedingText ?? ''}\n${currentValue.split('\n').slice(0, lineIndex).join('\n')}`;
  const pattern = new RegExp(`Buscar\\s+(?:instancias?\\s+)?(?:de\\s+)?${className}\\b`, 'i');
  let found: string | undefined;

  before.split('\n').forEach((line) => {
    const numbered = numberedLinePattern.exec(line);
    if (numbered !== null && pattern.test(numbered[3])) {
      found = numbered[2];
    }
  });

  return found;
};

// ---------------------------------------------------------------------------
// Initial and final state: «Instancia de X con:» and its attribute bullets.

const stateBulletPattern = /^(\s*)([•◦▪])\s?(.*)$/;
const stateBulletSymbols = ['•', '◦', '▪'];

const stateOperators = [
  'igual a ',
  'igual a vacío',
  'distinto de vacío',
  'definido',
  'definida',
  'menor a fecha actual',
  'igual a fecha actual',
  'distinto a ',
];

const getStateContextClass = (
  lines: string[],
  lineIndex: number,
  indent: number,
  symbolIndex: ProjectSymbolIndex,
): ProjectSymbolClass | undefined => {
  for (let currentIndex = lineIndex - 1; currentIndex >= 0; currentIndex -= 1) {
    const current = lines[currentIndex];
    const currentIndent = /^(\s*)/.exec(current)?.[1].length ?? 0;
    const bullet = stateBulletPattern.exec(current);

    if (bullet !== null && currentIndent >= indent) {
      continue;
    }

    const match = new RegExp(`instancias?\\s+(?:de\\s+)?(${identifier})\\b[^\\n]*:\\s*$`, 'i').exec(current);
    return match === null ? undefined : findClass(symbolIndex, match[1]);
  }

  return undefined;
};

export const buildStateSuggestions = (
  value: string,
  position: number,
  symbolIndex: ProjectSymbolIndex,
): CompletionSuggestion[] => {
  const { line, lineIndex } = getLineBeforeCaret(value, position);
  const bullet = stateBulletPattern.exec(line);
  const body = bullet?.[3] ?? line.trimStart();
  const level = bullet === null ? -1 : Math.floor(bullet[1].length / stepIndent.length);

  const classMatch = new RegExp(`instancias?\\s+(?:de\\s+)?(${identifier}|)$`, 'i').exec(body);
  if (classMatch !== null) {
    const classQuery = classMatch[1];
    const lines = value.split('\n');
    const parent = bullet === null ? undefined : getStateContextClass(lines, lineIndex, bullet[1].length, symbolIndex);
    const candidates = [...symbolIndex.classes].sort(
      (left, right) => Number(parent?.relatedClasses.includes(right.name) ?? false) - Number(parent?.relatedClasses.includes(left.name) ?? false),
    );
    const childLevel = level + 1;
    const childMarker = `${stepIndent.repeat(childLevel)}${stateBulletSymbols[Math.min(childLevel, 2)]} `;

    return candidates
      .filter((symbolClass) => classQuery.length === 0 || matchesPrefix(symbolClass.name, classQuery))
      .slice(0, 8)
      .map((symbolClass) =>
        createReplaceSuggestion(
          `state-class:${symbolClass.name}`,
          symbolClass.name,
          classQuery,
          `${symbolClass.name} con:\n${childMarker}`,
          parent?.relatedClasses.includes(symbolClass.name) ? `relacionada con ${parent.name}` : 'clase',
        ),
      );
  }

  if (bullet === null) {
    return [];
  }

  const contextClass = getStateContextClass(value.split('\n'), lineIndex, bullet[1].length, symbolIndex);
  const operatorMatch = new RegExp(`^(${identifier})\\s+([a-záéíóú ]*)$`, 'i').exec(body);

  if (operatorMatch !== null && contextClass?.attributes.some((attribute) => attribute.name === operatorMatch[1])) {
    const operatorQuery = operatorMatch[2];
    return stateOperators
      .filter((operator) => operatorQuery.length === 0 || matchesPrefix(operator, operatorQuery))
      .map((operator) => createReplaceSuggestion(`state-operator:${operator}`, operator.trim(), operatorQuery, operator, 'condición'));
  }

  if (contextClass === undefined || /\s/.test(body)) {
    return [];
  }

  const suggestions = contextClass.attributes
    .filter((attribute) => body.length === 0 || matchesPrefix(attribute.name, body))
    .slice(0, 9)
    .map((attribute) =>
      createReplaceSuggestion(`state-attribute:${attribute.name}`, attribute.name, body, `${attribute.name} `, contextClass.name),
    );

  if (body.length > 0 && matchesPrefix('Relacionada a instancia de', body)) {
    suggestions.unshift(
      createReplaceSuggestion('state-related', 'Relacionada a instancia de', body, 'Relacionada a instancia de ', 'relación'),
    );
  }

  return suggestions;
};
