import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  BoxSelect,
  Copy,
  LayoutGrid,
} from 'lucide-react';
import type { ClassArrangement } from '../utils/classDiagramOperations';
import { MenuItem, MenuLabel, MenuSeparator, ToolMenu } from './ui/Toolbar';

const arrangements: Array<[ClassArrangement, string, typeof AlignStartVertical]> = [
  ['left', 'Alinear a la izquierda', AlignStartVertical],
  ['center', 'Alinear centros verticales', AlignCenterVertical],
  ['right', 'Alinear a la derecha', AlignEndVertical],
  ['top', 'Alinear arriba', AlignStartHorizontal],
  ['middle', 'Alinear centros horizontales', AlignCenterHorizontal],
  ['bottom', 'Alinear abajo', AlignEndHorizontal],
  ['horizontal', 'Distribuir horizontalmente', AlignHorizontalSpaceAround],
  ['vertical', 'Distribuir verticalmente', AlignVerticalSpaceAround],
];

type Props = {
  count: number;
  onArrange: (action: ClassArrangement) => void;
  onDuplicate: () => void;
  onSelectAll: () => void;
};

/** Selection and layout: select all, duplicate, align and distribute. */
export function DiagramSelectionTools({ count, onArrange, onDuplicate, onSelectAll }: Props) {
  return (
    <ToolMenu
      icon={LayoutGrid}
      label={count > 1 ? `Organizar (${count})` : 'Organizar'}
      align="start"
      title="Seleccionar, duplicar, alinear y distribuir"
    >
      <MenuItem icon={BoxSelect} onSelect={onSelectAll}>Seleccionar todas las clases</MenuItem>
      <MenuItem icon={Copy} disabled={count === 0} onSelect={onDuplicate}>Duplicar selección</MenuItem>
      <MenuSeparator />
      <MenuLabel>{count < 2 ? 'Seleccioná dos o más clases' : `Alinear ${count} clases`}</MenuLabel>
      {arrangements.map(([action, label, Icon]) => (
        <MenuItem
          key={action}
          icon={Icon}
          disabled={count < (action === 'horizontal' || action === 'vertical' ? 3 : 2)}
          onSelect={() => onArrange(action)}
        >
          {label}
        </MenuItem>
      ))}
    </ToolMenu>
  );
}
