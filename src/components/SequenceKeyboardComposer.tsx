import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { SequenceFragmentOperator, SequenceMessageType } from '../types/diagram';
import type { SequenceMethodOption } from '../utils/sequenceMessageEditing';
import type { SequenceKeyboardModeState } from '../utils/sequenceKeyboardMode';
import { getSequenceKeyboardInstruction, sequenceKeyboardMessageTypes } from '../utils/sequenceKeyboardMode';

const typeLabels: Record<SequenceMessageType, string> = {
  synchronous: 'Mensaje',
  asynchronous: 'Mensaje',
  return: 'Retorno',
  create: 'Crear',
  destroy: 'Destruir',
};

const operatorLabels: Record<SequenceFragmentOperator, string> = {
  alt: 'alt · alternativas',
  loop: 'loop · repetición',
  opt: 'opt · opcional',
  par: 'par · paralelo',
  break: 'break · interrupción',
  critical: 'critical · sección crítica',
  ref: 'ref · otra interacción',
};

const methodText = (method: SequenceMethodOption): string =>
  `${method.name}(${method.parameters})${method.returnType ? `: ${method.returnType}` : ''}`;

export function SequenceKeyboardComposer({
  state,
  context,
  sourceName,
  targetName,
  position,
  placement = 'above',
  methodOptions,
  selectedCount,
  onTextChange,
  onGuardChange,
  onSubmit,
  onBack,
  onMethodSelect,
  onAddParticipant,
}: {
  state: SequenceKeyboardModeState;
  context: string;
  sourceName: string;
  targetName: string;
  position: Pick<CSSProperties, 'left' | 'top'>;
  placement?: 'above' | 'below';
  methodOptions: SequenceMethodOption[];
  selectedCount: number;
  onTextChange: (text: string) => void;
  onGuardChange: (text: string) => void;
  onSubmit: (addAutomaticReturn?: boolean) => void;
  onBack: () => void;
  onMethodSelect: (method: SequenceMethodOption) => void;
  onAddParticipant: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // The popover is centred on the participant; near the edge of the visible
  // canvas that cut it in half. Nudge it back inside the scrolling viewport
  // (8px margin) and move the arrow the other way so it still points at the
  // participant.
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return undefined;
    let viewport: HTMLElement | null = popover.parentElement;
    while (viewport && !/(auto|scroll|hidden)/.test(getComputedStyle(viewport).overflowX)) viewport = viewport.parentElement;
    const fit = (): void => {
      popover.style.setProperty('--keyboard-nudge', '0px');
      if (!viewport) return;
      const box = popover.getBoundingClientRect();
      const bounds = viewport.getBoundingClientRect();
      const nudge = box.left < bounds.left + 8
        ? bounds.left + 8 - box.left
        : box.right > bounds.right - 8 ? bounds.right - 8 - box.right : 0;
      popover.style.setProperty('--keyboard-nudge', `${Math.round(nudge)}px`);
    };
    fit();
    viewport?.addEventListener('scroll', fit, { passive: true });
    window.addEventListener('resize', fit);
    return () => {
      viewport?.removeEventListener('scroll', fit);
      window.removeEventListener('resize', fit);
    };
  }, [position.left, position.top, state.stage, placement, sourceName, targetName]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const suggestions = useMemo(() => {
    const query = state.text.trim().toLocaleLowerCase().split(/[(:]/)[0];
    if (!query) return methodOptions.slice(0, 5);
    return methodOptions.filter((method) => `${method.name} ${method.label}`.toLocaleLowerCase().includes(query)).slice(0, 5);
  }, [methodOptions, state.text]);

  useEffect(() => {
    if ((state.stage === 'typing' && state.messageType !== 'return') || state.stage === 'guard' || state.stage === 'participant') {
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
      });
    }
  }, [state.stage, state.editId, state.guardOperandId, state.messageType]);

  const handleTextKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onBack();
      return;
    }
    if (state.stage === 'guard') {
      if (event.key === 'Enter') {
        event.preventDefault();
        onSubmit(false);
      }
      return;
    }
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault();
      setSuggestionIndex((current) => (current + 1) % suggestions.length);
      return;
    }
    if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault();
      setSuggestionIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === 'Tab' && suggestions.length > 0) {
      event.preventDefault();
      onMethodSelect(suggestions[Math.min(suggestionIndex, suggestions.length - 1)] ?? suggestions[0]);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      onSubmit(event.shiftKey);
    }
  };

  const instruction = getSequenceKeyboardInstruction(state);
  const visibleMessageType: SequenceMessageType = state.messageType === 'asynchronous'
    ? 'synchronous'
    : state.messageType;
  const visibleMessageTypeLabel = typeLabels[visibleMessageType];

  return (
    <>
      <div
        aria-label="Compositor rápido de secuencia"
        className={`sequence-keyboard-popover stage-${state.stage} placement-${placement}`}
        data-export-control="true"
        ref={popoverRef}
        role="group"
        style={{ left: position.left, top: position.top }}
      >
        {state.stage === 'navigate' ? (
          <div className="sequence-keyboard-navigate-pill">
            <span className="sequence-keyboard-pill-source" title={sourceName}>{sourceName}</span>
            <span className="sequence-keyboard-pill-sep">·</span>
            <span className="sequence-keyboard-pill-action"><kbd>Enter</kbd> conectar</span>
            <button type="button" className="sequence-keyboard-add-participant" onClick={onAddParticipant}><kbd>P</kbd> Participante</button>
          </div>
        ) : (
          <>
            {state.stage === 'participant' || state.stage === 'fragment' || state.stage === 'guard' ? (
              <div className="sequence-keyboard-panel-title">
                <strong>{state.stage === 'participant' ? 'Agregar participante' : state.stage === 'fragment' ? 'Fragmento combinado' : 'Editar guarda'}</strong>
                <span>{context}</span>
              </div>
            ) : (
              <div
                aria-label={`Tipo de mensaje: ${visibleMessageTypeLabel}`}
                className="sequence-keyboard-route"
                data-message-type={visibleMessageType}
              >
                <span title={sourceName}>{sourceName}</span>
                <b>{visibleMessageTypeLabel}</b>
                <span title={targetName}>{targetName}</span>
              </div>
            )}

            {state.stage === 'aim' ? (
              <div aria-label="Tipos de mensaje" className="sequence-keyboard-type-row" role="listbox">
                {sequenceKeyboardMessageTypes.map((type) => (
                  <span
                    aria-selected={visibleMessageType === type}
                    className={visibleMessageType === type ? 'active' : ''}
                    data-message-type={type}
                    key={type}
                    role="option"
                  >
                    {typeLabels[type]}
                  </span>
                ))}
              </div>
            ) : null}

            {(state.stage === 'typing' && state.messageType !== 'return') || state.stage === 'participant' ? (
              <label>
                <span>
                  {state.stage === 'participant'
                    ? 'Nuevo participante'
                    : state.messageType === 'create'
                    ? 'Participante nuevo'
                    : state.editId
                        ? 'Editar mensaje'
                        : 'Mensaje'}
                </span>
                <input
                  ref={inputRef}
                  aria-autocomplete={suggestions.length > 0 ? 'list' : undefined}
                  aria-controls={suggestions.length > 0 ? 'sequence-keyboard-suggestions' : undefined}
                  value={state.text}
                  placeholder={
                    state.stage === 'participant'
                      ? 'instancia:Clase o :Clase'
                      : state.messageType === 'create'
                      ? 'pedido : Pedido'
                      : 'operación(parámetros): Retorno'
                  }
                  onChange={(event) => {
                    setSuggestionIndex(0);
                    onTextChange(event.target.value);
                  }}
                  onKeyDown={handleTextKeyDown}
                />
              </label>
            ) : null}

            {state.stage === 'typing' && state.messageType !== 'return' && suggestions.length > 0 ? (
              <div className="sequence-keyboard-suggestions" id="sequence-keyboard-suggestions" role="listbox">
                {suggestions.map((method, index) => (
                  <button
                    aria-selected={index === suggestionIndex}
                    className={index === suggestionIndex ? 'active' : ''}
                    key={method.id}
                    role="option"
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onMethodSelect(method)}
                  >
                    <strong>{methodText(method)}</strong>
                    <small>{method.label}</small>
                  </button>
                ))}
              </div>
            ) : null}

            {state.stage === 'fragment' ? (
              <div className="sequence-keyboard-fragment-picker">
                <small>{selectedCount > 0 ? `${selectedCount} elemento${selectedCount === 1 ? '' : 's'} seleccionado${selectedCount === 1 ? '' : 's'}` : 'Fragmento vacío en este punto'}</small>
                {Object.entries(operatorLabels).map(([operator, label]) => (
                  <div className={state.fragmentOperator === operator ? 'active' : ''} key={operator}>{label}</div>
                ))}
              </div>
            ) : null}

            {state.stage === 'guard' ? (
              <label>
                <span>Guarda de la rama</span>
                <input
                  ref={inputRef}
                  value={state.guardText}
                  placeholder="condición / else"
                  onChange={(event) => onGuardChange(event.target.value)}
                  onKeyDown={handleTextKeyDown}
                />
              </label>
            ) : null}

            <small className="sequence-keyboard-hint">{instruction}</small>
          </>
        )}
      </div>
      <div aria-live="polite" className="sequence-keyboard-live-region">
        {`${context}. ${state.stage === 'participant' ? 'Nuevo participante.' : `Origen ${sourceName}. ${state.stage === 'aim' || state.stage === 'typing' ? `Destino ${targetName}. Tipo ${visibleMessageTypeLabel}.` : ''}`}`}
      </div>
    </>
  );
}
