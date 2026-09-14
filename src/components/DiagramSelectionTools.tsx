import type { SyntheticEvent } from 'react';
import type { ClassArrangement } from '../utils/classDiagramOperations';

const arrangements: Array<[ClassArrangement, string]> = [
  ['left', 'Alinear a la izquierda'], ['center', 'Alinear centros verticales'], ['right', 'Alinear a la derecha'],
  ['top', 'Alinear arriba'], ['middle', 'Alinear centros horizontales'], ['bottom', 'Alinear abajo'],
  ['horizontal', 'Distribuir horizontalmente'], ['vertical', 'Distribuir verticalmente'],
];

type Props = {
  count: number;
  onArrange: (action: ClassArrangement) => void;
  onDuplicate: () => void;
  onSelectAll: () => void;
  onToggle: (event: SyntheticEvent<HTMLDetailsElement>) => void;
};

export function DiagramSelectionTools({ count, onArrange, onDuplicate, onSelectAll, onToggle }: Props) {
  return (
    <details className="toolbar-menu" onToggle={onToggle}>
      <summary>Organizar{count > 1 ? ` (${count})` : ''}</summary>
      <div className="toolbar-menu-content class-organize-menu">
        <p className="helper-text">Mayús + arrastrar: seleccionar un área. ⌘/Ctrl + clic: sumar clases.</p>
        <button type="button" onClick={onSelectAll}>Seleccionar todas las clases</button>
        <button type="button" disabled={count === 0} onClick={onDuplicate}>Duplicar selección</button>
        <hr />
        {arrangements.map(([action, label]) => (
          <button key={action} type="button"
            disabled={count < (action === 'horizontal' || action === 'vertical' ? 3 : 2)}
            onClick={(event) => { onArrange(action); event.currentTarget.closest('details')?.removeAttribute('open'); }}>
            {label}
          </button>
        ))}
      </div>
    </details>
  );
}
