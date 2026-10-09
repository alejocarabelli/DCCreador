import {
  memo,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Eraser, MousePointer2, MoveUpRight, Pencil, Redo2, Square, Type, Undo2 } from 'lucide-react';
import type { SketchColor, SketchShape } from '../../types/diagram';
import {
  MAX_NOTEBOOK_POINTS,
  MAX_TEXT_LENGTH,
  MAX_SHAPES_PER_SKETCH,
  MAX_SKETCH_HEIGHT,
  MIN_SKETCH_HEIGHT,
  NOTEBOOK_LOGICAL_WIDTH,
  simplifyStroke,
} from '../../utils/artifactNotebook';
import { limitTextChange, limitTextPaste, TEXT_LIMIT_HINT, TEXT_PASTE_HINT } from './notebookTextLimits';
import { createId } from '../../utils/id';
import { shortcutLabel } from '../../utils/shortcutLabel';
import { ToolButton } from '../ui/Toolbar';
import {
  SKETCH_TEXT_SIZE,
  arrowPath,
  boundsIntersect,
  clampDelta,
  clampPoint,
  contentBottom,
  rectFromCorners,
  shapeBounds,
  shapesTouchedBySegment,
  smoothPath,
  snapAngle,
  textMetrics,
  topShapeAt,
  translateShape,
  unionBounds,
  type Bounds,
  type Point,
} from './sketchGeometry';
import {
  emptySketchHistory,
  recordSketchChange,
  redoSketch,
  undoSketch,
  type SketchHistory,
} from './sketchHistory';

type SketchBlock = { id: string; height: number; shapes: SketchShape[] };
type SketchTool = 'select' | 'pen' | 'arrow' | 'rect' | 'text' | 'erase';

export type NotebookSketchProps = {
  block: SketchBlock;
  /** Pen points in the whole notebook, for the shared ink limit. */
  notebookPoints: number;
  onChange: (shapes: SketchShape[]) => void;
  /** `final` is true when a resize gesture ends (the sheet commits at once). */
  onHeightChange: (height: number, final: boolean) => void;
  /** Receives the focusable drawing surface, so the sheet can focus the block. */
  surfaceRef?: (element: SVGSVGElement | null) => void;
  /** Rendered at the far right of the tool strip (the block's delete button). */
  actions?: ReactNode;
};

type Gesture =
  | { kind: 'pen'; points: number[] }
  | { kind: 'arrow'; from: Point; to: Point }
  | { kind: 'rect'; from: Point; to: Point; square: boolean }
  | { kind: 'erase'; ids: string[]; last: Point }
  | { kind: 'move'; from: Point; dx: number; dy: number; ids: string[]; bounds: Bounds }
  | { kind: 'marquee'; from: Point; to: Point; base: string[] };

type TextEdit = { id?: string; x: number; y: number; color: SketchColor; value: string };

const COLOR_VAR: Record<SketchColor, string> = {
  ink: 'var(--panel-text)',
  accent: 'var(--accent)',
  red: 'var(--status-danger-text)',
};

const COLORS: Array<{ id: SketchColor; label: string }> = [
  { id: 'ink', label: 'Tinta' },
  { id: 'accent', label: 'Petróleo' },
  { id: 'red', label: 'Rojo' },
];

const TOOLS: Array<{ id: SketchTool; label: string; key: string; icon: typeof Pencil }> = [
  { id: 'select', label: 'Seleccionar', key: 'V', icon: MousePointer2 },
  { id: 'pen', label: 'Lápiz', key: 'P', icon: Pencil },
  { id: 'arrow', label: 'Flecha', key: 'A', icon: MoveUpRight },
  { id: 'rect', label: 'Rectángulo', key: 'R', icon: Square },
  { id: 'text', label: 'Texto', key: 'T', icon: Type },
  { id: 'erase', label: 'Borrador', key: 'E', icon: Eraser },
];

const NO_IDS: string[] = [];
const NO_SHAPES: SketchShape[] = [];
/** Pointer tolerances in CSS pixels, converted to logical units per sheet width. */
const SELECT_TOLERANCE_PX = 6;
const ERASE_RADIUS_PX = 8;
const MIN_SHAPE_PX = 6;
const NUDGE = 10;
const NUDGE_FAR = 50;
const HEIGHT_KEY_STEP = 60;
const HEIGHT_KEY_STEP_FAR = 200;

