import { ChevronRight, Search } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { clampSplitFraction, splitBounds } from '../utils/projectSidebar';

type SidebarPaneProps = {
  /** Header buttons (Nuevo…, opciones); they sit outside the fold button. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Pane without a fold button (Inicio's single «Proyectos» list). */
  collapsible?: boolean;
  count?: number;
  id: string;
  onToggle?: () => void;
  open: boolean;
  paneRef?: RefObject<HTMLElement | null>;
  /** Show the header actions on hover or focus only, like VS Code. */
  revealActions?: boolean;
  strong?: boolean;
  style?: CSSProperties;
  title: string;
};

/** A VS Code–style pane: a folding header over a scrolling body, as a labelled region. */
export function SidebarPane({
  actions,
  children,
  className = '',
  collapsible = true,
  count,
  id,
  onToggle,
  open,
  paneRef,
  revealActions = false,
  strong = false,
  style,
  title,
}: SidebarPaneProps) {
  const label = (
    <>
      {collapsible ? <ChevronRight aria-hidden="true" className="v2-pane-chevron" size={14} /> : null}
      <span className="v2-pane-title-text" id={`${id}-title`}>{title}</span>
      {count !== undefined ? <span className="v2-count v2-pane-count">{count}</span> : null}
    </>
  );
  return (
    <section
      aria-labelledby={`${id}-title`}
      id={id}
      ref={paneRef}
      className={`v2-pane ${open ? 'is-open' : 'is-folded'} ${strong ? 'is-strong' : ''} ${className}`}
      style={style}
    >
      <div className={`v2-pane-header ${revealActions ? 'reveals-actions' : ''}`}>
        <h2 className="v2-pane-title">
          {collapsible ? (
            <button
              aria-controls={`${id}-body`}
              aria-expanded={open}
              className="v2-pane-toggle"
              type="button"
              onClick={onToggle}
              title={strong ? title : undefined}
            >
              {label}
            </button>
          ) : (
            <span className="v2-pane-toggle is-static">{label}</span>
          )}
        </h2>
        {actions !== undefined ? <div className="v2-pane-actions">{actions}</div> : null}
      </div>
      <div className="v2-pane-body" hidden={!open} id={`${id}-body`}>{children}</div>
    </section>
  );
}

type SidebarFilterProps = {
  onChange: (value: string) => void;
  value: string;
};

export function SidebarFilter({ onChange, value }: SidebarFilterProps) {
  return (
    <div className="v2-pane-filter">
      <Search aria-hidden="true" size={14} />
      <input
        aria-label="Filtrar proyectos"
        autoComplete="off"
        placeholder="Filtrar proyectos"
        spellCheck={false}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value !== '') {
            event.preventDefault();
            onChange('');
          }
        }}
      />
    </div>
  );
}

const KEY_STEP = 24;

type SidebarSashProps = {
  /** Container holding both panes and the sash; the split is a share of its height. */
  containerRef: RefObject<HTMLElement | null>;
  /** Called while dragging or pressing keys; `persist` is true when the gesture is done. */
  onSplit: (fraction: number | null, persist: boolean) => void;
  topId: string;
  topRef: RefObject<HTMLElement | null>;
};

/** Horizontal divider between two panes: drag, ↑/↓ to resize, double click to go back to automatic. */
export function SidebarSash({ containerRef, onSplit, topId, topRef }: SidebarSashProps) {
  const sashRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ grab: number; last: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [measure, setMeasure] = useState({ available: 0, top: 0 });

  const read = useCallback((): { available: number; top: number } | null => {
    const container = containerRef.current;
    const top = topRef.current;
    const sash = sashRef.current;
    if (container === null || top === null || sash === null) return null;
    return { available: container.clientHeight - sash.offsetHeight, top: top.offsetHeight };
  }, [containerRef, topRef]);

  // Keep aria-valuenow honest while the layout is automatic or the window resizes.
  useLayoutEffect(() => {
    const update = (): void => {
      const next = read();
      if (next !== null) {
        setMeasure((previous) => (previous.available === next.available && previous.top === next.top ? previous : next));
      }
    };
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    if (containerRef.current !== null) observer.observe(containerRef.current);
    if (topRef.current !== null) observer.observe(topRef.current);
    return () => observer.disconnect();
  }, [containerRef, read, topRef]);

  useEffect(() => () => { dragRef.current = null; }, []);

  const resizeTo = (topPx: number, persist: boolean): void => {
    const current = read();
    if (current === null || current.available <= 0) return;
    const fraction = clampSplitFraction(topPx / current.available, current.available);
    dragRef.current = dragRef.current === null ? null : { ...dragRef.current, last: fraction };
    onSplit(fraction, persist);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    const sash = event.currentTarget;
    sash.setPointerCapture(event.pointerId);
    dragRef.current = { grab: event.clientY - sash.getBoundingClientRect().top, last: -1 };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (drag === null || container === null) return;
    resizeTo(event.clientY - drag.grab - container.getBoundingClientRect().top, false);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag !== null && drag.last >= 0) onSplit(drag.last, true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = read();
    if (current === null) return;
    const bounds = splitBounds(current.available);
    let topPx: number | null = null;
    if (event.key === 'ArrowUp') topPx = current.top - KEY_STEP;
    else if (event.key === 'ArrowDown') topPx = current.top + KEY_STEP;
    else if (event.key === 'Home') topPx = bounds.min * current.available;
    else if (event.key === 'End') topPx = bounds.max * current.available;
    if (topPx === null) return;
    event.preventDefault();
    resizeTo(topPx, true);
  };

  const bounds = splitBounds(measure.available);
  const percent = (value: number): number => Math.round(value * 100);
  return (
    <div
      aria-controls={topId}
      aria-label="Redimensionar secciones de proyectos"
      aria-orientation="horizontal"
      aria-valuemax={percent(bounds.max)}
      aria-valuemin={percent(bounds.min)}
      aria-valuenow={measure.available > 0 ? percent(measure.top / measure.available) : 50}
      aria-valuetext={`${measure.available > 0 ? percent(measure.top / measure.available) : 50}% del alto para el proyecto actual`}
      className={`v2-sash ${dragging ? 'is-dragging' : ''}`}
      ref={sashRef}
      role="separator"
      tabIndex={0}
      title="Arrastrá para repartir el alto (doble clic: automático)"
      onDoubleClick={() => onSplit(null, true)}
      onKeyDown={onKeyDown}
      onLostPointerCapture={() => { dragRef.current = null; setDragging(false); }}
      onPointerCancel={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
    />
  );
}
