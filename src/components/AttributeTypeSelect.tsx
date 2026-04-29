import type { ChangeEvent, MouseEvent } from 'react';
import { ATTRIBUTE_TYPES } from '../constants/attributeTypes';

type AttributeTypeSelectProps = {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
};

const stopFlowEvent = (event: MouseEvent<HTMLElement>): void => {
  event.stopPropagation();
};

export function AttributeTypeSelect({ value, onChange, compact = false }: AttributeTypeSelectProps) {
  const isKnownType = ATTRIBUTE_TYPES.some((type) => type === value);
  const selectValue = isKnownType ? value : 'custom';
  const customValue = selectValue === 'custom' && value !== 'custom' ? value : '';

  const handleTypeChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const nextType = event.target.value;
    onChange(nextType === 'custom' ? customValue : nextType);
  };

  const handleCustomChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(event.target.value);
  };

  return (
    <div className={`attribute-type-select ${compact ? 'compact' : ''}`}>
      <select
        aria-label="Tipo del atributo"
        value={selectValue}
        onChange={handleTypeChange}
        onClick={stopFlowEvent}
        onContextMenu={stopFlowEvent}
        onDoubleClick={stopFlowEvent}
        onMouseDown={stopFlowEvent}
      >
        {ATTRIBUTE_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      {selectValue === 'custom' ? (
        <input
          aria-label="Tipo custom"
          value={customValue}
          onChange={handleCustomChange}
          onClick={stopFlowEvent}
          onContextMenu={stopFlowEvent}
          onDoubleClick={stopFlowEvent}
          onMouseDown={stopFlowEvent}
          placeholder="Tipo"
        />
      ) : null}
    </div>
  );
}
