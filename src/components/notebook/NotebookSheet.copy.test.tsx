import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NotebookSheet } from './NotebookSheet';
import { NotebookTextField } from './NotebookTextField';
import { MAX_TEXT_LENGTH } from '../../utils/artifactNotebook';

describe('notebook notices', () => {
  it('explains which exports include the notes', () => {
    const html = renderToStaticMarkup(<NotebookSheet artifactName="Clases" notebook={undefined} onCommit={() => undefined} onClose={() => undefined} onReturnFocus={() => undefined} width={360} onWidthChange={() => undefined} saveFailed={false} focusRequest={0} />);
    expect(html).toContain('No aparecen en PDF ni Word. Sí van en los archivos .json exportados.');
    expect(html).not.toContain('Solo para vos');
  });

  it('shows a discreet status when existing text reaches or exceeds the limit', () => {
    for (const length of [MAX_TEXT_LENGTH, MAX_TEXT_LENGTH + 3]) {
      const text = 'a'.repeat(length);
      const html = renderToStaticMarkup(<NotebookTextField value={text} onValueChange={() => undefined} />);
      expect(html).toContain('role="status"');
      expect(html).toContain('Llegaste al máximo de texto.');
      expect(html).toContain(text);
    }
  });
});
