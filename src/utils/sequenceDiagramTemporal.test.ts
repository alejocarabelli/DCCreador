import { describe, expect, it } from 'vitest';
import type { SequenceDiagramContent, SequenceFragment, SequenceMessage, SequenceParticipant } from '../types/diagram';
import {
  analyzeSequenceDiagramSemantics,
  applySequenceDiagramMutation,
  buildDerivedActivations,
  createEmptySequenceDiagramContent,
  duplicateSequenceItem,
  moveSequenceItem,
  normalizeSequenceDiagramContent,
  reparentSequenceItem,
  updateSequenceItem,
} from './sequenceDiagram';
import { normalizeDiagramProject } from './diagramNormalization';
import { buildSequenceLayout } from './sequenceDiagramLayout';
import { buildSequenceKeyboardInsertionSlots, getSequenceParticipantIdsAliveAtSlot } from './sequenceKeyboardMode';

const participant = (id: string, x: number): SequenceParticipant => ({
  id,
  kind: 'object',
  name: id,
  classifierName: '',
  x,
});

const message = (
  id: string,
  sourceId: string,
  targetId: string,
  type: SequenceMessage['type'] = 'synchronous',
): SequenceMessage => ({
  id,
  kind: 'message',
  type,
  sourceId,
  targetId,
  name: id,
  arguments: '',
  parameterValues: '',
  returnType: '',
  flowReference: '',
});

const hasProblem = (content: ReturnType<typeof normalizeSequenceDiagramContent>, code: string, messageId: string): boolean =>
  content.problems.some((problem) => problem.code === code && problem.messageId === messageId);

