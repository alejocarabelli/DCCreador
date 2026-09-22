import { describe, expect, it } from 'vitest';
import { projectInitials } from './projectInitials';

describe('projectInitials', () => {
  it('skips connectives so "Sistema de …" projects stay distinguishable', () => {
    expect(projectInitials('Sistema de Biblioteca')).toBe('SB');
    expect(projectInitials('Sistema de Gestión de Turnos')).toBe('ST');
    expect(projectInitials('Proyecto Cierre Final')).toBe('PF');
  });

  it('handles single words, only-connective names and empty names', () => {
    expect(projectInitials('biblioteca')).toBe('BI');
    expect(projectInitials('de la')).toBe('DL');
    expect(projectInitials('   ')).toBe('—');
  });
});
