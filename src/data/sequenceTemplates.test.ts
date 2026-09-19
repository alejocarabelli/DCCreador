import { describe, expect, it } from 'vitest';
import { SEQUENCE_TEMPLATES, instantiateSequenceTemplate } from './sequenceTemplates';
import { normalizeSequenceDiagramContent } from '../utils/sequenceDiagram';

describe('sequenceTemplates', () => {
  it('contains predefined educational templates', () => {
    expect(SEQUENCE_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    const ids = SEQUENCE_TEMPLATES.map((t) => t.id);
    expect(ids).toContain('auth-jwt');
    expect(ids).toContain('order-processing');
    expect(ids).toContain('interaction-ref');
  });

  it('instantiates valid content for every template with unique IDs', () => {
    SEQUENCE_TEMPLATES.forEach((template) => {
      const content = instantiateSequenceTemplate(template.id);
      expect(content).not.toBeNull();
      if (!content) return;

      const normalized = normalizeSequenceDiagramContent(content);
      expect(normalized.participants.length).toBeGreaterThan(0);
      expect(normalized.items.length).toBeGreaterThan(0);
      expect(normalized.problems.filter((problem) => problem.code === 'normalization-repair')).toEqual([]);
      expect(normalizeSequenceDiagramContent(normalized)).toEqual(normalized);

      // Verify IDs are unique across two instantiations
      const secondInstance = instantiateSequenceTemplate(template.id);
      expect(secondInstance).not.toBeNull();
      if (!secondInstance) return;

      const firstIds = content.participants.map((p) => p.id);
      const secondIds = secondInstance.participants.map((p) => p.id);
      firstIds.forEach((id) => {
        expect(secondIds).not.toContain(id);
      });
    });
  });

  it('returns null for unknown template id', () => {
    expect(instantiateSequenceTemplate('nonexistent-id')).toBeNull();
  });
});
