import { describe, expect, it } from 'vitest';
import {
  applySignatureCompletion,
  collectUsedConditionValues,
  getSignatureCompletion,
  methodInsertText,
  normalizeSignatureQuotes,
  type SignatureCompletionData,
} from './sequenceSignatureCompletion';
import { parseMessageSignature } from './sequenceMessageEditing';

const data: SignatureCompletionData = {
  classes: [
    { name: 'Articulo', attributes: [{ name: 'codigo', type: 'int' }, { name: 'nombre', type: 'String' }, { name: 'stockActual', type: 'int' }], roles: [] },
    { name: 'Reposicion', attributes: [{ name: 'fecha', type: 'Date' }, { name: 'numero', type: 'int' }], roles: ['estado', 'detalleReposicionList'] },
    { name: 'Estado', attributes: [{ name: 'codigo', type: 'int' }, { name: 'nombre', type: 'String' }], roles: [] },
  ],
  instanceNames: ['estado', 'detalleReposicion', 'articulo1'],
  usedValues: { 'estado|nombre': ["'Creada'", "'Cerrada'"] },
  returnType: 'List<Object>',
};

const at = (text: string) => getSignatureCompletion(text, text.length, data);
const texts = (text: string) => at(text)?.options.map((option) => option.text);

describe('getSignatureCompletion', () => {
  it('suggests only classes in the first quoted string', () => {
    expect(texts('buscar("')).toEqual(['Articulo', 'Reposicion', 'Estado']);
    expect(texts('buscar("Ar')).toEqual(['Articulo']);
    expect(at('buscar("Ar')?.kind).toBe('class');
  });

  it('suggests attributes of the searched class only', () => {
    expect(texts('buscar("Articulo", "')).toEqual(['codigo', 'nombre', 'stockActual']);
    expect(texts('buscar("Articulo", "st')).toEqual(['stockActual']);
    expect(texts('buscar("Reposicion", "')).toEqual(['fecha', 'numero', 'estado', 'detalleReposicionList']);
  });

  it('suggests operators after an attribute, then connectors after a value', () => {
    expect(at('buscar("Articulo", "codigo ')?.kind).toBe('operator');
    expect(texts('buscar("Articulo", "codigo ')).toContain('contains');
    expect(texts('buscar("Articulo", "codigo con')).toEqual(['contains']);
    expect(texts('buscar("Articulo", "codigo = 5 ')).toEqual(['AND', 'OR']);
    expect(texts('buscar("Articulo", "codigo < 10 A')).toEqual(['AND']);
    expect(texts('buscar("Articulo", "codigo < 10 AND st')).toEqual(['stockActual']);
  });

  it('offers nothing while a plain value is being typed', () => {
    expect(texts('buscar("Articulo", "codigo = 5')).toEqual([]);
  });

  it('remembers values used before for the same class and attribute', () => {
    expect(texts('buscar("Estado", "nombre = ')).toEqual(["'Creada'", "'Cerrada'"]);
    expect(texts('buscar("Estado", "nombre = \'Cr')).toEqual(["'Creada'"]);
    expect(texts('buscar("Reposicion", "estado = ')).toEqual([]);
    expect(texts('buscar("Estado", "nombre = \'Creada\'')).toEqual([]);
  });

  it('suggests participants outside the quotes and toString after a dot', () => {
    expect(texts('buscar("Reposicion", "estado = "+')).toEqual(['estado', 'detalleReposicion', 'articulo1']);
    expect(texts('buscar("Reposicion", "estado = "+est')).toEqual(['estado']);
    expect(texts('buscar("Reposicion", "estado = "+estado.')).toEqual(['toString()']);
    expect(texts('guardar(art')).toEqual(['articulo1']);
  });

  it('offers the return type after "):"', () => {
    expect(texts('buscar("Articulo", "codigo = 5"):')).toEqual(['List<Object>']);
    expect(texts('buscar("Articulo", "codigo = 5"): Li')).toEqual(['List<Object>']);
  });

  it('works with the caret in the middle of the text', () => {
    const text = 'buscar("Art", "codigo = 5")';
    const result = getSignatureCompletion(text, 10, data);
    expect(result?.kind).toBe('class');
    expect(result?.options.map((option) => option.text)).toEqual(['Articulo']);
  });
});

describe('applySignatureCompletion', () => {
  it('continues from the class into the condition string', () => {
    const text = 'buscar("Ar';
    const completion = at(text)!;
    const applied = applySignatureCompletion(text, completion, completion.options[0]);
    expect(applied.text).toBe('buscar("Articulo", "');
    expect(applied.caret).toBe(applied.text.length);
  });

  it('replaces only the token under the caret', () => {
    const text = 'buscar("Articulo", "co = 5")';
    const completion = getSignatureCompletion(text, 22, data)!;
    const applied = applySignatureCompletion(text, completion, completion.options[0]);
    expect(applied.text).toBe('buscar("Articulo", "codigo  = 5")');
  });
});

describe('signature helpers', () => {
  it('inserts buscar and guardar ready to type the strings', () => {
    expect(methodInsertText({ name: 'buscar', parameters: 'String, String', returnType: 'List<Object>' })).toBe('buscar("');
    expect(methodInsertText({ name: 'guardar', parameters: 'Object', returnType: 'void' })).toBe('guardar(');
    expect(methodInsertText({ name: 'setCodigo', parameters: 'int', returnType: 'void' })).toBe('setCodigo(int): void');
  });

  it('turns smart quotes back into straight ones', () => {
    expect(normalizeSignatureQuotes('buscar(“Estado”, “nombre = ‘Creada’”)')).toBe('buscar("Estado", "nombre = \'Creada\'")');
  });

  it('round-trips the calls of the course document through the signature parser', () => {
    for (const call of [
      'buscar("Reposicion", "")',
      'buscar("Articulo", "codigo = 5")',
      'buscar("Articulo", "codigo ="+codArticulo)',
      'buscar("Articulo", "codigo < 10 AND stockActual > 20")',
      'buscar("Estado", "nombre = \'Creada\'")',
      'buscar("Reposicion", "estado = "+estado.toString())',
      'buscar("Reposicion", "detalleReposicionList contains "+detalleReposicion.toString())',
    ]) {
      const parsed = parseMessageSignature(`${call}: List<Object>`);
      expect(parsed).toEqual({ name: 'buscar', arguments: call.slice('buscar('.length, -1), returnType: 'List<Object>' });
    }
  });

  it('collects the values used in earlier searches', () => {
    const used = collectUsedConditionValues([[
      { kind: 'message', name: 'buscar', arguments: '"Estado", "nombre = \'Creada\'"', parameterValues: '' },
      { kind: 'fragment', operands: [{ items: [{ kind: 'message', name: 'buscar', arguments: '"Articulo", "codigo = 5 AND nombre = \'x\'"', parameterValues: '' }] }] },
    ]]);
    expect(used['estado|nombre']).toEqual(["'Creada'"]);
    expect(used['articulo|codigo']).toEqual(['5']);
    expect(used['articulo|nombre']).toEqual(["'x'"]);
  });
});
