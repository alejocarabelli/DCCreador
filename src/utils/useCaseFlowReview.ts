import type { UseCaseFlowContent, UseCaseFlowStep } from '../types/diagram';
import type { FlowTextField } from '../types/useCaseFlowEditor';
import {
  findPseudoEntities,
  flattenFlowRows,
  normalizeFlowCode,
  type FlowTableLine,
} from './flowDocument';
import type { ProjectSymbolIndex } from './projectSymbolIndex';

export type FlowIssueLocation =
  | { kind: 'cell'; field: FlowTextField; lineIndex: number; stepId: string; table: 'basic' | string }
  | { kind: 'state'; field: 'initialState' | 'finalState'; lineIndex: number }
  | { kind: 'alternative'; table: string };

export type FlowIssue = {
  id: string;
  kind: 'error' | 'review';
  location?: FlowIssueLocation;
  message: string;
};

const identifier = '[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][\\wÁÉÍÓÚÜÑáéíóúüñ]*';

const stepReferencePattern =
  /\bpasos?\s+(?:N°\s*)?\[?(\d+(?:\.\d+)*)\]?(?:\s+(?:del?|de\s+la)\s+\[?(camino\s+b[aá]sico|C\.?\s?A\.?\s*(?:N°\s*)?\d+|camino\s+altern[oa]\s*(?:N°\s*)?\d+)\]?)?/gi;

const classUsePattern = new RegExp(
  `\\b(?:Buscar|Crear|Modificar|Leer(?:\\s+de)?|POR\\s+CADA|Relacionada\\s+a)\\s+(?:la\\s+)?(?:instancias?\\s+)(?:de\\s+)?(${identifier})`,
  'gi',
);

const contextPattern = new RegExp(`instancias?\\s+(?:de\\s+)?(${identifier})\\b[^\\n]*?:\\s*$`, 'i');

type Table = { code: string; label: string; rows: UseCaseFlowStep[]; tableId: 'basic' | string };

const lineLabel = (lines: FlowTableLine[], index: number): string => {
  for (let current = index; current >= 0; current -= 1) {
    if (lines[current].number !== undefined) {
      return `paso ${lines[current].number}`;
    }
  }
  return 'primer paso';
};

/**
 * Checks a teacher would mark on a written flow. They read the text only; a
 * clean result does not mean the flow is correct, just that it is consistent.
 */
