import type { UseCaseFlowContent } from '../types/diagram';
import type { ProjectSymbolClass, ProjectSymbolIndex } from './projectSymbolIndex';
import type { FlowTextField, TextInsertion, CompletionSuggestion, FlowUsageIndex } from '../types/useCaseFlowEditor';
import { numberedLinePattern, bulletLinePattern, stepIndent, getLineInfo } from './useCaseFlowText';

const actorPrimitives = ['Iniciar CU', 'Ingresar', 'Seleccionar', 'Confirmar', 'Elegir'];

const systemPrimitives = [
  'Mostrar',
  'Controlar',
  'Buscar',
  'Leer',
  'Por cada',
  'Comprobar',
  'Crear',
  'Modificar',
  'Calcular',
  'Guardar Cambios',
  'Guardar',
  'Fin CU',
  'Invocar servicio',
  'Ir a paso',
  'Ir a CU',
  'Definir pseudoentidad',
];

const normalizeSearch = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const unique = <Value extends string>(values: Value[]): Value[] => Array.from(new Set(values));

export const matchesPrefix = (value: string, query: string): boolean =>
  normalizeSearch(value).startsWith(normalizeSearch(query));

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

const findClass = (symbolIndex: ProjectSymbolIndex, className: string): ProjectSymbolClass | undefined =>
  symbolIndex.classes.find((symbolClass) => normalizeSearch(symbolClass.name) === normalizeSearch(className));

const getPreviousSearchClass = (
  lines: string[],
  lineIndex: number,
  symbolIndex: ProjectSymbolIndex,
): ProjectSymbolClass | undefined => {
  for (let currentIndex = lineIndex - 1; currentIndex >= 0; currentIndex -= 1) {
    const match = /Buscar instancia\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][\wÁÉÍÓÚÜÑáéíóúüñ]*)\s+con:/i.exec(lines[currentIndex]);

    if (match !== null) {
      return findClass(symbolIndex, match[1]);
    }
  }

  return undefined;
};

export const buildFlowUsageIndex = (content: UseCaseFlowContent): FlowUsageIndex => {
  const allSteps = [...content.basicFlow, ...content.alternativeFlows.flatMap((flow) => flow.steps)];
  const allText = allSteps.map((step) => `${step.actor}\n${step.system}`).join('\n');
  const classes = unique(
    Array.from(allText.matchAll(/\b(?:Buscar|Crear|Modificar|Leer)\s+instancias?\s+([A-ZÁÉÍÓÚÜÑ][\wÁÉÍÓÚÜÑáéíóúüñ]*)/g)).map(
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
  const valueMatch = /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][\wÁÉÍÓÚÜÑáéíóúüñ]*)\s*=\s*("?[\wÁÉÍÓÚÜÑáéíóúüñ]*)?$/.exec(body);

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
  }

  const query = getLastToken(body);

  return symbolClass.attributes
    .filter((attribute) => query.length === 0 || matchesPrefix(attribute.name, query))
    .slice(0, 9)
    .map((attribute) => {
      const insertText = attribute.name.toLowerCase().includes('fechahorabaja')
        ? `${attribute.name} = null`
        : `${attribute.name} = `;

      return createReplaceSuggestion(
        `attribute:${symbolClass.name}:${attribute.name}`,
        attribute.name,
        query,
        insertText,
        attribute.type.length > 0 ? attribute.type : 'atributo',
      );
    });
};

export const buildFlowSuggestions = (
  field: FlowTextField,
  value: string,
  position: number,
  symbolIndex: ProjectSymbolIndex,
  flowUsageIndex: FlowUsageIndex,
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

  const lines = value.split('\n');
  const currentSearchClass = getPreviousSearchClass(lines, lineIndex, symbolIndex);
  const isBulletLine = bulletLinePattern.test(line);

  if (isBulletLine && currentSearchClass !== undefined) {
    return buildClassConditionSuggestions(value, position, currentSearchClass);
  }

  const buscarClassMatch = /Buscar instancia\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ_]*)$/i.exec(body);
  if (buscarClassMatch !== null) {
    const classQuery = buscarClassMatch[1] ?? '';
    const rangeQuery = classQuery;
    return symbolIndex.classes
      .filter((symbolClass) => classQuery.length === 0 || matchesPrefix(symbolClass.name, classQuery))
      .slice(0, 8)
      .map((symbolClass) => ({
        id: `buscar-class:${symbolClass.name}`,
        label: symbolClass.name,
        detail: 'clase',
        apply: (currentValue, currentPosition) => {
          const range = getReplacementRange(currentPosition, rangeQuery);
          const lineIndent = /^(\s*)/.exec(line)?.[1] ?? '';
          return replaceRange(currentValue, range.start, range.end, `${symbolClass.name} con:\n${lineIndent}${stepIndent}- `);
        },
      }));
  }

  const createClassSnippet = (primitive: 'Crear' | 'Modificar' | 'Por cada'): CompletionSuggestion[] => {
    const classMatch = new RegExp(`${primitive}\\s+(?:instancias?\\s+)?([A-Za-zÁÉÍÓÚÜÑáéíóúüñ_]*)$`, 'i').exec(body);
    if (classMatch === null) {
      return [];
    }

    const classQuery = classMatch[1] ?? '';
    return symbolIndex.classes
      .filter((symbolClass) => classQuery.length === 0 || matchesPrefix(symbolClass.name, classQuery))
      .slice(0, 6)
      .map((symbolClass) => ({
        id: `${primitive}:${symbolClass.name}`,
        label: symbolClass.name,
        detail: 'clase',
        apply: (currentValue, currentPosition) => {
          const range = getReplacementRange(currentPosition, classQuery);
          const lineIndent = /^(\s*)/.exec(line)?.[1] ?? '';
          const insertText =
            primitive === 'Por cada'
              ? `${symbolClass.name} encontrada:`
              : `${symbolClass.name} con:\n${lineIndent}${stepIndent}- `;
          return replaceRange(currentValue, range.start, range.end, insertText);
        },
      }));
  };

  suggestions.push(...createClassSnippet('Crear'));
  suggestions.push(...createClassSnippet('Modificar'));
  suggestions.push(...createClassSnippet('Por cada'));

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

  const primitiveSuggestions = systemPrimitives
    .filter((primitive) => query.length > 0 && matchesPrefix(primitive, query))
    .map((primitive) => {
      if (primitive === 'Buscar') {
        return createReplaceSuggestion('primitive:buscar-instancia', 'Buscar instancia', query, 'Buscar instancia ', 'snippet');
      }

      if (primitive === 'Crear') {
        return createReplaceSuggestion('primitive:crear-instancia', 'Crear instancia', query, 'Crear instancia ', 'snippet');
      }

      if (primitive === 'Modificar') {
        return createReplaceSuggestion('primitive:modificar-instancia', 'Modificar instancia', query, 'Modificar instancia ', 'snippet');
      }

      if (primitive === 'Por cada') {
        return createReplaceSuggestion('primitive:por-cada-instancia', 'Por cada instancia', query, 'Por cada instancia ', 'snippet');
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
