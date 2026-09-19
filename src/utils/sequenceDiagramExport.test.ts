import { describe, expect, it } from 'vitest';
import type { SequenceDiagramContent, SequenceFragment, SequenceMessage, SequenceParticipant } from '../types/diagram';
import { createEmptySequenceDiagramContent, normalizeSequenceDiagramContent } from './sequenceDiagram';
import { buildSequencePdfPlan, getSequenceExportBounds, getSequenceExportProtectedBands } from './sequenceDiagramExport';
import { buildSequenceLayout } from './sequenceDiagramLayout';

const participant = (id: string, x: number, name = id): SequenceParticipant => ({ id, kind: 'object', name, classifierName: '', x });
const message = (id: string, sourceId: string, targetId: string, name = id): SequenceMessage => ({
  id, kind: 'message', type: 'synchronous', sourceId, targetId, name, arguments: '', parameterValues: '', returnType: '', flowReference: '',
});
const diagram = (items: SequenceDiagramContent['items'], notes: SequenceDiagramContent['notes'] = [], canvas = { width: 2400, height: 1800 }): SequenceDiagramContent => normalizeSequenceDiagramContent({
  ...createEmptySequenceDiagramContent(), canvas, participants: [participant('a', 120, 'Cliente'), participant('b', 420, 'Servicio'), participant('c', 720, 'Repositorio')], items, notes,
});
const assertNoProtectedCut = (layout: ReturnType<typeof buildSequenceLayout>, plan: ReturnType<typeof buildSequencePdfPlan>): void => {
  const bands = getSequenceExportProtectedBands(layout);
  plan.pages.slice(0, -1).forEach((page) => expect(bands.some((band) => band.top < page.source.bottom && page.source.bottom < band.bottom)).toBe(false));
};

