import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SequenceMessageDialog, quickMessageValues } from './SequenceMessageDialog';
import type { SequenceParticipant } from '../types/diagram';
import { createSequenceMessageEditModel } from '../utils/sequenceMessageEditing';

const participants: SequenceParticipant[] = [
  { id: 'src', kind: 'object', name: 'ui', classifierName: 'UIActualizar', x: 100 },
  { id: 'tgt', kind: 'object', name: 'ctrl', classifierName: 'Controlador', x: 350 },
];

describe('SequenceMessageDialog', () => {
  it('renders the minimalist redesign with route bar, swap button, textarea, pills and action buttons', () => {
    const draft = createSequenceMessageEditModel({
      editId: 'msg-1',
      sourceId: 'src',
      targetId: 'tgt',
      name: 'comprobarConsultorInstanciado',
      arguments: 'codCliente, fechaInicio, estadoVigente, tokenSesion',
      returnType: 'ResultadoValidacion',
      type: 'synchronous',
    });

    const html = renderToString(
      <SequenceMessageDialog
        draft={draft}
        participants={participants}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Header
    expect(html).toContain('Editar mensaje');

    // Route bar with participants and swap button
    expect(html).toContain('UIActualizar');
    expect(html).toContain('Controlador');
    expect(html).toContain('invertir');

    // Multi-line auto-wrapping textarea with rows="3" and complete signature
    expect(html).toContain('rows="3"');
    expect(html).toContain('comprobarConsultorInstanciado(codCliente, fechaInicio, estadoVigente, tokenSesion): ResultadoValidacion');
    expect(html).toContain('Ajuste automático de líneas · Enter para guardar');

    // Clean segmented type selector pills
    expect(html).toContain('Síncrono');
    expect(html).toContain('Asíncrono');
    expect(html).toContain('Retorno');
    expect(html).toContain('Crear');

    // Actions
    expect(html).toContain('Esc cancelar · Enter guardar');
    expect(html).toContain('Cancelar');
    expect(html).toContain('Guardar');
  });

  it('renders a textless return without offering input that persistence discards', () => {
    const draft = createSequenceMessageEditModel({
      sourceId: 'src',
      targetId: 'tgt',
      type: 'return',
      returnType: 'ResultadoValidacion',
    });

    const html = renderToString(
      <SequenceMessageDialog
        draft={draft}
        participants={participants}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(html).toContain('Nuevo mensaje');
    expect(html).toContain('El retorno se representa con una flecha discontinua');
    expect(html).not.toContain('sequence-message-dialog-textarea');
    expect(html).not.toContain('ResultadoValidacion');
    expect(html).toContain('Crear mensaje');
  });

  it('renders destroy message pill when type is destroy', () => {
    const draft = createSequenceMessageEditModel({
      sourceId: 'src',
      targetId: 'tgt',
      type: 'destroy',
      name: 'destroy',
    });

    const html = renderToString(
      <SequenceMessageDialog
        draft={draft}
        participants={participants}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(html).toContain('Destruir');
    expect(html).toContain('destroy');
  });

  it('renders linked method options and flow references when provided', () => {
    const draft = createSequenceMessageEditModel({
      editId: 'msg-1',
      sourceId: 'src',
      targetId: 'tgt',
      type: 'synchronous',
      name: 'validar',
      operationMethodId: 'm1',
      flowReference: '1.1',
    });

    const html = renderToString(
      <SequenceMessageDialog
        draft={draft}
        participants={participants}
        methodOptions={[{ id: 'm1', label: 'Controlador.validar', name: 'validar', parameters: 'token', returnType: 'boolean', participantId: 'tgt' }]}
        flowOptions={[{ value: '1.1', label: '1.1 · Iniciar sesión', flowId: 'f1', stepId: 's1' }]}
        referenceStatus={{ method: 'available', flow: 'available' }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(html).toContain('Método vinculado');
    expect(html).toContain('Controlador.validar');
    expect(html).toContain('Referencia al flujo');
    expect(html).toContain('1.1 · Iniciar sesión');
  });

  it('keeps compatibility wrapper quickMessageValues functioning', () => {
    const values = quickMessageValues({
      sourceId: 'tgt',
      targetId: 'src',
      y: 200,
      name: 'validar',
      type: 'synchronous',
      arguments: 'token',
      parameterValues: '',
      returnType: 'boolean',
    });

    expect(values).toMatchObject({
      sourceId: 'tgt',
      targetId: 'src',
      name: 'validar',
      arguments: 'token',
      returnType: 'boolean',
    });
  });
});