describe('sequence temporal semantics', () => {
  it('keeps no-return calls isolated in sibling alt operands', () => {
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 360)],
      items: [
        {
          id: 'alt',
          kind: 'fragment',
          operator: 'alt',
          name: '',
          operands: [
            { id: 'first', guard: 'primera', items: [message('call-in-first', 'a', 'b')] },
            { id: 'second', guard: 'segunda', items: [message('call-in-second', 'b', 'a')] },
          ],
        } satisfies SequenceFragment,
        message('after-alt', 'a', 'b'),
      ],
    });

    const activations = buildDerivedActivations(content);
    expect(activations.some((activation) =>
      activation.participantId === 'b' && activation.startMessageId === 'call-in-second')).toBe(false);
    expect(activations).toContainEqual(expect.objectContaining({
      participantId: 'a',
      startMessageId: 'call-in-second',
      endMessageId: 'call-in-second',
    }));
    expect(activations).toContainEqual(expect.objectContaining({
      participantId: 'b',
      startMessageId: 'after-alt',
      level: 0,
    }));
    const layout = buildSequenceLayout(content);
    const secondOperand = layout.fragmentLayouts.get('alt')!.operands.find((operand) => operand.id === 'second')!;
    const secondActivation = layout.activationLayouts.find((activation) =>
      activation.participantId === 'a' && activation.id.includes('call-in-second'))!;
    expect(secondActivation.y + secondActivation.height).toBeLessThanOrEqual(secondOperand.bottom + 3);
  });

  it('bounds activations opened inside loop fragments to the loop and treats no-return calls as self-closing', () => {
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [
        participant('caller', 120),
        participant('service', 360),
        participant('dto', 600),
      ],
      items: [
        {
          id: 'loop-frag',
          kind: 'fragment',
          operator: 'loop',
          name: '',
          operands: [
            {
              id: 'loop-op',
              guard: 'hayElementos',
              items: [
                message('create-dto', 'service', 'dto', 'create'),
                message('set-name', 'service', 'dto'),
              ],
            },
          ],
        } satisfies SequenceFragment,
        message('after-loop-1', 'caller', 'service'),
        message('after-loop-2', 'caller', 'service'),
      ],
    });

    const activations = buildDerivedActivations(content);
    // The setter has no compatible return, so it closes on its own message.
    const dtoActivation = activations.find((a) => a.participantId === 'dto' && a.startMessageId === 'set-name');
    expect(dtoActivation).toBeDefined();
    expect(dtoActivation?.endMessageId).toBe('set-name');

    // In layout, the implicit-completion activation is a compact box (height: 16) centered at message Y
    const layout = buildSequenceLayout(content);
    const loopOp = layout.fragmentLayouts.get('loop-frag')!.operands[0];
    const dtoBar = layout.activationLayouts.find((a) => a.participantId === 'dto')!;
    expect(dtoBar).toBeDefined();
    expect(dtoBar.height).toBe(16);
    expect(dtoBar.width).toBe(12);
    expect(dtoBar.y + dtoBar.height).toBeLessThanOrEqual(loopOp.bottom + 3);

    const afterLoopY = layout.messageLayouts.get('after-loop-1')!.y;
    expect(dtoBar.y + dtoBar.height).toBeLessThan(afterLoopY);
  });

  it('keeps returns paired inside nested alternative paths', () => {
    const firstCall = message('first-call', 'a', 'b');
    const firstReturn = { ...message('first-return', 'b', 'a', 'return'), replyToMessageId: 'first-call' };
    const secondCall = message('second-call', 'b', 'c');
    const secondReturn = { ...message('second-return', 'c', 'b', 'return'), replyToMessageId: 'second-call' };
    const outerCall = message('outer-call', 'c', 'a');
    const outerReturn = { ...message('outer-return', 'a', 'c', 'return'), replyToMessageId: 'outer-call' };
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 360), participant('c', 600)],
      items: [{
        id: 'outer-alt',
        kind: 'fragment',
        operator: 'alt',
        name: '',
        operands: [
          {
            id: 'outer-first',
            guard: 'uno',
            items: [{
              id: 'inner-alt',
              kind: 'fragment',
              operator: 'alt',
              name: '',
              operands: [
                { id: 'inner-first', guard: 'a', items: [firstCall, firstReturn] },
                { id: 'inner-second', guard: 'b', items: [secondCall, secondReturn] },
              ],
            } satisfies SequenceFragment],
          },
          { id: 'outer-second', guard: 'dos', items: [outerCall, outerReturn] },
        ],
      } satisfies SequenceFragment],
    });

    const byStart = new Map(buildDerivedActivations(content).map((activation) => [activation.startMessageId, activation]));
    expect(byStart.get('first-call')).toMatchObject({ participantId: 'b', endMessageId: 'first-return' });
    expect(byStart.get('second-call')).toMatchObject({ participantId: 'c', endMessageId: 'second-return' });
    expect(byStart.get('outer-call')).toMatchObject({ participantId: 'a', endMessageId: 'outer-return' });
    expect(content.problems.filter((problem) => problem.code === 'unmatched-return')).toHaveLength(0);
  });

  it('does not let an explicit return close a call from a sibling alt operand', () => {
    const call = message('first-call', 'a', 'b');
    const misplacedReturn = { ...message('second-return', 'b', 'a', 'return'), replyToMessageId: 'first-call' };
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 360)],
      items: [{
        id: 'alt',
        kind: 'fragment',
        operator: 'alt',
        name: '',
        operands: [
          { id: 'first', guard: 'uno', items: [call] },
          { id: 'second', guard: 'dos', items: [misplacedReturn] },
        ],
      } satisfies SequenceFragment],
    });

    expect(hasProblem(content, 'unmatched-return', 'second-return')).toBe(true);
    expect(buildDerivedActivations(content).find((activation) =>
      activation.participantId === 'b' && activation.startMessageId === 'first-call')?.endMessageId).toBe('first-call');
  });

  it('implicitly completes a call whose only explicit return lives in another scope', () => {
    const call = message('pre-alt-call', 'a', 'b');
    const returnedInOnePath = {
      ...message('return-in-first-path', 'b', 'a', 'return'),
      replyToMessageId: 'pre-alt-call',
    };
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 360)],
      items: [
        call,
        {
          id: 'alt',
          kind: 'fragment',
          operator: 'alt',
          name: '',
          operands: [
            { id: 'first', guard: 'uno', items: [returnedInOnePath] },
            { id: 'second', guard: 'dos', items: [] },
          ],
        } satisfies SequenceFragment,
      ],
    });

    expect(buildDerivedActivations(content)).toContainEqual(expect.objectContaining({
      participantId: 'b',
      startMessageId: 'pre-alt-call',
      endMessageId: 'pre-alt-call',
    }));
    expect(content.problems).toContainEqual(expect.objectContaining({
      code: 'unmatched-return',
      messageId: 'return-in-first-path',
      operandId: 'first',
    }));
  });

  it('reports use after a branch-dependent create while preserving the legacy marker', () => {
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 360)],
      items: [
        {
          id: 'alt',
          kind: 'fragment',
          operator: 'alt',
          name: '',
          operands: [
            { id: 'creates', guard: 'sí', items: [message('create-b', 'a', 'b', 'create')] },
            { id: 'does-not-create', guard: 'no', items: [] },
          ],
        } satisfies SequenceFragment,
        message('uses-conditional-b', 'a', 'b'),
      ],
    });

    expect(content.participants.find((item) => item.id === 'b')?.createdByMessageId).toBe('create-b');
    expect(hasProblem(content, 'conditional-participant-lifecycle', 'uses-conditional-b')).toBe(true);
  });

  it('preserves invalid lifecycle messages and reports them without giving them temporal effects', () => {
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 360)],
      items: [
        message('before-create', 'a', 'b'),
        message('create-b', 'a', 'b', 'create'),
        message('create-b-again', 'a', 'b', 'create'),
        message('destroy-b', 'a', 'b', 'destroy'),
        message('after-destroy', 'b', 'a'),
        message('destroy-b-again', 'a', 'b', 'destroy'),
      ],
    });

    expect(content.items.map((item) => item.id)).toEqual([
      'before-create', 'create-b', 'create-b-again', 'destroy-b', 'after-destroy', 'destroy-b-again',
    ]);
    expect(hasProblem(content, 'message-before-create', 'before-create')).toBe(true);
    expect(hasProblem(content, 'duplicate-create', 'create-b-again')).toBe(true);
    expect(hasProblem(content, 'message-after-destroy', 'after-destroy')).toBe(true);
    expect(hasProblem(content, 'duplicate-destroy', 'destroy-b-again')).toBe(true);
    expect(content.participants.find((item) => item.id === 'b')).toMatchObject({
      createdByMessageId: 'create-b',
      destroyedByMessageId: 'destroy-b',
    });

    const validIds = analyzeSequenceDiagramSemantics(content).validMessageIds;
    expect(validIds.has('before-create')).toBe(false);
    expect(validIds.has('after-destroy')).toBe(false);
  });

  it('keeps a return with no compatible call and reports it instead of closing another path', () => {
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 360)],
      items: [message('orphan-return', 'b', 'a', 'return')],
    });

    expect(content.items).toHaveLength(1);
    expect(hasProblem(content, 'unmatched-return', 'orphan-return')).toBe(true);
    expect(buildDerivedActivations(content)).toEqual([]);
  });

  it('retains imported dangling message references as structured problems', () => {
    const project = normalizeDiagramProject({
      id: 'imported',
      name: 'Importado',
      createdAt: '2026-09-14T00:00:00.000Z',
      updatedAt: '2026-09-14T00:00:00.000Z',
      activeArtifactId: 'sequence',
      artifacts: [{
        id: 'sequence',
        type: 'sequence-diagram',
        name: 'Temporalmente inválido',
        createdAt: '2026-09-14T00:00:00.000Z',
        updatedAt: '2026-09-14T00:00:00.000Z',
        content: {
          ...createEmptySequenceDiagramContent(),
          participants: [participant('a', 120)],
          items: [message('dangling', 'a', 'missing')],
        },
      }],
    });
    const content = project.artifacts[0].type === 'sequence-diagram'
      ? project.artifacts[0].content
      : createEmptySequenceDiagramContent();

    expect(content.items).toHaveLength(1);
    expect((content.items[0] as SequenceMessage).targetId).toBe('missing');
    expect(hasProblem(content, 'missing-participant-reference', 'dangling')).toBe(true);
  });

  it('uses the same semantic gate after duplicate, movement, route edits, and reparenting', () => {
    const create = message('create-b', 'a', 'b', 'create');
    const use = message('use-b', 'a', 'b');
    const participants = [participant('a', 120), participant('b', 360)];
    const duplicated = duplicateSequenceItem([create], 'create-b').items;
    const moved = moveSequenceItem([create, use], 'create-b', 1);
    const routeEdited = updateSequenceItem([create, use], 'use-b', (item) => ({
      ...item,
      sourceId: 'b',
      targetId: 'a',
    } as SequenceMessage));
    const reparented = reparentSequenceItem([
      {
        id: 'alt',
        kind: 'fragment',
        operator: 'alt',
        name: '',
        operands: [
          { id: 'created', guard: 'sí', items: [create] },
          { id: 'not-created', guard: 'no', items: [] },
        ],
      } satisfies SequenceFragment,
      use,
    ], 'use-b', { fragmentId: 'alt', operandId: 'not-created' });

    expect(normalizeSequenceDiagramContent({ ...createEmptySequenceDiagramContent(), participants, items: duplicated }).problems
      .some((problem) => problem.code === 'duplicate-create')).toBe(true);
    expect(normalizeSequenceDiagramContent({ ...createEmptySequenceDiagramContent(), participants, items: moved }).problems
      .some((problem) => problem.code === 'message-before-create' && problem.messageId === 'use-b')).toBe(true);
    expect(normalizeSequenceDiagramContent({ ...createEmptySequenceDiagramContent(), participants, items: routeEdited }).problems)
      .toEqual([]);
    expect(normalizeSequenceDiagramContent({ ...createEmptySequenceDiagramContent(), participants, items: reparented }).problems
      .some((problem) => problem.code === 'message-before-create' && problem.messageId === 'use-b')).toBe(true);

    const onlyCreate = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants,
      items: [create],
    });
    const ordered = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants,
      items: [create, use],
    });
    expect(applySequenceDiagramMutation(onlyCreate, { ...onlyCreate, items: duplicated }).accepted).toBe(false);
    expect(applySequenceDiagramMutation(ordered, { ...ordered, items: moved }).accepted).toBe(false);
    expect(applySequenceDiagramMutation(ordered, { ...ordered, items: routeEdited }).accepted).toBe(true);

    const rootCreate = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants,
      items: [
        {
          id: 'destination-alt',
          kind: 'fragment',
          operator: 'alt',
          name: '',
          operands: [
            { id: 'one', guard: 'uno', items: [] },
            { id: 'two', guard: 'dos', items: [] },
          ],
        } satisfies SequenceFragment,
        create,
        use,
      ],
    });
    const movedCreateIntoOneBranch = reparentSequenceItem(rootCreate.items, 'create-b', {
      fragmentId: 'destination-alt',
      operandId: 'one',
    });
    expect(applySequenceDiagramMutation(rootCreate, {
      ...rootCreate,
      items: movedCreateIntoOneBranch,
    }).accepted).toBe(false);

    const rootCreateLoop = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants,
      items: [
        {
          id: 'destination-loop',
          kind: 'fragment',
          operator: 'loop',
          name: '',
          operands: [
            { id: 'body', guard: 'while items', items: [] },
          ],
        } satisfies SequenceFragment,
        create,
        use,
      ],
    });
    const movedCreateIntoLoop = reparentSequenceItem(rootCreateLoop.items, 'create-b', {
      fragmentId: 'destination-loop',
      operandId: 'body',
    });
    expect(applySequenceDiagramMutation(rootCreateLoop, {
      ...rootCreateLoop,
      items: movedCreateIntoLoop,
    }).accepted).toBe(true);
  });

  it('rejects new interactive temporal errors but keeps imported errors recoverable', () => {
    const current = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 360)],
      items: [message('create-b', 'a', 'b', 'create')],
    });
    const candidate = {
      ...current,
      items: [message('before-create', 'a', 'b'), ...current.items],
    };
    const mutation = applySequenceDiagramMutation(current, candidate);

    expect(mutation.accepted).toBe(false);
    expect(mutation.newProblems).toContainEqual(expect.objectContaining({
      code: 'message-before-create',
      messageId: 'before-create',
    }));
    expect(mutation.content.items.map((item) => item.id)).toContain('before-create');
  });

  it('validates ref fragment interaction references', () => {
    const baseContent = {
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 360)],
      items: [
        {
          id: 'ref-1',
          kind: 'fragment' as const,
          operator: 'ref' as const,
          name: 'Autenticación',
          operands: [{ id: 'op-1', guard: '', items: [] }],
        },
      ],
    };

    // Unlinked warning
    const unlinkedAnalysis = analyzeSequenceDiagramSemantics(baseContent);
    expect(unlinkedAnalysis.problems).toContainEqual(expect.objectContaining({
      code: 'unlinked-interaction-reference',
      fragmentId: 'ref-1',
      severity: 'warning',
    }));

    // Broken reference error when artifact id does not exist in project
    const linkedContent = {
      ...baseContent,
      items: [
        {
          ...baseContent.items[0],
          interactionArtifactId: 'missing-diag-id',
        },
      ],
    };
    const brokenAnalysis = analyzeSequenceDiagramSemantics(linkedContent, {
      existingArtifactIds: new Set(['other-diag-1', 'other-diag-2']),
    });
    expect(brokenAnalysis.problems).toContainEqual(expect.objectContaining({
      code: 'broken-interaction-reference',
      fragmentId: 'ref-1',
      severity: 'error',
    }));

    // Valid when artifact exists in project
    const validAnalysis = analyzeSequenceDiagramSemantics(linkedContent, {
      existingArtifactIds: new Set(['missing-diag-id']),
    });
    expect(
      validAnalysis.problems.filter(
        (p) => p.code === 'broken-interaction-reference' || p.code === 'unlinked-interaction-reference',
      ),
    ).toHaveLength(0);
  });

  it('creates independent compact activations for sequential setters on the same participant without keeping the bar open across calls', () => {
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      showActivations: true,
      participants: [
        participant('ctrl', 120),
        participant('tramite', 400),
      ],
      items: [
        message('m-create', 'ctrl', 'tramite', 'create'),
        message('set-cod', 'ctrl', 'tramite'),
        message('set-nom', 'ctrl', 'tramite'),
        message('set-desc', 'ctrl', 'tramite'),
      ],
    });

    const activations = buildDerivedActivations(content);
    // tramite should have 3 independent activations, each closing at its own message
    const tramiteActs = activations.filter((a) => a.participantId === 'tramite');
    expect(tramiteActs).toHaveLength(3);
    expect(tramiteActs[0]).toMatchObject({ startMessageId: 'set-cod', endMessageId: 'set-cod' });
    expect(tramiteActs[1]).toMatchObject({ startMessageId: 'set-nom', endMessageId: 'set-nom' });
    expect(tramiteActs[2]).toMatchObject({ startMessageId: 'set-desc', endMessageId: 'set-desc' });

    // Sending does not invent a long-running caller activation.
    const ctrlActs = activations.filter((a) => a.participantId === 'ctrl');
    expect(ctrlActs).toHaveLength(0);

    const layout = buildSequenceLayout(content);
    const setCodY = layout.messageLayouts.get('set-cod')!.y;
    const setNomY = layout.messageLayouts.get('set-nom')!.y;
    const setDescY = layout.messageLayouts.get('set-desc')!.y;

    const bar1 = layout.activationLayouts.find((a) => a.participantId === 'tramite' && a.id.includes('set-cod'))!;
    const bar2 = layout.activationLayouts.find((a) => a.participantId === 'tramite' && a.id.includes('set-nom'))!;
    const bar3 = layout.activationLayouts.find((a) => a.participantId === 'tramite' && a.id.includes('set-desc'))!;

    expect(bar1).toBeDefined();
    expect(bar2).toBeDefined();
    expect(bar3).toBeDefined();

    // Each implicit-completion activation is a compact 12x16 rectangle centered at message Y
    expect(bar1.height).toBe(16);
    expect(bar1.width).toBe(12);
    expect(bar1.y).toBe(setCodY - 8);

    expect(bar2.height).toBe(16);
    expect(bar2.width).toBe(12);
    expect(bar2.y).toBe(setNomY - 8);

    expect(bar3.height).toBe(16);
    expect(bar3.width).toBe(12);
    expect(bar3.y).toBe(setDescY - 8);
  });

  it('isolates no-return calls inside alt branches without leaking activation state into subsequent branches', () => {
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      showActivations: true,
      participants: [
        participant('caller', 120),
        participant('target', 400),
      ],
      items: [
        {
          id: 'alt-block',
          kind: 'fragment',
          operator: 'alt',
          name: 'Condición',
          operands: [
            {
              id: 'branch-1',
              guard: 'opcionA',
              items: [
                message('msg-branch-1', 'caller', 'target'),
              ],
            },
            {
              id: 'branch-2',
              guard: 'opcionB',
              items: [
                message('msg-branch-2', 'caller', 'target'),
              ],
            },
          ],
        } satisfies SequenceFragment,
      ],
    });

    const activations = buildDerivedActivations(content);
    const targetActs = activations.filter((a) => a.participantId === 'target');
    expect(targetActs).toHaveLength(2);
    expect(targetActs[0]).toMatchObject({ startMessageId: 'msg-branch-1', endMessageId: 'msg-branch-1' });
    expect(targetActs[1]).toMatchObject({ startMessageId: 'msg-branch-2', endMessageId: 'msg-branch-2' });
  });

  it('terminates ephemeral participant lifeline with X after its compact setter activations', () => {
    const caller = participant('caller', 120);
    const service = participant('service', 380);
    const dto = participant('dto', 640);
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [caller, service, dto],
      items: [
        message('create-dto', 'service', 'dto', 'create'),
        message('set-prop', 'service', 'dto', 'synchronous'),
        message('followup', 'service', 'caller', 'synchronous'),
      ],
    });
    const layout = buildSequenceLayout(content);
    expect(layout.terminatedParticipantIds.has('dto')).toBe(true);
    const setMsgY = layout.messageLayouts.get('set-prop')!.y;
    const dtoEndY = layout.participantEndY.get('dto')!;
    expect(dtoEndY).toBeGreaterThanOrEqual(setMsgY + 28);
    expect(dtoEndY).toBeLessThan(layout.participantEndY.get('service')!);
  });

  it('allows getting a DTO outside a loop when created with a condition inside the loop', () => {
    const service = participant('service', 120);
    const dto = participant('dto', 380);
    const baseContent = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [service, dto],
      items: [
        {
          id: 'loop-search',
          kind: 'fragment',
          operator: 'loop',
          name: 'Loop',
          operands: [
            {
              id: 'loop-op',
              guard: 'para cada elemento',
              items: [
                {
                  id: 'opt-match',
                  kind: 'fragment',
                  operator: 'opt',
                  name: 'Opt',
                  operands: [
                    {
                      id: 'opt-op',
                      guard: 'cumple criterio',
                      items: [
                        message('create-dto', 'service', 'dto', 'create'),
                        message('set-data', 'service', 'dto', 'synchronous'),
                      ],
                    },
                  ],
                } satisfies SequenceFragment,
              ],
            },
          ],
        } satisfies SequenceFragment,
      ],
    });

    const getMessage = message('get-data', 'service', 'dto', 'synchronous');
    const candidateWithGet: SequenceDiagramContent = {
      ...baseContent,
      items: [...baseContent.items, getMessage],
    };

    const mutation = applySequenceDiagramMutation(baseContent, candidateWithGet);
    expect(mutation.accepted).toBe(true);
    expect(mutation.newProblems).toHaveLength(0);

    const semantics = analyzeSequenceDiagramSemantics(mutation.content);
    expect(semantics.validMessageIds.has('get-data')).toBe(true);
    expect(semantics.problems.filter((p) => p.severity === 'error')).toHaveLength(0);

    const layout = buildSequenceLayout(mutation.content);
    const slots = buildSequenceKeyboardInsertionSlots(mutation.content, layout);
    const aliveSlot = getSequenceParticipantIdsAliveAtSlot(mutation.content, layout, slots[slots.length - 1]);
    expect(aliveSlot).toContain('dto');
    expect(layout.messageLayouts.has('get-data')).toBe(true);
  });

  it('allows calling a DTO inside a loop after its conditional creation', () => {
    const service = participant('service', 120);
    const dto = participant('dto', 380);
    const baseContent = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [service, dto],
      items: [
        {
          id: 'loop-search',
          kind: 'fragment',
          operator: 'loop',
          name: 'Loop',
          operands: [
            {
              id: 'loop-op',
              guard: 'para cada elemento',
              items: [
                {
                  id: 'opt-match',
                  kind: 'fragment',
                  operator: 'opt',
                  name: 'Opt',
                  operands: [
                    {
                      id: 'opt-op',
                      guard: 'cumple criterio',
                      items: [
                        message('create-dto', 'service', 'dto', 'create'),
                      ],
                    },
                  ],
                } satisfies SequenceFragment,
                message('set-after-opt', 'service', 'dto', 'synchronous'),
              ],
            },
          ],
        } satisfies SequenceFragment,
      ],
    });

    const mutation = applySequenceDiagramMutation(createEmptySequenceDiagramContent(), baseContent);
    expect(mutation.accepted).toBe(true);
    expect(mutation.newProblems).toHaveLength(0);

    const semantics = analyzeSequenceDiagramSemantics(mutation.content);
    expect(semantics.validMessageIds.has('set-after-opt')).toBe(true);
    expect(semantics.problems).toContainEqual(expect.objectContaining({
      code: 'conditional-participant-lifecycle',
      severity: 'warning',
      messageId: 'set-after-opt',
    }));
  });
});
