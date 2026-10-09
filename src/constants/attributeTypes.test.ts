import { describe, expect, it } from 'vitest';
import { suggestionWithTypedCase, typeInputWithTypedCase } from './attributeTypes';

describe('suggestionWithTypedCase', () => {
  it('keeps the capital letter the user typed', () => {
    expect(suggestionWithTypedCase('Str', 'string')).toBe('String');
    expect(suggestionWithTypedCase('Da', 'date')).toBe('Date');
    expect(suggestionWithTypedCase('D', 'datetime')).toBe('Datetime');
  });

  it('keeps lowercase when the user typed lowercase', () => {
    expect(suggestionWithTypedCase('str', 'string')).toBe('string');
    expect(suggestionWithTypedCase('sTR', 'string')).toBe('string');
  });

  it('suggests the plain form before anything is typed', () => {
    expect(suggestionWithTypedCase('', 'string')).toBe('string');
    expect(suggestionWithTypedCase('   ', 'int')).toBe('int');
  });
});

describe('typeInputWithTypedCase', () => {
  it('turns a picked suggestion into the capitalization already typed', () => {
    expect(typeInputWithTypedCase('Str', 'string')).toBe('String');
    expect(typeInputWithTypedCase('Strin', 'String')).toBe('String');
  });

  it('leaves a lowercase value alone when the user typed lowercase', () => {
    expect(typeInputWithTypedCase('str', 'string')).toBe('string');
  });

  it('never changes a value that is not a suggestion or has extra characters', () => {
    expect(typeInputWithTypedCase('Estado', 'EstadoTramite')).toBe('EstadoTramite');
    expect(typeInputWithTypedCase('Int', 'int ')).toBe('int ');
    expect(typeInputWithTypedCase('Int', 'Integer')).toBe('Integer');
  });
});

describe('typeInputWithTypedCase while typing', () => {
  it('keeps every letter the user types, even in capitals', () => {
    expect(typeInputWithTypedCase('STRIN', 'STRING')).toBe('STRING');
    expect(typeInputWithTypedCase('strin', 'string')).toBe('string');
  });
});