const stroke = {
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  vectorEffect: 'non-scaling-stroke',
} as const;

const consume = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
  event.preventDefault();
  event.stopPropagation();
};

const ShapeView = memo(function ShapeView({ shape, ghost = false }: { shape: SketchShape; ghost?: boolean }) {
  const style = { stroke: COLOR_VAR[shape.color], opacity: ghost ? 0.3 : undefined };
  switch (shape.kind) {
    case 'pen':
      return <path {...stroke} d={smoothPath(shape.points)} strokeWidth={2} style={style} />;
    case 'arrow':
      return <path {...stroke} d={arrowPath(shape.x1, shape.y1, shape.x2, shape.y2)} strokeWidth={1.5} style={style} />;
    case 'rect':
      return <rect {...stroke} height={shape.h} rx={5} strokeWidth={1.5} style={style} width={shape.w} x={shape.x} y={shape.y} />;
    case 'text': {
      const { lines, baseline, lineHeight } = textMetrics(shape);
      return (
        <text className="notebook-sketch-text" fontSize={SKETCH_TEXT_SIZE} style={{ fill: COLOR_VAR[shape.color], opacity: style.opacity }}>
          {lines.map((line, index) => (
            <tspan key={index} x={shape.x} y={baseline + index * lineHeight}>{line}</tspan>
          ))}
        </text>
      );
    }
  }
});

const ShapesLayer = memo(function ShapesLayer({ shapes, ghostIds }: { shapes: readonly SketchShape[]; ghostIds: readonly string[] }) {
  return (
    <>
      {shapes.map((shape) => (
        <ShapeView ghost={ghostIds.includes(shape.id)} key={shape.id} shape={shape} />
      ))}
    </>
  );
});

const SelectionBox = ({ bounds }: { bounds: Bounds }) => (
  <rect
    className="notebook-sketch-selection"
    height={bounds.y2 - bounds.y1 + 16}
    rx={4}
    width={bounds.x2 - bounds.x1 + 16}
    x={bounds.x1 - 8}
    y={bounds.y1 - 8}
  />
);

