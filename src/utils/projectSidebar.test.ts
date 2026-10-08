import { describe, expect, it } from 'vitest';
import { clampSplitFraction, filterProjectsByName, formatShortProjectDate, normalizeSearchText, shouldShowProjectFilter, SIDEBAR_PANE_MIN_HEIGHT, sortProjectsByRecency, splitBounds } from './projectSidebar';

const project = (id: string, updatedAt: string, name = id) => ({ id, name, updatedAt });

describe('sortProjectsByRecency', () => {
  const projects = [
    project('a', '2026-09-01T10:00:00.000Z'),
    project('b', '2026-10-05T10:00:00.000Z'),
    project('c', '2026-09-20T10:00:00.000Z'),
  ];

  it('puts the most recently updated first', () => {
    expect(sortProjectsByRecency(projects).map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('leaves out the open project', () => {
    expect(sortProjectsByRecency(projects, 'b').map((p) => p.id)).toEqual(['c', 'a']);
  });

  it('keeps the original order on ties and sinks unreadable dates', () => {
    const tied = [
      project('x', '2026-09-01T00:00:00.000Z'),
      project('broken', 'not a date'),
      project('y', '2026-09-01T00:00:00.000Z'),
    ];
    expect(sortProjectsByRecency(tied).map((p) => p.id)).toEqual(['x', 'y', 'broken']);
  });

  it('does not mutate its input', () => {
    const copy = [...projects];
    sortProjectsByRecency(projects);
    expect(projects).toEqual(copy);
  });
});

describe('filterProjectsByName', () => {
  const projects = [
    project('1', '', 'Licitación y adjudicación de obras'),
    project('2', '', 'Programacion de turnos'),
    project('3', '', 'Cañería'),
  ];

  it('ignores case and accents in both the name and the query', () => {
    expect(filterProjectsByName(projects, 'LICITACION').map((p) => p.id)).toEqual(['1']);
    expect(filterProjectsByName(projects, 'programación').map((p) => p.id)).toEqual(['2']);
    expect(filterProjectsByName(projects, 'canieria')).toEqual([]);
    expect(filterProjectsByName(projects, 'cañ').map((p) => p.id)).toEqual(['3']);
  });

  it('matches substrings anywhere in the name', () => {
    expect(filterProjectsByName(projects, 'de obras').map((p) => p.id)).toEqual(['1']);
  });

  it('returns everything for an empty or blank query and nothing for a miss', () => {
    expect(filterProjectsByName(projects, '')).toHaveLength(3);
    expect(filterProjectsByName(projects, '   ')).toHaveLength(3);
    expect(filterProjectsByName(projects, 'zzz')).toEqual([]);
  });

  it('normalises text', () => {
    expect(normalizeSearchText('  Álvaro Ñandú ')).toBe('alvaro nandu');
  });
});

describe('shouldShowProjectFilter', () => {
  it('shows the field only past six projects', () => {
    expect(shouldShowProjectFilter(6)).toBe(false);
    expect(shouldShowProjectFilter(7)).toBe(true);
  });
});

describe('split sizing', () => {
  it('keeps both panes at three rows or more', () => {
    const available = 600;
    const { max, min } = splitBounds(available);
    expect(min * available).toBeCloseTo(SIDEBAR_PANE_MIN_HEIGHT);
    expect((1 - max) * available).toBeCloseTo(SIDEBAR_PANE_MIN_HEIGHT);
    expect(clampSplitFraction(0.01, available)).toBeCloseTo(min);
    expect(clampSplitFraction(0.99, available)).toBeCloseTo(max);
    expect(clampSplitFraction(0.5, available)).toBe(0.5);
  });

  it('centres the split when there is no room for two minimum panes', () => {
    expect(clampSplitFraction(0.9, SIDEBAR_PANE_MIN_HEIGHT * 2 - 1)).toBe(0.5);
    expect(clampSplitFraction(0.2, 0)).toBe(0.5);
  });

  it('falls back to the middle for garbage', () => {
    expect(clampSplitFraction(Number.NaN, 600)).toBe(0.5);
  });
});

describe('formatShortProjectDate', () => {
  const now = new Date(2026, 9, 8, 19, 0);
  it('says hoy and ayer, then a short day and month', () => {
    expect(formatShortProjectDate(new Date(2026, 9, 8, 6, 12).toISOString(), now)).toBe('hoy');
    expect(formatShortProjectDate(new Date(2026, 9, 7, 23, 59).toISOString(), now)).toBe('ayer');
    expect(formatShortProjectDate(new Date(2026, 9, 5, 12).toISOString(), now)).toMatch(/^5 oct$/);
  });

  it('adds the year only for another year, and stays empty for a bad date', () => {
    expect(formatShortProjectDate(new Date(2025, 11, 20, 12).toISOString(), now)).toMatch(/^20 dic 2025$/);
    expect(formatShortProjectDate('no es fecha', now)).toBe('');
  });
});
