import { describe, expect, it } from 'vitest';
import type { SequenceDiagramContent, SequenceFragment, SequenceMessage, SequenceParticipant } from '../types/diagram';
import {
  clampParticipantX,
  createEmptySequenceDiagramContent,
  formatSequenceMessageLabel,
  normalizeSequenceDiagramContent,
} from './sequenceDiagram';
import { getSequenceParticipantHeaderWidth, moveSequenceFragmentGeometry, reorderSequenceParticipants } from './sequenceDiagramGeometry';
import { buildSequenceLayout, calculateSequenceDiagramBounds, getSequenceMessageEndpoints } from './sequenceDiagramLayout';

const participant = (id: string, x: number, name = id): SequenceParticipant => ({
  id,
  kind: 'object',
  name,
  classifierName: '',
  x,
});

const message = (
  id: string,
  sourceId: string,
  targetId: string,
  name = id,
): SequenceMessage => ({
  id,
  kind: 'message',
  type: 'synchronous',
  sourceId,
  targetId,
  name,
  arguments: '',
  parameterValues: '',
  returnType: '',
  flowReference: '',
});

const content = (items: SequenceDiagramContent['items'], notes: SequenceDiagramContent['notes'] = []): SequenceDiagramContent =>
  normalizeSequenceDiagramContent({
    ...createEmptySequenceDiagramContent(),
    participants: [participant('a', 120), participant('b', 400), participant('c', 680)],
    items,
    notes,
  });

