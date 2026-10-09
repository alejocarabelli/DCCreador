import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DiagramSelectionTools } from './DiagramSelectionTools';

const render = (count: number) => renderToString(
  <DiagramSelectionTools count={count} onArrange={vi.fn()} onDuplicate={vi.fn()} onSelectAll={vi.fn()} />,
);

describe('DiagramSelectionTools', () => {
  it('names the count only when more than one class is selected', () => {
    expect(render(3)).toContain('Organizar 3 clases');
    expect(render(2)).toContain('Organizar 2 clases');
    expect(render(1)).toContain('>Organizar<');
    expect(render(0)).toContain('>Organizar<');
  });
});
