import { useRef, useState, type CSSProperties } from 'react';
import { useReactFlow, type XYPosition } from 'reactflow';

type Props = {
  value: string;
  placeholder: string;
  selected: boolean;
  x: number;
  y: number;
  offset?: XYPosition;
  className?: string;
  onCommit: (value: string) => void;
  onMove?: (offset: XYPosition) => void;
  /** When false an empty label stays hidden even while the edge is selected. */
  showPlaceholder?: boolean;
};

export function AssociationTextLabel({ value, placeholder, selected, x, y, offset, className = '', onCommit, onMove, showPlaceholder = true }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [dragOffset, setDragOffset] = useState<XYPosition | null>(null);
  const drag = useRef<{ x: number; y: number; offset: XYPosition; zoom: number } | null>(null);
  const cancelled = useRef(false);
  const { getZoom } = useReactFlow();
  const displayedOffset = dragOffset ?? offset ?? { x: 0, y: 0 };
  if (!value && !(selected && showPlaceholder) && !editing) return null;
  const style: CSSProperties = {
    position: 'absolute', left: x + displayedOffset.x, top: y + displayedOffset.y,
    transform: 'translate(-50%, -50%)', pointerEvents: 'all',
  };
  const startEditing = () => { cancelled.current = false; setDraft(value); setEditing(true); };
  const finish = () => { if (!cancelled.current) onCommit(draft.trim()); setEditing(false); };
  return (
    <div className={`association-label nodrag nopan ${className}`} style={style} data-empty={!value}
      onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
      onContextMenu={event => event.stopPropagation()}
      onDoubleClick={event => { event.stopPropagation(); startEditing(); }}
      onPointerDown={event => {
        if (!event.altKey || !onMove || editing) return;
        event.preventDefault(); event.stopPropagation();
        drag.current = { x: event.clientX, y: event.clientY, offset: offset ?? { x: 0, y: 0 }, zoom: getZoom() };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (!start) return;
        setDragOffset({ x: start.offset.x + (event.clientX - start.x) / start.zoom, y: start.offset.y + (event.clientY - start.y) / start.zoom });
      }}
      onPointerUp={event => {
        const start = drag.current;
        if (!start) return;
        drag.current = null;
        onMove?.({ x: start.offset.x + (event.clientX - start.x) / start.zoom, y: start.offset.y + (event.clientY - start.y) / start.zoom });
        setDragOffset(null);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; setDragOffset(null); }}>
      {editing ? <input aria-label={placeholder} value={draft} autoFocus
        onFocus={event => event.currentTarget.select()}
        onChange={event => setDraft(event.target.value)} onBlur={finish}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Enter') { event.preventDefault(); finish(); }
          if (event.key === 'Escape') { event.preventDefault(); cancelled.current = true; setEditing(false); }
        }} /> : <span role="button" tabIndex={0} aria-label={`Editar ${placeholder.toLowerCase()}`}
        title={`Doble clic para editar${onMove ? ' · Alt + arrastrar para mover' : ''}`}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); startEditing(); }
        }}>{value || placeholder}</span>}
    </div>
  );
}
