import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SequenceDiagramCanvas } from '../components/SequenceDiagramCanvas';
import { themes } from '../theme/themes';
import type { SequenceDiagramContent, SequenceMessage, SequenceParticipant } from '../types/diagram';
import { analyzeSequenceDiagramSemantics, applySequenceDiagramMutation, normalizeSequenceDiagramContent } from './sequenceDiagram';
import { buildSequenceLayout } from './sequenceDiagramLayout';

const makeDiagram = (messageCount: number, participantCount = 20, singleRoute = false): SequenceDiagramContent => {
  const participants: SequenceParticipant[] = Array.from({ length: participantCount }, (_, index) => ({
    id: `p-${index}`,
    kind: 'object',
    name: `p${index}`,
    classifierName: `Participant${index}`,
    x: 120 + index * 210,
  }));
  const items: SequenceMessage[] = Array.from({ length: messageCount }, (_, index) => ({
    id: `m-${index}`,
    kind: 'message',
    type: 'synchronous',
    sourceId: singleRoute ? participants[0].id : participants[index % participantCount].id,
    targetId: singleRoute ? participants[1].id : participants[(index + 1) % participantCount].id,
    name: `operation${index}`,
    arguments: 'value',
    parameterValues: '',
    returnType: 'Result',
    flowReference: '',
  }));
  return {
    version: 1,
    numbering: 'sequential',
    showActivations: true,
    participantColors: 'automatic',
    participants,
    items,
    activations: [],
    problems: [],
    notes: [],
    canvas: { width: 4800, height: Math.max(1800, messageCount * 76) },
  };
};

const medianTime = (run: () => void, iterations = 5): number => {
  run();
  const samples = Array.from({ length: iterations }, () => {
    const started = performance.now();
    run();
    return performance.now() - started;
  }).sort((left, right) => left - right);
  return samples[Math.floor(samples.length / 2)];
};

describe('sequence diagram performance regressions', () => {
  it('reuses semantic activations in layout without changing geometry', () => {
    const content = normalizeSequenceDiagramContent(makeDiagram(120));
    const regular = buildSequenceLayout(content);
    const reused = buildSequenceLayout(content, analyzeSequenceDiagramSemantics(content));

    expect(reused.activationLayouts).toEqual(regular.activationLayouts);
    expect(reused.messageLayouts).toEqual(regular.messageLayouts);
    expect(reused.bounds).toEqual(regular.bounds);
  });

  it('keeps synchronous semantic analysis near-linear as messages scale', () => {
    const small = makeDiagram(800, 2, true);
    const large = makeDiagram(3200, 2, true);
    const smallMs = medianTime(() => { analyzeSequenceDiagramSemantics(small); });
    const largeMs = medianTime(() => { analyzeSequenceDiagramSemantics(large); });
    const asyncLarge = {
      ...large,
      items: large.items.map((item) => item.kind === 'message' ? { ...item, type: 'asynchronous' as const } : item),
    };
    const asyncLargeMs = medianTime(() => { analyzeSequenceDiagramSemantics(asyncLarge); });
    const ratio = largeMs / Math.max(0.01, smallMs);
    const syncSlowdown = largeMs / Math.max(0.01, asyncLargeMs);

    console.table([{ scenario: 'sync semantics', smallMessages: 800, smallMs, largeMessages: 3200, largeMs, asyncLargeMs, ratio, syncSlowdown }]);
    expect(ratio).toBeLessThan(8);
    expect(syncSlowdown).toBeLessThan(10);
  });

  it('records representative model and SVG costs without changing semantics', () => {
    const rows = [100, 500, 1000].map((messages) => {
      const raw = makeDiagram(messages);
      const normalizationMs = medianTime(() => { normalizeSequenceDiagramContent(raw); }, 3);
      const normalized = normalizeSequenceDiagramContent(raw);
      analyzeSequenceDiagramSemantics(normalized);
      const layoutMs = medianTime(() => { buildSequenceLayout(normalized); }, 3);
      const layout = buildSequenceLayout(normalized);
      const mutationMs = medianTime(() => {
        applySequenceDiagramMutation(normalized, {
          ...normalized,
          items: normalized.items.map((item, index) => index === normalized.items.length - 1 && item.kind === 'message'
            ? { ...item, name: `${item.name}-edited` }
            : item),
        });
      }, 3);
      const markup = renderToStaticMarkup(
        <SequenceDiagramCanvas
          content={normalized}
          layout={layout}
          selected={null}
          interactive={false}
          theme={themes[0]}
          onSelect={() => undefined}
          onParticipantPointerDown={() => undefined}
          onNotePointerDown={() => undefined}
          onNoteResizePointerDown={() => undefined}
        />,
      );
      return {
        messages,
        normalizationMs: Number(normalizationMs.toFixed(2)),
        layoutMs: Number(layoutMs.toFixed(2)),
        mutationMs: Number(mutationMs.toFixed(2)),
        svgNodes: (markup.match(/<[^/!][^>]*>/g) ?? []).length,
        svgKB: Number((new TextEncoder().encode(markup).length / 1024).toFixed(1)),
      };
    });
    console.table(rows);
    expect(rows.every((row) => row.svgNodes > row.messages)).toBe(true);
  });
});
