import { useEffect, useRef, type FormEvent } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import type { SequenceMessage, SequenceMessageType, SequenceParticipant } from '../types/diagram';
import { formatSequenceMessageLabel, formatSequenceParticipantName } from '../utils/sequenceDiagram';

export type QuickMessageDraft = {
  sourceId: string; targetId: string; y: number; name: string; type: SequenceMessageType; editId?: string;
  arguments: string; parameterValues: string; returnType: string;
};

export const messageDraftFields = (message?: SequenceMessage) => ({
  arguments: message?.arguments ?? '',
  parameterValues: message?.parameterValues ?? '',
  returnType: message?.returnType ?? '',
});

export const quickMessageValues = (draft: QuickMessageDraft) => {
  const values = draft.parameterValues || draft.arguments;
  const noArgsOrReturn = draft.type === 'return' || draft.type === 'destroy';
  return {
    name: draft.name.trim() || (draft.type === 'create' ? 'create' : draft.type === 'destroy' ? 'destroy' : ''),
    type: draft.type,
    arguments: noArgsOrReturn ? '' : draft.parameterValues ? draft.arguments : values,
    parameterValues: noArgsOrReturn ? '' : draft.parameterValues ? values : '',
    returnType: noArgsOrReturn ? '' : draft.returnType.trim(),
  };
};

export function SequenceMessageDialog({ draft, participants, methodOptions, onChange, onSubmit, onCancel }: {
  draft: QuickMessageDraft;
  participants: SequenceParticipant[];
  methodOptions?: Array<{ id: string; label: string; name: string; parameters: string; returnType: string }>;
  onChange: (draft: QuickMessageDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  const values = quickMessageValues(draft);
  const preview = formatSequenceMessageLabel({ ...values, id: '', kind: 'message', sourceId: draft.sourceId, targetId: draft.targetId, flowReference: '' });
  const participantName = (id: string) => participants.filter((participant) => participant.id === id).map(formatSequenceParticipantName).join('') || 'Participante no disponible';
  const types: Record<SequenceMessageType, string> = { synchronous: 'Llamada síncrona', asynchronous: 'Llamada asíncrona', return: 'Retorno', create: 'create() · Crear objeto / DTO', destroy: 'Destruir objeto' };
  return <dialog className="sequence-message-dialog" ref={ref} onClick={(event) => { if (event.target === ref.current) onCancel(); }} onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <form onSubmit={onSubmit} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.requestSubmit(); } }}>
      <header><div><small>DIAGRAMA DE SECUENCIA</small><h2>{draft.editId ? 'Editar mensaje' : 'Nuevo mensaje'}</h2></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={onCancel}><X size={18} /></button></header>
      <div className="sequence-quick-route"><span title={participantName(draft.sourceId)}>{participantName(draft.sourceId)}</span><button type="button" className="sequence-swap-direction-btn" title="Invertir dirección (origen ↔ destino)" onClick={() => onChange({ ...draft, sourceId: draft.targetId, targetId: draft.sourceId })}><ArrowLeftRight size={13} /></button><span title={participantName(draft.targetId)}>{participantName(draft.targetId)}</span></div>
      <label><span>Tipo de mensaje</span><select value={draft.type} disabled={draft.type === 'create'} title={draft.type === 'create' ? 'El tipo create() se gestiona al crear el mensaje' : undefined} onChange={(event) => onChange({ ...draft, type: event.target.value as SequenceMessageType })}>{Object.entries(types).filter(([type]) => type === draft.type || (type !== 'destroy' && type !== 'create')).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {draft.type === 'return' ? (
        <p className="sequence-dialog-help">El retorno se representa con una flecha discontinua y cierra la activación de la llamada correspondiente.</p>
      ) : draft.type === 'destroy' ? (
        <>
          <label><span>Operación</span><input autoFocus value={draft.name} placeholder="destroy" onChange={(event) => onChange({ ...draft, name: event.target.value })} /></label>
          <p className="sequence-dialog-help">Destruye la línea de vida del objeto en este punto del diagrama.</p>
        </>
      ) : (
        <>
          {methodOptions && methodOptions.length > 0 ? (
            <label>
              <span>Método vinculado</span>
              <select
                defaultValue=""
                onChange={(event) => {
                  const method = methodOptions.find((candidate) => candidate.id === event.target.value);
                  if (method) onChange({ ...draft, name: method.name, arguments: method.parameters, parameterValues: '', returnType: method.returnType });
                }}
              >
                <option value="">Elegir método de la clase destino...</option>
                {methodOptions.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.label} {method.returnType ? `: ${method.returnType}` : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label><span>Operación</span><input autoFocus value={draft.name} placeholder={draft.type === 'create' ? 'create' : 'Ej.: buscar, registrarTrámite'} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></label>
          <label><span>Argumentos / parámetros</span><textarea rows={2} value={draft.parameterValues || draft.arguments} placeholder="codClienteEnSesion, nombre" onChange={(event) => onChange(draft.parameterValues ? { ...draft, parameterValues: event.target.value, arguments: event.target.value === '' ? '' : draft.arguments } : { ...draft, arguments: event.target.value })} /></label>
          <label><span>Tipo devuelto</span><input value={draft.returnType} placeholder="Ej.: List<Object>, String, int, void" onChange={(event) => onChange({ ...draft, returnType: event.target.value })} /></label>
        </>
      )}
      <section className="sequence-message-preview"><small>ASÍ SE VERÁ EN EL DIAGRAMA</small><p>{draft.type === 'return' ? '← Retorno sin etiqueta' : preview}</p></section>
      <footer><small>⌘ / Ctrl + Enter para guardar</small><button type="button" className="secondary-action" onClick={onCancel}>Cancelar</button><button className="primary-action" type="submit">{draft.editId ? 'Guardar cambios' : 'Crear mensaje'}</button></footer>
    </form>
  </dialog>;
}