export function NotebookSketch({ block, notebookPoints, onChange, onHeightChange, surfaceRef, actions }: NotebookSketchProps) {
  const { shapes, height } = block;
  const descriptionId = useId();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tool, setTool] = useState<SketchTool>('pen');
  const [color, setColor] = useState<SketchColor>('ink');
  const [selectedIds, setSelectedIds] = useState<string[]>(NO_IDS);
  const [gesture, setGestureState] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [history, setHistory] = useState<SketchHistory<SketchShape[]>>(emptySketchHistory);
  const [textEdit, setTextEditState] = useState<TextEdit | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const [textLimitHint, setTextLimitHint] = useState<string | null>(null);
  const textEditRef = useRef<TextEdit | null>(null);
  const [limitHint, setLimitHint] = useState(false);
  const hintTimerRef = useRef<number | undefined>(undefined);
  const resizeRef = useRef<{ startY: number; startHeight: number; unitsPerPx: number } | null>(null);

  useEffect(() => () => window.clearTimeout(hintTimerRef.current), []);

  const setGesture = (next: Gesture | null) => {
    gestureRef.current = next;
    setGestureState(next);
  };
  const setTextEdit = (next: TextEdit | null) => {
    setTextLimitHint(next !== null && next.value.length >= MAX_TEXT_LENGTH ? TEXT_LIMIT_HINT : null);
    textEditRef.current = next;
    setTextEditState(next);
  };

  const showLimitHint = () => {
    setLimitHint(true);
    window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => setLimitHint(false), 4000);
  };

  const unitsPerPx = () => {
    const width = svgRef.current?.getBoundingClientRect().width ?? 0;
    return width > 0 ? NOTEBOOK_LOGICAL_WIDTH / width : 1;
  };

  const pointFrom = (event: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return { x: 0, y: 0 };
    const scale = NOTEBOOK_LOGICAL_WIDTH / rect.width;
    return clampPoint({ x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale }, height);
  };

  const applyShapes = (next: SketchShape[]) => {
    setHistory((current) => recordSketchChange(current, shapes));
    onChange(next);
  };

  const canAddShape = () => {
    if (shapes.length >= MAX_SHAPES_PER_SKETCH) {
      showLimitHint();
      return false;
    }
    return true;
  };

  const selected = useMemo(() => {
    const present = selectedIds.filter((id) => shapes.some((shape) => shape.id === id));
    return present.length === selectedIds.length ? selectedIds : present;
  }, [selectedIds, shapes]);

  const chooseTool = (next: SketchTool) => {
    setTool(next);
    if (next !== 'select') setSelectedIds(NO_IDS);
  };

  const undo = () => {
    const result = undoSketch(history, shapes);
    if (result === null) return;
    setHistory(result.history);
    onChange(result.value);
  };

  const redo = () => {
    const result = redoSketch(history, shapes);
    if (result === null) return;
    setHistory(result.history);
    onChange(result.value);
  };

  const openTextEdit = (edit: TextEdit) => {
    setSelectedIds(NO_IDS);
    setTextEdit(edit);
  };

  const closeTextEdit = (refocus: boolean) => {
    setTextEdit(null);
    if (refocus) svgRef.current?.focus({ preventScroll: true });
  };

  const commitText = (value: string) => {
    const edit = textEditRef.current;
    if (edit === null) return;
    setTextEdit(null);
    const text = value.trim();
    if (edit.id !== undefined) {
      const existing = shapes.find((shape) => shape.id === edit.id);
      if (existing === undefined || existing.kind !== 'text') return;
      if (text === '') applyShapes(shapes.filter((shape) => shape.id !== edit.id));
      else if (text !== existing.text) applyShapes(shapes.map((shape) => (shape.id === edit.id ? { ...existing, text } : shape)));
      return;
    }
    if (text === '' || !canAddShape()) return;
    applyShapes([...shapes, { id: createId(), kind: 'text', color: edit.color, x: edit.x, y: edit.y, text }]);
  };

  const flushTextDraft = useEffectEvent(() => {
    if (textInputRef.current !== null) commitText(textInputRef.current.value);
  });
  useEffect(() => {
    const flushDraft = () => flushTextDraft();
    window.addEventListener('modelador:flush-drafts', flushDraft, true);
    return () => window.removeEventListener('modelador:flush-drafts', flushDraft, true);
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || gestureRef.current !== null || tool === 'text') return;
    const point = pointFrom(event);
    const upp = unitsPerPx();
    const target = event.currentTarget;

    if (tool === 'pen') {
      if (!canAddShape() || notebookPoints >= MAX_NOTEBOOK_POINTS) {
        showLimitHint();
        return;
      }
      target.setPointerCapture(event.pointerId);
      setGesture({ kind: 'pen', points: [point.x, point.y] });
    } else if (tool === 'arrow' || tool === 'rect') {
      if (!canAddShape()) return;
      target.setPointerCapture(event.pointerId);
      setGesture(tool === 'arrow' ? { kind: 'arrow', from: point, to: point } : { kind: 'rect', from: point, to: point, square: false });
    } else if (tool === 'erase') {
      target.setPointerCapture(event.pointerId);
      setGesture({ kind: 'erase', ids: shapesTouchedBySegment(shapes, point, point, ERASE_RADIUS_PX * upp), last: point });
    } else {
      target.setPointerCapture(event.pointerId);
      const hit = topShapeAt(shapes, point.x, point.y, SELECT_TOLERANCE_PX * upp);
      if (hit === undefined) {
        if (!event.shiftKey) setSelectedIds(NO_IDS);
        setGesture({ kind: 'marquee', from: point, to: point, base: event.shiftKey ? selected : NO_IDS });
        return;
      }
      let ids = selected;
      if (event.shiftKey) {
        ids = selected.includes(hit.id) ? selected.filter((id) => id !== hit.id) : [...selected, hit.id];
        setSelectedIds(ids);
        if (!ids.includes(hit.id)) return;
      } else if (!selected.includes(hit.id)) {
        ids = [hit.id];
        setSelectedIds(ids);
      }
      const bounds = unionBounds(shapes.filter((shape) => ids.includes(shape.id)).map(shapeBounds));
      if (bounds !== null) setGesture({ kind: 'move', from: point, dx: 0, dy: 0, ids, bounds });
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = gestureRef.current;
    if (current === null) return;
    const point = pointFrom(event);
    const upp = unitsPerPx();

    switch (current.kind) {
      case 'pen': {
        const count = current.points.length;
        if (notebookPoints + count / 2 >= MAX_NOTEBOOK_POINTS) return;
        const moved = Math.hypot(point.x - current.points[count - 2], point.y - current.points[count - 1]);
        if (moved < 1.5 * upp) return;
        current.points.push(point.x, point.y);
        setGesture({ ...current });
        break;
      }
      case 'arrow':
        setGesture({ ...current, to: event.shiftKey ? clampPoint(snapAngle(current.from, point), height) : point });
        break;
      case 'rect':
        setGesture({ ...current, to: point, square: event.shiftKey });
        break;
      case 'erase': {
        const touched = shapesTouchedBySegment(shapes, current.last, point, ERASE_RADIUS_PX * upp).filter(
          (id) => !current.ids.includes(id),
        );
        setGesture({ ...current, last: point, ids: touched.length > 0 ? [...current.ids, ...touched] : current.ids });
        break;
      }
      case 'move': {
        const delta = clampDelta(current.bounds, point.x - current.from.x, point.y - current.from.y, height);
        setGesture({ ...current, dx: delta.x, dy: delta.y });
        break;
      }
      case 'marquee':
        setGesture({ ...current, to: point });
        break;
    }
  };

  const finishGesture = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = gestureRef.current;
    setGesture(null);
    if (current === null) return;
    const upp = unitsPerPx();
    const minSize = MIN_SHAPE_PX * upp;

    switch (current.kind) {
      case 'pen': {
        const points = simplifyStroke(current.points);
        if (points.length === 0) break;
        if (notebookPoints + points.length / 2 > MAX_NOTEBOOK_POINTS) {
          showLimitHint();
          break;
        }
        applyShapes([...shapes, { id: createId(), kind: 'pen', color, points }]);
        break;
      }
      case 'arrow': {
        if (Math.hypot(current.to.x - current.from.x, current.to.y - current.from.y) < minSize) break;
        applyShapes([
          ...shapes,
          {
            id: createId(), kind: 'arrow', color,
            x1: Math.round(current.from.x), y1: Math.round(current.from.y),
            x2: Math.round(current.to.x), y2: Math.round(current.to.y),
          },
        ]);
        break;
      }
      case 'rect': {
        const rect = rectFromCorners(current.from, current.to, current.square);
        if (rect.w < minSize && rect.h < minSize) break;
        applyShapes([
          ...shapes,
          { id: createId(), kind: 'rect', color, x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) },
        ]);
        break;
      }
      case 'erase':
        if (current.ids.length > 0) applyShapes(shapes.filter((shape) => !current.ids.includes(shape.id)));
        break;
      case 'move': {
        if (Math.round(current.dx) === 0 && Math.round(current.dy) === 0) break;
        applyShapes(shapes.map((shape) => (current.ids.includes(shape.id) ? translateShape(shape, current.dx, current.dy) : shape)));
        break;
      }
      case 'marquee': {
        const area: Bounds = {
          x1: Math.min(current.from.x, current.to.x), y1: Math.min(current.from.y, current.to.y),
          x2: Math.max(current.from.x, current.to.x), y2: Math.max(current.from.y, current.to.y),
        };
        if (area.x2 - area.x1 < minSize && area.y2 - area.y1 < minSize) break;
        const inside = shapes.filter((shape) => boundsIntersect(shapeBounds(shape), area)).map((shape) => shape.id);
        setSelectedIds([...new Set([...current.base, ...inside])]);
        break;
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (tool !== 'text') return;
    const point = pointFrom(event);
    const existing = topShapeAt(shapes, point.x, point.y, SELECT_TOLERANCE_PX * unitsPerPx());
    if (existing !== undefined && existing.kind === 'text') {
      openTextEdit({ id: existing.id, x: existing.x, y: existing.y, color: existing.color, value: existing.text });
    } else if (canAddShape()) {
      openTextEdit({ x: Math.round(point.x), y: Math.round(point.y), color, value: '' });
    }
  };

  const handleDoubleClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (tool !== 'select') return;
    const point = pointFrom(event);
    const hit = topShapeAt(shapes, point.x, point.y, SELECT_TOLERANCE_PX * unitsPerPx());
    if (hit !== undefined && hit.kind === 'text') {
      openTextEdit({ id: hit.id, x: hit.x, y: hit.y, color: hit.color, value: hit.text });
    }
  };

  const deleteSelection = () => {
    applyShapes(shapes.filter((shape) => !selected.includes(shape.id)));
    setSelectedIds(NO_IDS);
  };

  const nudgeSelection = (dx: number, dy: number) => {
    const bounds = unionBounds(shapes.filter((shape) => selected.includes(shape.id)).map(shapeBounds));
    if (bounds === null) return;
    const delta = clampDelta(bounds, dx, dy, height);
    if (delta.x === 0 && delta.y === 0) return;
    applyShapes(shapes.map((shape) => (selected.includes(shape.id) ? translateShape(shape, delta.x, delta.y) : shape)));
  };

  const chooseColor = (next: SketchColor) => {
    setColor(next);
    if (selected.length > 0) {
      applyShapes(shapes.map((shape) => (selected.includes(shape.id) && shape.color !== next ? { ...shape, color: next } : shape)));
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    if (target instanceof HTMLInputElement) return;
    const key = event.key;
    const mod = event.metaKey || event.ctrlKey;

    if (key === 'Escape' && gestureRef.current !== null) {
      consume(event);
      setGesture(null);
      return;
    }

    if (mod && !event.altKey) {
      const lower = key.toLowerCase();
      if (lower === 'z') {
        consume(event);
        if (gestureRef.current === null) (event.shiftKey ? redo : undo)();
      } else if (lower === 'y' && event.ctrlKey) {
        consume(event);
        if (gestureRef.current === null) redo();
      } else if (lower === 'a') {
        consume(event);
        if (shapes.length > 0) {
          setTool('select');
          setSelectedIds(shapes.map((shape) => shape.id));
        }
      }
      return;
    }

    if (gestureRef.current !== null || target instanceof HTMLButtonElement) return;

    if (key === 'Escape') {
      if (selected.length > 0) {
        consume(event);
        setSelectedIds(NO_IDS);
      }
      return;
    }

    if (selected.length > 0) {
      if (key === 'Delete' || key === 'Backspace') {
        consume(event);
        deleteSelection();
        return;
      }
      const step = event.shiftKey ? NUDGE_FAR : NUDGE;
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      if (arrows[key] !== undefined) {
        consume(event);
        nudgeSelection(arrows[key][0], arrows[key][1]);
        return;
      }
    }

    if (target === svgRef.current && !event.altKey && !event.shiftKey) {
      const match = TOOLS.find((entry) => entry.key === key.toUpperCase());
      if (match !== undefined) {
        event.preventDefault();
        chooseTool(match.id);
      }
    }
  };

  const minHeight = Math.min(MAX_SKETCH_HEIGHT, Math.max(MIN_SKETCH_HEIGHT, Math.ceil(contentBottom(shapes) + 24)));
  const clampHeight = (value: number) => Math.min(MAX_SKETCH_HEIGHT, Math.max(minHeight, Math.round(value)));

  const handleResizeDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = { startY: event.clientY, startHeight: height, unitsPerPx: unitsPerPx() };
  };

  const resizeFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeRef.current;
    return start === null ? null : clampHeight(start.startHeight + (event.clientY - start.startY) * start.unitsPerPx);
  };

  const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const next = resizeFromPointer(event);
    if (next !== null && next !== height) onHeightChange(next, false);
  };

  const handleResizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const next = resizeFromPointer(event);
    resizeRef.current = null;
    if (next !== null) onHeightChange(next, true);
  };

  const handleResizeKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? HEIGHT_KEY_STEP_FAR : HEIGHT_KEY_STEP;
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = height + step;
    else if (event.key === 'ArrowUp') next = height - step;
    else if (event.key === 'Home') next = minHeight;
    else if (event.key === 'End') next = MAX_SKETCH_HEIGHT;
    if (next === null) return;
    consume(event);
    onHeightChange(clampHeight(next), true);
  };

  const moveIds = gesture?.kind === 'move' ? gesture.ids : null;
  const editingId = textEdit?.id;
  const staticShapes = useMemo(() => {
    if (moveIds === null && editingId === undefined) return shapes;
    return shapes.filter((shape) => shape.id !== editingId && !(moveIds?.includes(shape.id) ?? false));
  }, [shapes, moveIds, editingId]);
  const moving = gesture?.kind === 'move' ? gesture : null;
  const movingShapes = moving === null ? NO_SHAPES : shapes.filter((shape) => moving.ids.includes(shape.id));
  const selectedBounds = shapes.filter((shape) => selected.includes(shape.id)).map(shapeBounds);
  const offsetX = moving?.dx ?? 0;
  const offsetY = moving?.dy ?? 0;
  const undoShortcut = shortcutLabel('⌘Z');
  const redoShortcut = shortcutLabel('⇧⌘Z');

  return (
    <div
      className={`notebook-sketch-block${tool !== 'pen' || textEdit !== null ? ' is-pinned' : ''}`}
      onKeyDown={handleKeyDown}
    >
      <div
        aria-label="Herramientas del boceto"
        className="notebook-sketch-strip"
        role="group"
        onMouseDown={(event) => event.preventDefault()}
      >
        <div aria-label="Herramienta" className="notebook-sketch-group" role="group">
          {TOOLS.map((entry) => (
            <ToolButton
              className="notebook-tool"
              icon={entry.icon}
              key={entry.id}
              label={entry.label}
              pressed={tool === entry.id}
              shortcut={entry.key}
              onClick={() => chooseTool(entry.id)}
            />
          ))}
        </div>
        <span aria-hidden="true" className="notebook-sketch-divider" />
        <div aria-label="Color" className="notebook-sketch-group" role="group">
          {COLORS.map((entry) => (
            <button
              aria-label={entry.label}
              aria-pressed={color === entry.id}
              className="notebook-swatch"
              data-color={entry.id}
              key={entry.id}
              title={entry.label}
              type="button"
              onClick={() => chooseColor(entry.id)}
              onMouseDown={(event) => event.preventDefault()}
            >
              <span aria-hidden="true" className="notebook-swatch-dot" />
            </button>
          ))}
        </div>
        <span aria-hidden="true" className="notebook-sketch-divider is-history" />
        <div aria-label="Historial" className="notebook-sketch-group is-history" role="group">
          <ToolButton className="notebook-tool" disabled={history.past.length === 0} icon={Undo2} label="Deshacer" shortcut={undoShortcut} onClick={undo} />
          <ToolButton className="notebook-tool" disabled={history.future.length === 0} icon={Redo2} label="Rehacer" shortcut={redoShortcut} onClick={redo} />
        </div>
        {actions !== undefined ? <div className="notebook-sketch-actions">{actions}</div> : null}
      </div>

      <div className="notebook-sketch" data-tool={tool}>
        <div aria-hidden="true" className="notebook-sketch-paper" />
        <svg
          aria-describedby={descriptionId}
          aria-label="Boceto"
          aria-roledescription="boceto"
          className="notebook-sketch-surface"
          preserveAspectRatio="xMinYMin meet"
          ref={(element) => {
            svgRef.current = element;
            surfaceRef?.(element);
          }}
          role="application"
          style={{ aspectRatio: `${NOTEBOOK_LOGICAL_WIDTH} / ${height}` }}
          tabIndex={0}
          viewBox={`0 0 ${NOTEBOOK_LOGICAL_WIDTH} ${height}`}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerCancel={() => setGesture(null)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishGesture}
        >
          <ShapesLayer ghostIds={gesture?.kind === 'erase' ? gesture.ids : NO_IDS} shapes={staticShapes} />
          {moving !== null ? (
            <g transform={`translate(${offsetX} ${offsetY})`}>
              {movingShapes.map((shape) => <ShapeView key={shape.id} shape={shape} />)}
            </g>
          ) : null}
          {gesture?.kind === 'pen' ? (
            <path {...stroke} d={smoothPath(gesture.points)} strokeWidth={2} style={{ stroke: COLOR_VAR[color] }} />
          ) : null}
          {gesture?.kind === 'arrow' ? (
            <path
              {...stroke}
              d={arrowPath(gesture.from.x, gesture.from.y, gesture.to.x, gesture.to.y)}
              strokeWidth={1.5}
              style={{ stroke: COLOR_VAR[color] }}
            />
          ) : null}
          {gesture?.kind === 'rect' ? (() => {
            const rect = rectFromCorners(gesture.from, gesture.to, gesture.square);
            return <rect {...stroke} height={rect.h} rx={5} strokeWidth={1.5} style={{ stroke: COLOR_VAR[color] }} width={rect.w} x={rect.x} y={rect.y} />;
          })() : null}
          {gesture?.kind === 'marquee' ? (
            <rect
              className="notebook-sketch-marquee"
              height={Math.abs(gesture.to.y - gesture.from.y)}
              width={Math.abs(gesture.to.x - gesture.from.x)}
              x={Math.min(gesture.from.x, gesture.to.x)}
              y={Math.min(gesture.from.y, gesture.to.y)}
            />
          ) : null}
          {selectedBounds.length > 0 ? (
            <g transform={`translate(${offsetX} ${offsetY})`}>
              {selectedBounds.length <= 20
                ? selectedBounds.map((bounds, index) => <SelectionBox bounds={bounds} key={index} />)
                : <SelectionBox bounds={unionBounds(selectedBounds) as Bounds} />}
            </g>
          ) : null}
        </svg>
        <span className="notebook-visually-hidden" id={descriptionId}>
          Dibujá con el mouse o el trackpad. Atajos: V, P, A, R, T y E cambian de herramienta; Esc vuelve al diagrama.
        </span>

        {textLimitHint !== null ? <p className="notebook-sketch-hint" role="status">{textLimitHint}</p> : null}
        {textEdit !== null ? (
          <input
            aria-label="Texto del boceto"
            autoFocus
            className="notebook-sketch-input"
            defaultValue={textEdit.value}
            ref={textInputRef}
            style={{
              color: COLOR_VAR[textEdit.color],
              left: `${textEdit.x / 10}%`,
              maxWidth: `${(NOTEBOOK_LOGICAL_WIDTH - textEdit.x) / 10}cqw`,
              top: `${(textEdit.y / height) * 100}%`,
            }}
            onBlur={(event) => commitText(event.currentTarget.value)}
            onChange={(event) => {
              const field = event.currentTarget;
              field.value = limitTextChange(textEditRef.current?.value ?? '', field.value);
              if (textEditRef.current !== null) textEditRef.current = { ...textEditRef.current, value: field.value };
              setTextLimitHint(field.value.length >= MAX_TEXT_LENGTH ? TEXT_LIMIT_HINT : null);
              field.style.width = `${Math.max(6, field.value.length + 1)}ch`;
            }}
            onPaste={(event) => {
              event.preventDefault();
              const field = event.currentTarget;
              const next = limitTextPaste(field.value, field.selectionStart ?? 0, field.selectionEnd ?? 0, event.clipboardData.getData('text/plain'));
              field.value = next.value;
              field.setSelectionRange(next.caret, next.caret);
              if (textEditRef.current !== null) textEditRef.current = { ...textEditRef.current, value: next.value };
              setTextLimitHint(next.truncated ? TEXT_PASTE_HINT : next.value.length >= MAX_TEXT_LENGTH ? TEXT_LIMIT_HINT : null);
              field.style.width = `${Math.max(6, field.value.length + 1)}ch`;
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter') {
                consume(event);
                commitText(event.currentTarget.value);
                closeTextEdit(true);
              } else if (event.key === 'Escape') {
                consume(event);
                closeTextEdit(true);
              } else {
                event.stopPropagation();
              }
            }}
            onFocus={(event) => {
              event.currentTarget.style.width = `${Math.max(6, event.currentTarget.value.length + 1)}ch`;
            }}
          />
        ) : null}

        {limitHint ? <p className="notebook-sketch-hint" role="status">Este boceto llegó al límite de trazos.</p> : null}

        <div
          aria-label="Alto del boceto"
          aria-orientation="horizontal"
          aria-valuemax={MAX_SKETCH_HEIGHT}
          aria-valuemin={minHeight}
          aria-valuenow={height}
          className="notebook-sketch-resize"
          role="separator"
          tabIndex={0}
          onKeyDown={handleResizeKey}
          onPointerCancel={handleResizeEnd}
          onPointerMove={handleResizeMove}
          onPointerDown={handleResizeDown}
          onPointerUp={handleResizeEnd}
        />
      </div>
    </div>
  );
}
