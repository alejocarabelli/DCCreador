import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import type { SequenceMessageType, SequenceParticipant } from '../types/diagram';
import {
  formatMessageSignature,
  parseMessageSignature,
  updateSequenceMessageEditModel,
  type SequenceFlowOption,
  type SequenceMethodOption,
  type SequenceMessageReferenceStatus,
} from '../utils/sequenceMessageEditing';
import { formatSequenceParticipantName } from '../utils/sequenceDiagram';
import type { QuickMessageDraft } from '../utils/sequenceMessageDialogCompatibility';

const formatSignatureFromDraft = formatMessageSignature;

export function SequenceMessageDialog({
  draft,
  participants,
  methodOptions = [],
  flowOptions = [],
  referenceStatus,
  onChange,
  onSwap,
  onSubmit,
  onCancel,
}: {
  draft: QuickMessageDraft;
  participants: SequenceParticipant[];
  methodOptions?: SequenceMethodOption[];
  flowOptions?: SequenceFlowOption[];
  referenceStatus?: SequenceMessageReferenceStatus;
  onChange: (draft: QuickMessageDraft) => void;
  onSwap?: () => void;
  onSubmit: (event: FormEvent, committedDraft?: QuickMessageDraft) => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [signatureText, setSignatureText] = useState(() => formatSignatureFromDraft(draft));
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);

  // While the name is being typed (nothing past it yet), offer the methods the
  // receiving class already has. Picking one links it and leaves the caret
  // inside the parentheses, since the values passed belong to this call.
  const methodSuggestions = useMemo(() => {
    if (draft.type !== 'synchronous' && draft.type !== 'asynchronous') return [];
    if (/[(:]/.test(signatureText)) return [];
    const query = signatureText.trim().toLocaleLowerCase();
    const matches = methodOptions.filter((method) => method.name.toLocaleLowerCase().includes(query));
    const ranked = [
      ...matches.filter((method) => method.name.toLocaleLowerCase().startsWith(query)),
      ...matches.filter((method) => !method.name.toLocaleLowerCase().startsWith(query)),
    ];
    return ranked.length === 1 && ranked[0].name === signatureText.trim() ? [] : ranked.slice(0, 6);
  }, [draft.type, methodOptions, signatureText]);
  const showSuggestions = !suggestionsDismissed && methodSuggestions.length > 0;
  const activeSuggestion = Math.min(suggestionIndex, methodSuggestions.length - 1);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const [prevEditId, setPrevEditId] = useState(draft.editId);
  if (draft.editId !== prevEditId) {
    setPrevEditId(draft.editId);
    setSignatureText(formatSignatureFromDraft(draft));
  }

  const participantName = (id: string): string =>
    participants.filter((p) => p.id === id).map(formatSequenceParticipantName).join('') || ':Participante';

  const commitDraft = (type = draft.type, text = signatureText): QuickMessageDraft => {
    if (type === 'return') {
      return updateSequenceMessageEditModel(draft, {
        type,
        returnType: '',
        name: '',
        arguments: '',
        parameterValues: '',
      });
    }
    if (type === 'destroy') {
      return updateSequenceMessageEditModel(draft, {
        type,
        name: text.trim() || 'destroy',
        arguments: '',
        parameterValues: '',
        returnType: '',
      });
    }
    const parsed = parseMessageSignature(text);
    return updateSequenceMessageEditModel(draft, {
      type,
      name: parsed.name,
      arguments: parsed.arguments,
      returnType: parsed.returnType,
    });
  };

  const handleTextChange = (newText: string) => {
    setSignatureText(newText);
    setSuggestionIndex(0);
    setSuggestionsDismissed(false);
    onChange(commitDraft(draft.type, newText));
  };

  const pickMethod = (method: SequenceMethodOption) => {
    const returnType = method.returnType.trim();
    const nextText = `${method.name}()${returnType ? `: ${returnType}` : ''}`;
    setSignatureText(nextText);
    onChange(updateSequenceMessageEditModel(draft, {
      operationMethodId: method.id,
      name: method.name,
      arguments: '',
      parameterValues: '',
      returnType,
    }));
    window.requestAnimationFrame(() => {
      const caret = method.name.length + 1;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(caret, caret);
    });
  };

  const handleTypeSelect = (newType: SequenceMessageType) => {
    if (newType === draft.type) return;
    if (newType === 'return') {
      setSignatureText('');
      onChange(commitDraft(newType, ''));
    } else if (newType === 'create') {
      const parsed = parseMessageSignature(signatureText);
      const name = parsed.name && parsed.name !== 'destroy' ? parsed.name : 'create';
      const args = parsed.arguments || draft.arguments || '';
      const nextText = args ? `${name}(${args})` : `${name}()`;
      setSignatureText(nextText);
      onChange(commitDraft(newType, nextText));
    } else if (newType === 'destroy') {
      const nextText = 'destroy';
      setSignatureText(nextText);
      onChange(commitDraft(newType, nextText));
    } else {
      // synchronous or asynchronous
      if (draft.type === 'return') {
        const name = draft.name || 'mensaje';
        const ret = signatureText.trim() || draft.returnType || '';
        const nextText = ret ? `${name}(): ${ret}` : `${name}()`;
        setSignatureText(nextText);
        onChange(commitDraft(newType, nextText));
      } else {
        onChange(updateSequenceMessageEditModel(draft, { type: newType }));
      }
    }
  };

  const handleSwap = () => {
    if (onSwap) {
      onSwap();
    } else {
      onChange(updateSequenceMessageEditModel(draft, {
        sourceId: draft.targetId,
        targetId: draft.sourceId,
      }));
    }
  };

  const triggerSubmit = () => {
    if (formRef.current) {
      if (typeof formRef.current.requestSubmit === 'function') {
        formRef.current.requestSubmit();
      } else {
        formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const finalDraft = commitDraft();
    onChange(finalDraft);
    onSubmit(event, finalDraft);
  };

  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      triggerSubmit();
    }
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setSuggestionIndex((activeSuggestion + step + methodSuggestions.length) % methodSuggestions.length);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setSuggestionsDismissed(true);
        return;
      }
      if ((event.key === 'Tab' || event.key === 'Enter') && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        event.stopPropagation();
        pickMethod(methodSuggestions[activeSuggestion]);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      triggerSubmit();
    }
  };

  const arrowSymbol = draft.type === 'return' ? '⇠' : draft.type === 'asynchronous' ? '⇢' : '➔';
  const methodMissing = referenceStatus?.method === 'missing' || (draft.operationMethodId !== undefined && !methodOptions.some((method) => method.id === draft.operationMethodId));
  const flowMissing = referenceStatus?.flow === 'missing' || referenceStatus?.flow === 'unavailable';

  return (
    <dialog
      aria-labelledby="sequence-message-dialog-title"
      className="sequence-message-dialog"
      ref={dialogRef}
      onClick={(event) => { if (event.target === dialogRef.current) onCancel(); }}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
    >
      <form ref={formRef} onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
        <header className="sequence-dialog-header">
          <h3 className="sequence-dialog-title" id="sequence-message-dialog-title">{draft.editId ? 'Editar mensaje' : 'Nuevo mensaje'}</h3>
          <button
            type="button"
            className="sequence-dialog-close-btn"
            aria-label="Cerrar"
            onClick={onCancel}
          >
            <X size={17} />
          </button>
        </header>

        {/* Route bar with swap button */}
        <div className="sequence-dialog-route-bar">
          <span className="sequence-dialog-route-participant" title={participantName(draft.sourceId)}>
            {participantName(draft.sourceId)}
          </span>
          <button
            type="button"
            className="sequence-dialog-swap-btn"
            onClick={handleSwap}
            title="Invertir dirección (origen ⇄ destino)"
            aria-label="Invertir dirección (origen y destino)"
          >
            <ArrowLeftRight size={13} />
            <span className="sequence-dialog-swap-arrow">{arrowSymbol}</span>
            <span className="sequence-dialog-swap-label">invertir</span>
          </button>
          <span className="sequence-dialog-route-participant" title={participantName(draft.targetId)}>
            {participantName(draft.targetId)}
          </span>
        </div>

        {/* Multi-line auto-wrapping text area */}
        {draft.type !== 'return' ? <div className="sequence-dialog-textarea-wrapper">
          <label className="sequence-dialog-textarea-label" htmlFor="sequence-message-dialog-textarea">
            Mensaje completo
          </label>
          <textarea
            id="sequence-message-dialog-textarea"
            ref={textareaRef}
            rows={3}
            value={signatureText}
            placeholder={
              draft.type === 'create'
                  ? 'create(parámetros) o nombre del objeto...'
                  : 'Escribí el mensaje o método con sus parámetros...'
            }
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            onBlur={() => setSuggestionsDismissed(true)}
            onFocus={() => setSuggestionsDismissed(false)}
            className="sequence-dialog-textarea"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
            aria-controls={showSuggestions ? 'sequence-dialog-method-suggestions' : undefined}
            aria-activedescendant={showSuggestions ? `sequence-dialog-method-${activeSuggestion}` : undefined}
          />
          {showSuggestions ? (
            <div className="sequence-dialog-suggestions" id="sequence-dialog-method-suggestions" role="listbox" aria-label="Métodos de la clase destino">
              {methodSuggestions.map((method, index) => (
                <button
                  aria-selected={index === activeSuggestion}
                  className={index === activeSuggestion ? 'active' : undefined}
                  id={`sequence-dialog-method-${index}`}
                  key={method.id}
                  role="option"
                  tabIndex={-1}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pickMethod(method)}
                >
                  <span className="sequence-dialog-suggestion-name">{method.name}({method.parameters})</span>
                  {method.returnType ? <span className="sequence-dialog-suggestion-type">{method.returnType}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
          <span className="sequence-dialog-textarea-hint">{showSuggestions ? '↑↓ para elegir · Enter o Tab usa el método · Esc para escribir libre' : 'Ajuste automático de líneas · Enter para guardar'}</span>
        </div> : null}

        {/* Segmented type pills selector */}
        <div className="sequence-dialog-type-selector">
          {([
            { type: 'synchronous' as const, label: 'Síncrono' },
            { type: 'asynchronous' as const, label: 'Asíncrono' },
            { type: 'return' as const, label: 'Retorno' },
            { type: 'create' as const, label: 'Crear' },
            { type: 'destroy' as const, label: 'Destruir' },
          ]).map(({ type, label }) => (
            <button
              key={type}
              type="button"
              className={`sequence-dialog-type-btn ${draft.type === type ? 'active' : ''}`}
              onClick={() => handleTypeSelect(type)}
            >
              {label}
            </button>
          ))}
        </div>

        {draft.type === 'return' ? (
          <p className="sequence-dialog-help">
            El retorno se representa con una flecha discontinua. Si existe una llamada compatible, cerrará su activación.
          </p>
        ) : null}

        {/* Optional linked method dropdown */}
        {draft.type !== 'return' && draft.type !== 'destroy' && (methodOptions.length > 0 || methodMissing) ? (
          <div className="sequence-dialog-options-row">
            <label className="sequence-dialog-sublabel">
              <span>Método vinculado</span>
              <select
                value={draft.operationMethodId ?? ''}
                onChange={(event) => {
                  const method = methodOptions.find((candidate) => candidate.id === event.target.value);
                  if (method) {
                    const formatted = `${method.name}(${method.parameters})${method.returnType ? `: ${method.returnType}` : ''}`;
                    setSignatureText(formatted);
                    onChange(updateSequenceMessageEditModel(draft, {
                      operationMethodId: method.id,
                      name: method.name,
                      arguments: method.parameters,
                      parameterValues: '',
                      returnType: method.returnType,
                    }));
                  } else {
                    onChange(updateSequenceMessageEditModel(draft, { operationMethodId: undefined }));
                  }
                }}
              >
                {methodMissing ? <option value={draft.operationMethodId}>Método no disponible</option> : null}
                <option value="">Texto libre</option>
                {methodOptions.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.label} {method.returnType ? `: ${method.returnType}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {methodMissing ? <small className="sequence-reference-warning">La referencia falta, pero se conserva el texto del mensaje.</small> : null}
          </div>
        ) : null}

        {/* Optional flow reference */}
        {flowOptions.length > 0 || flowMissing ? (
          <div className="sequence-dialog-options-row">
            <label className="sequence-dialog-sublabel">
              <span>Referencia al flujo</span>
              <input
                list="sequence-message-flow-options-dialog"
                value={draft.flowReference ?? ''}
                onChange={(event) => onChange(updateSequenceMessageEditModel(draft, { flowReference: event.target.value }))}
                placeholder="4.2 / CA 1"
              />
              <datalist id="sequence-message-flow-options-dialog">
                <option value="">Sin referencia</option>
                {flowOptions.map((option) => (
                  <option key={`${option.flowId}:${option.stepId}`} value={option.value}>{option.label}</option>
                ))}
              </datalist>
            </label>
            {flowMissing ? <small className="sequence-reference-warning">El paso ya no está disponible; se conserva su referencia.</small> : null}
          </div>
        ) : null}

        {/* Footer actions */}
        <footer className="sequence-dialog-footer">
          <small className="sequence-dialog-shortcuts">Esc cancelar · Enter guardar</small>
          <div className="sequence-dialog-actions">
            <button type="button" className="sequence-dialog-btn-cancel" onClick={onCancel}>
              Cancelar
            </button>
            <button type="submit" className="sequence-dialog-btn-save">
              {draft.editId ? 'Guardar' : 'Crear mensaje'}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
