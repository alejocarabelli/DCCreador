import { CornerDownRight, MoveUpRight } from 'lucide-react';
import type { CSSProperties, MouseEvent } from 'react';
import { MULTIPLICITY_SUGGESTIONS } from '../constants/multiplicity';
import type { AssociationEdgeData, AssociationLineStyle } from '../types/diagram';

const stopMouseEvent = (event: MouseEvent<HTMLElement>): void => {
  event.stopPropagation();
};

type LineStyleToolbarProps = {
  edgeId: string;
  lineStyle: AssociationLineStyle;
  style: CSSProperties;
  onUpdateAssociation?: AssociationEdgeData['onUpdateAssociation'];
};

export function AssociationLineStyleToolbar({ edgeId, lineStyle, style, onUpdateAssociation }: LineStyleToolbarProps) {
  return (
    <div
      className="association-quick-controls association-line-toolbar nodrag nopan"
      role="group"
      aria-label="Recorrido de la relación"
      style={style}
      onMouseDown={stopMouseEvent}
      onClick={stopMouseEvent}
      onDoubleClick={stopMouseEvent}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {([
        { value: 'straight', label: 'Recto', Icon: MoveUpRight },
        { value: 'orthogonal', label: 'Con codos', Icon: CornerDownRight },
      ] as const).map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={lineStyle === value}
          title={label}
          onClick={() => onUpdateAssociation?.(edgeId, { lineStyle: value, waypoints: [] })}
        >
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

type MultiplicityChipsProps = {
  end: 'source' | 'target';
  value: string;
  style: CSSProperties;
  onChange: (value: string) => void;
};

export function AssociationMultiplicityChips({ end, value, style, onChange }: MultiplicityChipsProps) {
  const endLabel = end === 'source' ? 'origen' : 'destino';

  return (
    <div
      className="association-quick-controls association-multiplicity-chips nodrag nopan"
      role="group"
      aria-label={`Multiplicidad de ${endLabel}`}
      style={style}
      onMouseDown={stopMouseEvent}
      onClick={stopMouseEvent}
      onDoubleClick={stopMouseEvent}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {MULTIPLICITY_SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          aria-label={`Multiplicidad de ${endLabel}: ${suggestion}`}
          aria-pressed={value === suggestion}
          title={`${value === suggestion ? 'Quitar' : 'Asignar'} ${suggestion} en ${endLabel}`}
          onClick={() => onChange(value === suggestion ? '' : suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
