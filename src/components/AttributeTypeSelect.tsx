import { useId, type MouseEvent } from 'react';
import { INLINE_ATTRIBUTE_TYPE_SUGGESTIONS } from '../constants/attributeTypes';

type AttributeTypeSelectProps = {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
};

const stopFlowEvent = (event: MouseEvent<HTMLElement>): void => {
  event.stopPropagation();
};

/**
 * One field for the type: type anything (`Date`, `EstadoTramite`) or pick a
 * primitive from the suggestions. It replaces a select with a "custom" option
 * that opened a second field.
 */
export function AttributeTypeSelect({ value, onChange, compact = false }: AttributeTypeSelectProps) {
  const listId = useId();
  return (
    <span className={`attribute-type-select ${compact ? 'compact' : ''}`}>
      <input
        aria-label="Tipo del atributo"
        list={listId}
        value={value}
        placeholder="tipo"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onClick={stopFlowEvent}
        onContextMenu={stopFlowEvent}
        onDoubleClick={stopFlowEvent}
        onMouseDown={stopFlowEvent}
      />
      <datalist id={listId}>
        {INLINE_ATTRIBUTE_TYPE_SUGGESTIONS.map((type) => <option key={type} value={type} />)}
      </datalist>
    </span>
  );
}