describe('sequence diagram geometry contract', () => {
  it('moves a fragment and its explicit nested geometry by 400px without leaving timeline content behind', () => {
    const inner: SequenceFragment = {
      id: 'inner',
      kind: 'fragment',
      operator: 'alt',
      name: 'Alternativa interna',
      y: 270,
      operands: [
        { id: 'inner-first', guard: 'sí', items: [message('inside', 'a', 'b')] },
        { id: 'inner-second', guard: 'no', items: [message('inside-else', 'b', 'a')] },
      ],
    };
    const outer: SequenceFragment = {
      id: 'outer',
      kind: 'fragment',
      operator: 'loop',
      name: 'Operación principal',
      y: 180,
      operands: [{ id: 'outer-body', guard: 'cada solicitud', items: [inner] }],
    };
    const before = content([outer]);
    const beforeLayout = buildSequenceLayout(before);
    const moved = normalizeSequenceDiagramContent({
      ...before,
      items: moveSequenceFragmentGeometry(
        before.items,
        'outer',
        {
          x: beforeLayout.fragmentLayouts.get('outer')!.x,
          y: beforeLayout.fragmentLayouts.get('outer')!.y + 400,
          width: beforeLayout.fragmentLayouts.get('outer')!.width,
          height: beforeLayout.fragmentLayouts.get('outer')!.height,
        },
        { x: 0, y: 400 },
      ),
    });
    const afterLayout = buildSequenceLayout(moved);
    const beforeOuter = beforeLayout.fragmentLayouts.get('outer')!;
    const afterOuter = afterLayout.fragmentLayouts.get('outer')!;
    const beforeInner = beforeLayout.fragmentLayouts.get('inner')!;
    const afterInner = afterLayout.fragmentLayouts.get('inner')!;

    expect(afterOuter.y - beforeOuter.y).toBe(400);
    expect(afterInner.y - beforeInner.y).toBe(400);
    expect(afterLayout.messageLayouts.get('inside')!.y - beforeLayout.messageLayouts.get('inside')!.y).toBe(400);
    expect(afterLayout.messageLayouts.get('inside')!.y - afterOuter.y)
      .toBe(beforeLayout.messageLayouts.get('inside')!.y - beforeOuter.y);
    expect(afterInner.y).toBeGreaterThanOrEqual(afterOuter.y);
    expect(afterInner.y + afterInner.height).toBeLessThanOrEqual(afterOuter.y + afterOuter.height);

    const reopened = buildSequenceLayout(normalizeSequenceDiagramContent(JSON.parse(JSON.stringify(moved))));
    expect(reopened.fragmentLayouts.get('outer')).toMatchObject({
      x: afterOuter.x,
      y: afterOuter.y,
      width: afterOuter.width,
      height: afterOuter.height,
    });
    expect(reopened.messageLayouts.get('inside')!.y).toBe(afterLayout.messageLayouts.get('inside')!.y);
  });

  it('clamps a shrink request to the real dimensions required by branches and messages', () => {
    const fragment: SequenceFragment = {
      id: 'alt',
      kind: 'fragment',
      operator: 'alt',
      name: 'Una alternativa con un título suficientemente largo para ocupar varias líneas',
      x: 20,
      y: 220,
      width: 140,
      height: 60,
      operands: [
        {
          id: 'first',
          guard: 'condición muy extensa que debe conservarse completa sin recortar el contenido de la rama',
          items: [message('first-message', 'a', 'c', 'operación con una etiqueta muy extensa que requiere espacio vertical')],
        },
        {
          id: 'second',
          guard: 'else con una condición igualmente extensa que no puede salir del fragmento',
          items: [message('second-message', 'c', 'a', 'otra operación que también debe seguir dentro de su rama')],
        },
      ],
    };
    const layout = buildSequenceLayout(content([fragment]));
    const box = layout.fragmentLayouts.get(fragment.id)!;

    expect(box.width).toBeGreaterThanOrEqual(box.minWidth);
    expect(box.height).toBeGreaterThanOrEqual(box.minHeight);
    expect(box.operands.every((operand) => operand.top >= box.y + box.headerHeight && operand.bottom <= box.y + box.height)).toBe(true);
    for (const operand of box.operands) {
      const messages = Array.from(layout.messageLayouts.values()).filter((candidate) => candidate.operandId === operand.id);
      expect(messages).not.toHaveLength(0);
      expect(messages.every((candidate) => candidate.labelTop >= operand.contentTop && candidate.y + candidate.height / 2 <= operand.bottom)).toBe(true);
    }
  });

  it('keeps nested alt operands inside their independent parent scopes', () => {
    const nested: SequenceFragment = {
      id: 'nested-alt',
      kind: 'fragment',
      operator: 'alt',
      name: 'interno',
      operands: [
        { id: 'nested-a', guard: 'caso A', items: [message('nested-a-message', 'a', 'b')] },
        { id: 'nested-b', guard: 'caso B', items: [message('nested-b-message', 'b', 'c')] },
      ],
    };
    const outer: SequenceFragment = {
      id: 'outer-alt',
      kind: 'fragment',
      operator: 'alt',
      name: 'externo',
      operands: [
        { id: 'outer-a', guard: 'primero', items: [nested] },
        { id: 'outer-b', guard: 'segundo', items: [message('outer-b-message', 'c', 'a')] },
      ],
    };
    const layout = buildSequenceLayout(content([outer]));
    const outerBox = layout.fragmentLayouts.get('outer-alt')!;
    const nestedBox = layout.fragmentLayouts.get('nested-alt')!;
    const outerFirst = outerBox.operands.find((operand) => operand.id === 'outer-a')!;

    expect(nestedBox.x).toBeGreaterThanOrEqual(outerBox.x + 12);
    expect(nestedBox.x + nestedBox.width).toBeLessThanOrEqual(outerBox.x + outerBox.width - 12);
    expect(nestedBox.y).toBeGreaterThanOrEqual(outerFirst.contentTop);
    expect(nestedBox.y + nestedBox.height).toBeLessThanOrEqual(outerFirst.bottom);
    expect(nestedBox.operands.every((operand) => operand.top >= nestedBox.y + nestedBox.headerHeight && operand.bottom <= nestedBox.y + nestedBox.height)).toBe(true);
  });

  it('resolves large participant drags and crossings against every other participant', () => {
    const participants = [participant('a', 120), participant('b', 300), participant('c', 480)];
    const throughBoth = clampParticipantX(participants, 'a', 400);
    const pastBoth = clampParticipantX(participants, 'a', 780);

    expect([300, 480].every((x) => Math.abs(throughBoth - x) >= 180)).toBe(true);
    expect([300, 480].every((x) => Math.abs(pastBoth - x) >= 180)).toBe(true);
    expect(pastBoth).toBe(780);
  });

  it('uses the real header width when clamping a long participant drag', () => {
    const long = participant('long', 120, 'ParticipanteConUnNombreMuyLargoQueDebeConservarse');
    const other = participant('other', 620, 'Otro');
    const participants = [long, other];
    const moved = clampParticipantX(participants, 'other', 180);
    const measured = buildSequenceLayout(normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants,
    }));
    const measuredLongWidth = measured.participantLayouts.get('long')!.headerWidth;
    const measuredOtherWidth = measured.participantLayouts.get('other')!.headerWidth;

    expect(Math.abs(moved - long.x)).toBeGreaterThanOrEqual((measuredLongWidth + measuredOtherWidth) / 2 + 20);
  });

  it('reorders adjacent participants without overlapping measured headers', () => {
    const participants = [
      participant('a', 120, 'InterfazDeCargaDeTramites'),
      participant('b', 400, 'Controlador'),
      participant('c', 680, 'Repositorio'),
    ];
    const moved = reorderSequenceParticipants(participants, 'b', -1);
    expect(moved?.map((candidate) => candidate.id)).toEqual(['b', 'a', 'c']);
    const first = moved!.find((candidate) => candidate.id === 'b')!;
    const second = moved!.find((candidate) => candidate.id === 'a')!;
    expect(second.x - first.x).toBeGreaterThanOrEqual(
      (getSequenceParticipantHeaderWidth(first) + getSequenceParticipantHeaderWidth(second)) / 2 + 20,
    );

    const movedRight = reorderSequenceParticipants(participants, 'b', 1);
    expect(movedRight?.map((candidate) => candidate.id)).toEqual(['a', 'c', 'b']);
    const rightNeighbor = movedRight!.find((candidate) => candidate.id === 'c')!;
    const movedParticipant = movedRight!.find((candidate) => candidate.id === 'b')!;
    expect(movedParticipant.x - rightNeighbor.x).toBeGreaterThanOrEqual(
      (getSequenceParticipantHeaderWidth(movedParticipant) + getSequenceParticipantHeaderWidth(rightNeighbor)) / 2 + 20,
    );
  });

  it('keeps complete long names, labels, guards and fragment names in measured layout', () => {
    const veryLongName = 'ParticipanteConUnNombreExtremadamenteLargoSinEspaciosQueDebeDividirseEnTodasLasLíneasNecesarias';
    const veryLongText = 'operacionConUnaEtiquetaExtremadamenteLargaSinEspaciosQueDebeDividirseSinPerderNiUnSoloCaracter'.repeat(6);
    const fragment: SequenceFragment = {
      id: 'long-fragment',
      kind: 'fragment',
      operator: 'alt',
      name: veryLongText,
      operands: [{ id: 'long-guard', guard: veryLongText, items: [message('long-message', 'a', 'b', veryLongText)] }],
    };
    const longContent = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120, veryLongName), participant('b', 400)],
      items: [fragment],
    });
    const layout = buildSequenceLayout(longContent);
    const participantBox = layout.participantLayouts.get('a')!;
    const messageBox = layout.messageLayouts.get('long-message')!;
    const fragmentBox = layout.fragmentLayouts.get('long-fragment')!;

    expect(participantBox.nameLines.length).toBeGreaterThan(2);
    expect(messageBox.labelLines.length).toBeGreaterThan(12);
    expect(messageBox.labelLines.join('')).toBe(formatSequenceMessageLabel(fragment.operands[0].items[0] as SequenceMessage, '1').replaceAll(' ', '').replaceAll('\n', ''));
    expect(fragmentBox.nameLines.join('')).toBe(veryLongText);
    expect(fragmentBox.operands[0].guardLines.join('')).toBe(veryLongText);
    expect(messageBox.labelTop).toBeGreaterThanOrEqual(fragmentBox.operands[0].contentTop);
  });

  it('grows notes for long text, preserves a sufficient manual height, and includes them in bounds', () => {
    const longNote = 'Texto de nota extenso que debe mantenerse visible en cada línea. '.repeat(30);
    const layout = buildSequenceLayout(content([], [{
      id: 'auto-note',
      text: longNote,
      x: 880,
      y: 1120,
      width: 150,
      height: 70,
      anchorKind: 'free',
    }, {
      id: 'manual-note',
      text: 'Nota manual suficiente',
      x: 1400,
      y: 1650,
      width: 260,
      height: 800,
      anchorKind: 'free',
    }]));
    const automatic = layout.noteLayouts.get('auto-note')!;
    const manual = layout.noteLayouts.get('manual-note')!;

    expect(automatic.height).toBeGreaterThan(70);
    expect(automatic.lines.length).toBeGreaterThan(12);
    expect(manual.height).toBe(800);
    expect(layout.bounds.right).toBeGreaterThanOrEqual(manual.x + manual.width);
    expect(layout.bounds.bottom).toBeGreaterThanOrEqual(manual.y + manual.height);
  });

  it('lets the text-driven note height follow the width both ways without touching the stored height', () => {
    const note = {
      id: 'resizable-note',
      text: 'Una nota con suficiente texto como para ocupar varias líneas cuando se angosta la caja. '.repeat(3),
      x: 100,
      y: 100,
      width: 320,
      height: 90,
      anchorKind: 'free' as const,
    };
    const heightAt = (width: number) => buildSequenceLayout(content([], [{ ...note, width }])).noteLayouts.get(note.id)!.height;

    const wide = heightAt(320);
    const narrow = heightAt(130);
    expect(narrow).toBeGreaterThan(wide);
    // Widening again returns to the same box: nothing about the narrow pass stuck.
    expect(heightAt(320)).toBe(wide);
    expect(note.height).toBe(90);
    expect(heightAt(2000)).toBe(90);
  });

  it('returns one shared real bounds union for distant fragments and notes', () => {
    const fragment: SequenceFragment = {
      id: 'distant-fragment',
      kind: 'fragment',
      operator: 'ref',
      name: 'Referencia alejada',
      x: 1800,
      y: 2100,
      width: 520,
      height: 220,
      operands: [{ id: 'reference', guard: 'ver detalle', items: [] }],
    };
    const diagram = content([fragment], [{
      id: 'distant-note',
      text: 'Nota fuera del área temporal',
      x: 3200,
      y: 3600,
      width: 340,
      height: 180,
      anchorKind: 'free',
    }]);
    const layout = buildSequenceLayout(diagram);
    const bounds = calculateSequenceDiagramBounds(diagram, layout);

    expect(bounds).toEqual(layout.bounds);
    expect(bounds.right).toBeGreaterThanOrEqual(3540);
    expect(bounds.bottom).toBeGreaterThanOrEqual(3780);
    expect(layout.width).toBeGreaterThanOrEqual(bounds.right + 80);
    expect(layout.height).toBeGreaterThanOrEqual(bounds.bottom + 80);
  });

  it('enlarges participant box and keeps long words whole without mid-word cuts', () => {
    const longParticipant: SequenceParticipant = {
      id: 'p-long',
      name: '',
      classifierName: 'IndireccionPersistencia',
      kind: 'object',
      x: 120,
    };
    const diagram = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [longParticipant],
    });
    const layout = buildSequenceLayout(diagram);
    const box = layout.participantLayouts.get('p-long')!;

    // Must NOT be split into IndireccionPersiste and ncia
    expect(box.nameLines).toEqual([':IndireccionPersistencia']);
    expect(box.nameLines.length).toBe(1);
    // Square enlarges from minimum 160 to fit the 24-character word
    expect(box.headerWidth).toBeGreaterThanOrEqual(180);
  });

  it('wraps participant name by whole words when multiple words are present', () => {
    const multiWordParticipant: SequenceParticipant = {
      id: 'p-multi',
      name: 'servicio',
      classifierName: 'IndireccionPersistencia',
      kind: 'object',
      x: 120,
    };
    const diagram = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [multiWordParticipant],
    });
    const layout = buildSequenceLayout(diagram);
    const box = layout.participantLayouts.get('p-multi')!;

    // The whole word IndireccionPersistencia drops down intact without mid-word cut
    expect(box.nameLines).toEqual(['servicio :', 'IndireccionPersistencia']);
    expect(box.headerWidth).toBeGreaterThanOrEqual(170);
    expect(box.headerHeight).toBeGreaterThan(58);
  });

  it('preserves manual Enter line breaks inside participant name and classifier', () => {
    const manualBreakParticipant: SequenceParticipant = {
      id: 'p-manual',
      name: 'miObjeto',
      classifierName: 'Indireccion\nPersistencia',
      kind: 'object',
      x: 120,
    };
    const diagram = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [manualBreakParticipant],
    });
    const layout = buildSequenceLayout(diagram);
    const box = layout.participantLayouts.get('p-manual')!;

    expect(box.nameLines).toEqual(['miObjeto : Indireccion', 'Persistencia']);
    expect(box.nameLines.length).toBe(2);
  });

  it('centers participant name vertically inside header box when no stereotype label is rendered', () => {
    const singleLine: SequenceParticipant = {
      id: 'p-single',
      name: 'Gestor',
      classifierName: '',
      kind: 'control',
      x: 120,
    };
    const diagram = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [singleLine],
    });
    const layout = buildSequenceLayout(diagram);
    const box = layout.participantLayouts.get('p-single')!;

    // For 1 line, nameBaselineY should be headerY + headerHeight / 2 + 4
    expect(box.headerHeight).toBe(48);
    expect(box.nameBaselineY).toBe(box.headerY + box.headerHeight / 2 + 4);
  });

  it('calibrates create() message arrow tip to touch target box edge based on actual header width', () => {
    const wideParticipant: SequenceParticipant = {
      id: 'p-target',
      name: 'ControladorPrincipalConNombreExtenso',
      classifierName: '',
      kind: 'object',
      x: 450,
    };
    const caller: SequenceParticipant = {
      id: 'p-src',
      name: 'Origen',
      classifierName: '',
      kind: 'object',
      x: 100,
    };
    const createMsg: SequenceMessage = {
      ...message('m-create', 'p-src', 'p-target'),
      type: 'create',
    };
    const diagram = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [caller, wideParticipant],
      items: [createMsg],
    });
    const layout = buildSequenceLayout(diagram);
    const targetHeader = layout.participantLayouts.get('p-target')!;
    const endpoints = getSequenceMessageEndpoints(diagram, layout, createMsg)!;

    // Target arrow tip lands at targetCenter - direction * (headerWidth / 2)
    const expectedTargetX = wideParticipant.x - (targetHeader.headerWidth / 2);
    expect(endpoints.targetX).toBe(expectedTargetX);

    // Label is centered along the arrow shaft between sourceX and effectiveTargetX
    const msgBox = layout.messageLayouts.get('m-create')!;
    expect(msgBox.labelCenterX).toBe((caller.x + expectedTargetX) / 2);
  });

  it('calibrates create() message arrow tip when drawn right-to-left', () => {
    const wideParticipant: SequenceParticipant = {
      id: 'p-left-target',
      name: 'ServicioDestinoIzquierdo',
      classifierName: '',
      kind: 'object',
      x: 150,
    };
    const caller: SequenceParticipant = {
      id: 'p-right-src',
      name: 'OrigenDerecho',
      classifierName: '',
      kind: 'object',
      x: 600,
    };
    const createMsg: SequenceMessage = {
      ...message('m-create-rtl', 'p-right-src', 'p-left-target'),
      type: 'create',
    };
    const diagram = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [caller, wideParticipant],
      items: [createMsg],
    });
    const layout = buildSequenceLayout(diagram);
    const targetHeader = layout.participantLayouts.get('p-left-target')!;
    const endpoints = getSequenceMessageEndpoints(diagram, layout, createMsg)!;

    // Target arrow tip lands at targetCenter - direction * (headerWidth / 2) -> 150 - (-1) * (headerWidth / 2)
    const expectedTargetX = wideParticipant.x + (targetHeader.headerWidth / 2);
    expect(endpoints.targetX).toBe(expectedTargetX);
  });

  it('calculates vertically centered nameBaselineY for multiline non-actor participants', () => {
    const multiLine: SequenceParticipant = {
      id: 'p-multi-line',
      name: 'GestorDeTramitesComplejos',
      classifierName: 'ServicioDeAplicacion',
      kind: 'entity',
      x: 200,
    };
    const diagram = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [multiLine],
    });
    const layout = buildSequenceLayout(diagram);
    const box = layout.participantLayouts.get('p-multi-line')!;

    expect(box.nameLines.length).toBeGreaterThanOrEqual(2);
    const lineCount = box.nameLines.length;
    const expectedBaselineY = box.headerY + box.headerHeight / 2 - ((lineCount - 1) * 7) + 4;
    expect(box.nameBaselineY).toBe(expectedBaselineY);
  });

  it('ends created participant (DTO) lifeline with isTerminated shortly after its last message', () => {
    const caller = participant('p-caller', 150);
    const service = participant('p-service', 380);
    const dto: SequenceParticipant = {
      id: 'p-dto',
      name: 'dto',
      classifierName: 'ReporteDTO',
      kind: 'object',
      x: 620,
    };
    const createMsg: SequenceMessage = {
      ...message('m-create', 'p-service', 'p-dto'),
      type: 'create',
    };
    const setMsg: SequenceMessage = {
      ...message('m-set', 'p-service', 'p-dto', 'setNombre'),
      type: 'synchronous',
    };
    const subsequentMsg: SequenceMessage = {
      ...message('m-after', 'p-service', 'p-caller', 'notificar'),
      type: 'synchronous',
    };
    const diagram = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [caller, service, dto],
      items: [createMsg, setMsg, subsequentMsg],
    });
    const layout = buildSequenceLayout(diagram);

    // Created participant (DTO) should be marked as terminated
    expect(layout.terminatedParticipantIds.has('p-dto')).toBe(true);
    expect(layout.participantLayouts.get('p-dto')?.isTerminated).toBe(true);

    // DTO lifeline ends shortly after setMsg (last message involving DTO)
    const setMsgY = layout.messageLayouts.get('m-set')!.y;
    const dtoEndY = layout.participantEndY.get('p-dto')!;
    expect(dtoEndY).toBeGreaterThanOrEqual(setMsgY + 28);
    // And significantly before the diagram timeline bottom
    const callerEndY = layout.participantEndY.get('p-caller')!;
    expect(dtoEndY).toBeLessThan(callerEndY);
  });

  it('keeps regular persistent participant lifeline full length without cross', () => {
    const caller = participant('p-caller', 150);
    const service = participant('p-service', 380);
    const diagram = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [caller, service],
      items: [message('m1', 'p-caller', 'p-service')],
    });
    const layout = buildSequenceLayout(diagram);

    expect(layout.terminatedParticipantIds.has('p-caller')).toBe(false);
    expect(layout.terminatedParticipantIds.has('p-service')).toBe(false);
    expect(layout.participantLayouts.get('p-caller')?.isTerminated).toBe(false);
    expect(layout.participantLayouts.get('p-service')?.isTerminated).toBe(false);

    expect(layout.participantEndY.get('p-caller')).toBe(layout.participantEndY.get('p-service'));
  });

  it('allows manual terminateLifeline: false to override created participant and keep lifeline full length', () => {
    const caller = participant('p-caller', 150);
    const service = participant('p-service', 380);
    const dto: SequenceParticipant = {
      id: 'p-dto',
      name: 'dto',
      classifierName: 'ReporteDTO',
      kind: 'object',
      x: 620,
      terminateLifeline: false,
    };
    const createMsg: SequenceMessage = {
      ...message('m-create', 'p-service', 'p-dto'),
      type: 'create',
    };
    const setMsg: SequenceMessage = {
      ...message('m-set', 'p-service', 'p-dto', 'setNombre'),
      type: 'synchronous',
    };
    const subsequentMsg: SequenceMessage = {
      ...message('m-after', 'p-service', 'p-caller', 'notificar'),
      type: 'synchronous',
    };
    const diagram = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [caller, service, dto],
      items: [createMsg, setMsg, subsequentMsg],
    });
    const layout = buildSequenceLayout(diagram);

    // Overridden with terminateLifeline: false
    expect(layout.terminatedParticipantIds.has('p-dto')).toBe(false);
    expect(layout.participantLayouts.get('p-dto')?.isTerminated).toBe(false);
    expect(layout.participantEndY.get('p-dto')).toBe(layout.participantEndY.get('p-service'));
  });

  it('terminates created participant when it only has the create() message itself', () => {
    const caller = participant('p-caller', 150);
    const dto = participant('p-dto', 450);
    const createMsg: SequenceMessage = {
      ...message('m-create', 'p-caller', 'p-dto'),
      type: 'create',
    };
    const subsequentMsg: SequenceMessage = {
      ...message('m-other', 'p-caller', 'p-caller', 'selfCheck'),
      type: 'synchronous',
    };
    const diagram = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [caller, dto],
      items: [createMsg, subsequentMsg],
    });
    const layout = buildSequenceLayout(diagram);

    expect(layout.terminatedParticipantIds.has('p-dto')).toBe(true);
    const dtoStartY = layout.participantStartY.get('p-dto')!;
    const dtoEndY = layout.participantEndY.get('p-dto')!;
    // Life line terminates shortly below header (at least startY + 20)
    expect(dtoEndY).toBeGreaterThanOrEqual(dtoStartY + 20);
    expect(dtoEndY).toBeLessThan(layout.participantEndY.get('p-caller')!);
  });

  it('terminates a regular participant when terminateLifeline: true is explicitly configured', () => {
    const caller: SequenceParticipant = {
      ...participant('p-caller', 150),
      terminateLifeline: true,
    };
    const service = participant('p-service', 380);
    const msg: SequenceMessage = message('m1', 'p-caller', 'p-service', 'operacion');
    const laterMsg: SequenceMessage = message('m2', 'p-service', 'p-service', 'procesoInterno');
    const diagram = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [caller, service],
      items: [msg, laterMsg],
    });
    const layout = buildSequenceLayout(diagram);

    expect(layout.terminatedParticipantIds.has('p-caller')).toBe(true);
    expect(layout.terminatedParticipantIds.has('p-service')).toBe(false);
    expect(layout.participantEndY.get('p-caller')).toBeLessThan(layout.participantEndY.get('p-service')!);
  });
});