export const reviewUseCaseFlow = (content: UseCaseFlowContent, symbolIndex: ProjectSymbolIndex): FlowIssue[] => {
  const issues: FlowIssue[] = [];
  const tables: Table[] = [
    { code: 'basic', label: 'Camino básico', rows: content.basicFlow, tableId: 'basic' },
    ...content.alternativeFlows.map((flow) => ({
      code: normalizeFlowCode(flow.code),
      label: flow.code,
      rows: flow.steps,
      tableId: flow.id,
    })),
  ];
  const linesByTable = new Map(tables.map((table) => [table.code, flattenFlowRows(table.rows)]));
  const numbersByTable = new Map(
    tables.map((table) => [table.code, new Set((linesByTable.get(table.code) ?? []).flatMap((line) => (line.number === undefined ? [] : [line.number])))]),
  );
  const pathCodes = new Set(content.alternativeFlows.map((flow) => normalizeFlowCode(flow.code)));
  const referencedPaths = new Set<string>();
  const allText = tables.flatMap((table) => table.rows.flatMap((row) => [row.actor, row.system]));
  const pseudoEntities = new Set(findPseudoEntities(allText).map((entity) => entity.name));
  const classes = new Map(symbolIndex.classes.map((symbolClass) => [symbolClass.name, symbolClass]));
  const checkClasses = symbolIndex.classes.length > 0;
  const reportedClasses = new Set<string>();

  const checkClassName = (name: string, location: FlowIssueLocation, where: string): void => {
    if (!checkClasses || classes.has(name) || pseudoEntities.has(name) || !/^[A-ZÁÉÍÓÚÜÑ]/.test(name) || reportedClasses.has(name)) {
      return;
    }
    reportedClasses.add(name);
    issues.push({
      id: `class:${name}`,
      kind: 'review',
      location,
      message: `«${name}» (${where}) no es una clase del diagrama asociado. Revisá el nombre o agregala al diagrama.`,
    });
  };

  tables.forEach((table) => {
    const lines = linesByTable.get(table.code) ?? [];

    lines.forEach((line, index) => {
      const location: FlowIssueLocation = {
        kind: 'cell',
        table: table.tableId,
        stepId: line.stepId,
        field: line.field,
        lineIndex: line.lineIndex,
      };
      const where = `${lineLabel(lines, index)} ${table.tableId === 'basic' ? 'del camino básico' : `de ${table.code}`}`;
      const body = line.body.trim();

      // Step references.
      for (const match of line.body.matchAll(stepReferencePattern)) {
        const qualifier = match[2];
        const target = qualifier === undefined
          ? table.code
          : /b[aá]sico/i.test(qualifier) ? 'basic' : normalizeFlowCode(qualifier);
        const numbers = numbersByTable.get(target);
        const targetLabel = target === 'basic' ? 'el camino básico' : target;

        if (numbers === undefined) {
          issues.push({ id: `ref-table:${line.stepId}:${line.field}:${line.lineIndex}:${match.index}`, kind: 'error', location, message: `El ${where} menciona ${targetLabel}, que no existe.` });
        } else if (!numbers.has(match[1])) {
          issues.push({
            id: `ref:${line.stepId}:${line.field}:${line.lineIndex}:${match.index}`,
            kind: 'error',
            location,
            message: `El ${where} menciona el paso ${match[1]}${target === table.code ? '' : ` de ${targetLabel}`}, que no existe.`,
          });
        }
      }

      // Path references.
      line.refs.forEach((code) => {
        referencedPaths.add(code);
        if (!pathCodes.has(code)) {
          issues.push({ id: `path:${line.stepId}:${line.lineIndex}:${code}`, kind: 'error', location, message: `El ${where} deriva a ${code}, pero ese camino alternativo no existe.` });
        }
      });

      if (line.kind === 'step') {
        const next = lines.slice(index + 1).find((candidate) => candidate.kind === 'step');
        const hasChildren = next !== undefined && next.level > line.level;

        if (/^POR\s+CADA\b/i.test(body) && !hasChildren) {
          issues.push({ id: `loop:${line.stepId}:${line.lineIndex}`, kind: 'review', location, message: `El POR CADA del ${where} no tiene pasos adentro (${line.number}.1, …).` });
        }

        if (/^SI\b/i.test(body) && !hasChildren) {
          const closes = lines.slice(index + 1).some((candidate) => candidate.kind === 'step' && candidate.level === line.level && /^FIN\s+SI\b/i.test(candidate.body.trim()));
          if (!closes) {
            issues.push({ id: `if:${line.stepId}:${line.lineIndex}`, kind: 'review', location, message: `El SI del ${where} no tiene pasos adentro ni un FIN SI que lo cierre.` });
          }
        }

        if (/^SINO\b/i.test(body)) {
          let opened = false;
          for (let current = index - 1; current >= 0; current -= 1) {
            const candidate = lines[current];
            if (candidate.kind !== 'step') continue;
            if (candidate.level < line.level) break;
            if (candidate.level === line.level && /^SI\b/i.test(candidate.body.trim())) {
              opened = true;
              break;
            }
          }
          if (!opened) {
            issues.push({ id: `else:${line.stepId}:${line.lineIndex}`, kind: 'error', location, message: `El SINO del ${where} no tiene un SI antes, al mismo nivel.` });
          }
        }
      }

      for (const match of line.body.matchAll(classUsePattern)) {
        checkClassName(match[1], location, where);
      }

      // Condition bullets: the attribute has to belong to the class above.
      if (line.kind === 'bullet' && checkClasses) {
        const attribute = new RegExp(`^(${identifier})\\s+(?:igual|distint|menor|mayor|=)`, 'i').exec(body)?.[1];
        const owner = findOwnerClass(lines, index);
        const ownerClass = owner === undefined ? undefined : classes.get(owner);
        if (attribute !== undefined && ownerClass !== undefined && !ownerClass.attributes.some((candidate) => candidate.name === attribute)) {
          issues.push({
            id: `attribute:${line.stepId}:${line.lineIndex}`,
            kind: 'review',
            location,
            message: `«${attribute}» no es un atributo de ${ownerClass.name} (${where}).`,
          });
        }
      }
    });

    if (table.tableId !== 'basic') {
      const last = [...lines].reverse().find((line) => line.body.trim().length > 0);
      if (last === undefined) {
        issues.push({ id: `empty:${table.code}`, kind: 'review', location: { kind: 'alternative', table: table.tableId }, message: `${table.code} todavía no tiene pasos.` });
      } else if (!/^(Retornar|Volver|Ir\s+a|Fin(?:alizar)?\s+(?:CU|caso)|Extender|FIN\s+CU)/i.test(last.body.trim())) {
        issues.push({
          id: `end:${table.code}`,
          kind: 'review',
          location: { kind: 'cell', table: table.tableId, stepId: last.stepId, field: last.field, lineIndex: last.lineIndex },
          message: `${table.code} no dice cómo termina: cerralo con «Retornar a paso …» o «Fin CU».`,
        });
      }
    }

    table.rows.forEach((row) => {
      if (row.ref.trim().length > 0) {
        const code = normalizeFlowCode(row.ref);
        referencedPaths.add(code);
        if (!pathCodes.has(code)) {
          issues.push({
            id: `row-ref:${row.id}`,
            kind: 'error',
            location: { kind: 'cell', table: table.tableId, stepId: row.id, field: 'system', lineIndex: 0 },
            message: `Una fila ${table.tableId === 'basic' ? 'del camino básico' : `de ${table.code}`} deriva a ${row.ref.trim()}, pero ese camino alternativo no existe.`,
          });
        }
      }
    });
  });

  content.alternativeFlows.forEach((flow) => {
    const code = normalizeFlowCode(flow.code);
    if (!referencedPaths.has(code)) {
      issues.push({ id: `orphan:${flow.id}`, kind: 'review', location: { kind: 'alternative', table: flow.id }, message: `Ningún paso deriva a ${flow.code}. Marcá desde dónde se toma con ⌘⇧A o en la columna Ref.` });
    }
    if (flow.name.trim().length === 0) {
      issues.push({ id: `unnamed:${flow.id}`, kind: 'review', location: { kind: 'alternative', table: flow.id }, message: `${flow.code} no tiene nombre (por ejemplo, «Datos inconsistentes»).` });
    }
  });

  (['initialState', 'finalState'] as const).forEach((field) => {
    const label = field === 'initialState' ? 'estado inicial' : 'estado final';
    content.description[field].split('\n').forEach((line, lineIndex) => {
      const match = new RegExp(`\\binstancias?\\s+(?:de\\s+)?(${identifier})`, 'gi');
      for (const found of line.matchAll(match)) {
        checkClassName(found[1], { kind: 'state', field, lineIndex }, `en el ${label}`);
      }
    });
  });

  return issues;
};

const findOwnerClass = (lines: FlowTableLine[], index: number): string | undefined => {
  const indent = lines[index].indent;
  for (let current = index - 1; current >= 0; current -= 1) {
    const line = lines[current];
    if (line.indent >= indent && line.kind === 'bullet') continue;
    if (line.indent >= indent) return undefined;
    const match = contextPattern.exec(`${line.body}`) ?? new RegExp(`(?:Buscar|Crear|Modificar)\\s+(?:${identifier}\\s+)?(${identifier})\\s+con:\\s*$`, 'i').exec(line.body);
    return match?.[1];
  }
  return undefined;
};