describe('sequence diagram export plan', () => {
  it('recorta un diagrama pequeño aunque su lienzo inicial sea 2400 × 1800 y lo deja en una página', () => {
    const content = diagram([message('m1', 'a', 'b', 'consultar')]);
    const layout = buildSequenceLayout(content);
    const crop = getSequenceExportBounds(layout);
    const plan = buildSequencePdfPlan(content, layout);
    expect(crop.width).toBeLessThan(content.canvas.width);
    expect(crop.height).toBeLessThan(content.canvas.height);
    expect(plan.pages).toHaveLength(1);
  });

  it('paginas múltiples respetan mensajes y notas largos cercanos a un corte', () => {
    const content = diagram(
      [message('m1', 'a', 'b', 'operación inicial'), message('m2', 'b', 'c', 'operación posterior')],
      [
        { id: 'note-near-cut', text: 'Nota muy extensa próxima al corte. '.repeat(90), x: 180, y: 600, width: 260, height: 70, anchorKind: 'free' },
        { id: 'note-final', text: 'Nota final', x: 180, y: 1700, width: 260, height: 90, anchorKind: 'free' },
      ],
    );
    const layout = buildSequenceLayout(content);
    const plan = buildSequencePdfPlan(content, layout, { paperSize: 'a4', orientation: 'landscape', scale: 100 });
    expect(plan.pages.length).toBeGreaterThan(1);
    assertNoProtectedCut(layout, plan);
  });

  it('protege cabeceras y condiciones de alt anidados al paginar', () => {
    const nested: SequenceFragment = { id: 'inner', kind: 'fragment', operator: 'alt', name: 'Alternativa interna extensa', y: 650, operands: [
      { id: 'inner-yes', guard: 'condición interna muy extensa que no puede cortarse', items: [message('i1', 'a', 'b', 'llamada interna')] },
      { id: 'inner-no', guard: 'caso contrario interno', items: [message('i2', 'b', 'a', 'retorno interno')] },
    ] };
    const outer: SequenceFragment = { id: 'outer', kind: 'fragment', operator: 'alt', name: 'Alternativa externa', y: 420, operands: [
      { id: 'outer-yes', guard: 'camino principal', items: [nested] },
      { id: 'outer-no', guard: 'camino alternativo', items: [message('o2', 'c', 'a', 'manejar alternativa')] },
    ] };
    const content = diagram([outer], [{ id: 'far', text: 'Fin', x: 200, y: 2200, width: 180, height: 90, anchorKind: 'free' }]);
    const layout = buildSequenceLayout(content);
    const plan = buildSequencePdfPlan(content, layout, { scale: 100 });
    expect(plan.pages.length).toBeGreaterThan(1);
    assertNoProtectedCut(layout, plan);
  });

  it('repite sólo participantes ya creados en las páginas posteriores y conserva los textos largos', () => {
    const created = participant('created', 1010, 'ObjetoCreadoConNombreMuyExtensoQueNoDebePerderse');
    created.createdByMessageId = 'create';
    const content = normalizeSequenceDiagramContent({
      ...diagram([message('create', 'a', 'created', 'create'), message('later', 'created', 'b', 'operación con texto largo '.repeat(15))], [{ id: 'lower', text: 'Lleva el diagrama a una segunda página', x: 150, y: 2100, width: 260, height: 100, anchorKind: 'free' }]),
      participants: [participant('a', 120, 'Cliente'), participant('b', 420, 'Servicio'), created],
    });
    const layout = buildSequenceLayout(content);
    const plan = buildSequencePdfPlan(content, layout, { scale: 100 });
    expect(plan.pages.length).toBeGreaterThan(1);
    expect(plan.pages.at(-1)?.repeatedParticipantIds).toContain('created');
    expect(layout.messageLayouts.get('later')?.labelLines.join(' ')).toContain('operación con texto largo');
  });

  it('reduce la escala de un diagrama ancho para no cortar flechas horizontales', () => {
    const content = normalizeSequenceDiagramContent({ ...diagram([message('wide', 'a', 'c', 'mensaje ancho')]), participants: [participant('a', 100), participant('b', 2000), participant('c', 4200)] });
    const layout = buildSequenceLayout(content);
    const plan = buildSequencePdfPlan(content, layout, { paperSize: 'a4', orientation: 'portrait', scale: 100 });
    expect(plan.effectiveScale).toBeLessThan(1);
    expect(plan.warnings).not.toHaveLength(0);
    expect(plan.pages.every((page) => page.source.width === plan.crop.width)).toBe(true);
  });

  it('no repite participantes que ya fueron destruidos antes del corte de página', () => {
    const created = participant('temp', 1010, 'ObjetoTemporal');
    created.createdByMessageId = 'create';
    created.destroyedByMessageId = 'destroy';
    const content = normalizeSequenceDiagramContent({
      ...diagram(
        [
          { ...message('create', 'a', 'temp', 'create'), type: 'create' },
          { ...message('destroy', 'a', 'temp', 'destroy'), type: 'destroy' },
          message('later', 'a', 'b', 'posterior'),
        ],
        [{ id: 'lower', text: 'Nota para forzar segunda página', x: 150, y: 2200, width: 260, height: 100, anchorKind: 'free' }],
      ),
      participants: [participant('a', 120, 'Cliente'), participant('b', 420, 'Servicio'), created],
    });
    const layout = buildSequenceLayout(content);
    const plan = buildSequencePdfPlan(content, layout, { scale: 100 });
    expect(plan.pages.length).toBeGreaterThan(1);
    // Page 0 has no repeated headers
    expect(plan.pages[0].repeatedParticipantIds).toHaveLength(0);
    // Later page where temp is already destroyed should NOT repeat temp
    const laterPages = plan.pages.slice(1);
    const hasTempAfterDestroy = laterPages.some((page) => {
      const destroyY = layout.messageLayouts.get('destroy')?.y ?? 0;
      return page.source.top >= destroyY && page.repeatedParticipantIds.includes('temp');
    });
    expect(hasTempAfterDestroy).toBe(false);
  });

  it('no repite participantes efímeros terminados (DTO) antes del corte de página', () => {
    const dto = participant('dto', 1010, 'ResultadoDTO');
    dto.terminateLifeline = true;
    const content = normalizeSequenceDiagramContent({
      ...diagram(
        [
          { ...message('create', 'a', 'dto', 'create'), type: 'create' },
          message('set', 'a', 'dto', 'setValor'),
          message('later', 'a', 'b', 'posterior'),
        ],
        [{ id: 'lower', text: 'Nota para forzar segunda página', x: 150, y: 2200, width: 260, height: 100, anchorKind: 'free' }],
      ),
      participants: [participant('a', 120, 'Cliente'), participant('b', 420, 'Servicio'), dto],
    });
    const layout = buildSequenceLayout(content);
    const plan = buildSequencePdfPlan(content, layout, { scale: 100 });
    expect(plan.pages.length).toBeGreaterThan(1);
    expect(layout.terminatedParticipantIds.has('dto')).toBe(true);
    const dtoEndY = layout.participantEndY.get('dto') ?? 0;
    const laterPages = plan.pages.slice(1);
    const hasDtoAfterTermination = laterPages.some((page) =>
      page.source.top >= dtoEndY && page.repeatedParticipantIds.includes('dto')
    );
    expect(hasDtoAfterTermination).toBe(false);
  });

  it('permite paginar un diagrama extenso con activaciones largas sin cortar mensajes ni labels', () => {
    // Generate 16 sequential messages creating long activations
    const messages = Array.from({ length: 16 }, (_, i) =>
      message(`m_${i}`, i % 2 === 0 ? 'a' : 'b', i % 2 === 0 ? 'b' : 'a', `operación paso ${i + 1}`));
    const content = normalizeSequenceDiagramContent({
      ...diagram(messages),
      showActivations: true,
    });
    const layout = buildSequenceLayout(content);
    const plan = buildSequencePdfPlan(content, layout, { paperSize: 'a4', orientation: 'landscape', scale: 100 });
    expect(plan.pages.length).toBeGreaterThan(1);
    assertNoProtectedCut(layout, plan);
  });

  it('emite advertencia y limita el corte a la altura disponible si una banda supera la altura imprimible', () => {
    // A single huge note taller than an entire A4 page
    const content = diagram(
      [message('m1', 'a', 'b', 'inicio')],
      [{ id: 'giant-note', text: 'Texto gigante. '.repeat(800), x: 150, y: 150, width: 200, height: 2500, anchorKind: 'free' }],
    );
    const layout = buildSequenceLayout(content);
    const plan = buildSequencePdfPlan(content, layout, { paperSize: 'a4', orientation: 'portrait', scale: 100 });
    expect(plan.warnings.some((w) => w.includes('supera la altura de página'))).toBe(true);
    // Ensure every page slice height in points is within printable height
    const paper = { width: 595.28, height: 841.89 };
    const margin = 10 * 72 / 25.4;
    const maxPrintablePoints = paper.height - margin * 2;
    plan.pages.forEach((page) => {
      const pageHeightPoints = page.source.height * plan.effectiveScale;
      expect(pageHeightPoints).toBeLessThanOrEqual(maxPrintablePoints + 1);
    });
  });

  it('los límites de recorte PNG y PDF son idénticos y excluyen el espacio vacío del lienzo 2400 × 1800', () => {
    const content = diagram([message('m1', 'a', 'b', 'operación única')]);
    const layout = buildSequenceLayout(content);
    const crop = getSequenceExportBounds(layout);
    const plan = buildSequencePdfPlan(content, layout);
    expect(plan.crop).toEqual(crop);
    expect(crop.width).toBeLessThan(1200);
    expect(crop.height).toBeLessThan(600);
  });
});
