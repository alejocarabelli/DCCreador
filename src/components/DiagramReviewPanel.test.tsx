import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DiagramReviewPanel } from './DiagramReviewPanel';

describe('DiagramReviewPanel', () => {
  it('uses one text for "no problems" and another for an empty artifact', () => {
    const clean = renderToString(<DiagramReviewPanel issues={[]} onClose={vi.fn()} onFocus={vi.fn()} />);
    const empty = renderToString(<DiagramReviewPanel isEmpty issues={[]} onClose={vi.fn()} onFocus={vi.fn()} />);
    expect(clean).toContain('Sin problemas en las comprobaciones automáticas.');
    expect(empty).toContain('Todavía no hay nada para revisar.');
  });

  it('counts errors and warnings and shows friendly labels only', () => {
    const html = renderToString(<DiagramReviewPanel
      issues={[{ id: 'a', kind: 'error', message: 'Uno' }, { id: 'b', kind: 'review', message: 'Dos' }, { id: 'c', kind: 'review', message: 'Tres' }]}
      onClose={vi.fn()} onFocus={vi.fn()} />);
    const text = html.replace(/<!--.*?-->/g, '');
    expect(text).toContain('1 error');
    expect(text).toContain('2 avisos');
    expect(html).toContain('Error');
    expect(html).toContain('Revisar');
  });
});

describe('DiagramReviewPanel focus and Escape', () => {
  it('makes the panel itself focusable so Escape can reach it', () => {
    const html = renderToString(<DiagramReviewPanel issues={[]} onClose={vi.fn()} onFocus={vi.fn()} />);
    expect(html).toMatch(/<section[^>]*tabindex="-1"/);
  });
});
