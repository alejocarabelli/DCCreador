import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type {
  SequenceDiagramContent,
  SequenceFragment,
  SequenceMessage,
  SequenceNote,
  SequenceParticipant,
} from '../types/diagram';
import type { DiagramTheme } from '../theme/themes';
import { buildSequenceMessageNumbers, formatSequenceMessageLabel, formatSequenceParticipantName } from '../utils/sequenceDiagram';
import type { SequenceLayout } from '../utils/sequenceDiagramLayout';
import { getSequenceMessageEndpoints, SEQUENCE_HEADER_HEIGHT, SEQUENCE_HEADER_Y } from '../utils/sequenceDiagramLayout';

type Selection = { kind: 'participant' | 'message' | 'fragment' | 'note'; id: string } | null;

type SequenceDiagramCanvasProps = {
  content: SequenceDiagramContent;
  layout: SequenceLayout;
  selected: Selection;
  theme: DiagramTheme;
  onSelect: (selection: Selection) => void;
  onParticipantPointerDown: (participant: SequenceParticipant, event: ReactPointerEvent<SVGGElement>) => void;
  onNotePointerDown: (note: SequenceNote, event: ReactPointerEvent<SVGGElement>) => void;
  onNoteResizePointerDown: (note: SequenceNote, event: ReactPointerEvent<SVGRectElement>) => void;
  onFragmentPointerDown?: (fragment: SequenceFragment, event: ReactPointerEvent<SVGGElement>) => void;
  onFragmentResizePointerDown?: (
    fragment: SequenceFragment,
    handle: 'nw' | 'ne' | 'se' | 'sw' | 'e' | 's' | 'w' | 'n',
    event: ReactPointerEvent<SVGElement>,
  ) => void;
  onConnect?: (sourceId: string, targetId: string, y: number) => void;
  onEditMessage?: (id: string) => void;
  svgRef?: (element: SVGSVGElement | null) => void;
};

const wrapText = (text: string, maxCharacters: number): string[] => {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean).flatMap((word) => {
      if (word.length <= maxCharacters) return [word];
      const chunks: string[] = [];
      for (let index = 0; index < word.length; index += maxCharacters) chunks.push(word.slice(index, index + maxCharacters));
      return chunks;
    });
    if (words.length === 0) {
      lines.push('');
      return;
    }
    let line = '';
    words.forEach((word) => {
      const candidate = line.length === 0 ? word : `${line} ${word}`;
      if (candidate.length <= maxCharacters || line.length === 0) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    });
    if (line.length > 0) lines.push(line);
  });
  return lines.slice(0, 12);
};

const ParticipantGlyph = ({ participant, x, y, stroke }: { participant: SequenceParticipant; x: number; y: number; stroke: string }) => {
  if (participant.kind === 'actor') {
    return (
      <g aria-hidden="true" fill="none" stroke={stroke} strokeWidth="1.6">
        <circle cx={x} cy={y + 13} r="8" />
        <line x1={x} y1={y + 21} x2={x} y2={y + 39} />
        <line x1={x - 13} y1={y + 27} x2={x + 13} y2={y + 27} />
        <line x1={x} y1={y + 39} x2={x - 11} y2={y + 54} />
        <line x1={x} y1={y + 39} x2={x + 11} y2={y + 54} />
      </g>
    );
  }
  const iconX = x;
  const iconY = y + 10;
  if (participant.kind === 'boundary') {
    return <g aria-hidden="true" fill="none" stroke={stroke} strokeWidth="1.2"><circle cx={iconX - 4} cy={iconY} r="5" /><line x1={iconX + 1} y1={iconY} x2={iconX + 9} y2={iconY} /><line x1={iconX + 9} y1={iconY - 7} x2={iconX + 9} y2={iconY + 7} /></g>;
  }
  if (participant.kind === 'control') {
    return <g aria-hidden="true" fill="none" stroke={stroke} strokeWidth="1.2"><circle cx={iconX} cy={iconY} r="6" /><path d={`M ${iconX - 2} ${iconY - 8} L ${iconX + 3} ${iconY - 8} L ${iconX + 1} ${iconY - 4}`} /></g>;
  }
  if (participant.kind === 'entity') {
    return <g aria-hidden="true" fill="none" stroke={stroke} strokeWidth="1.2"><rect x={iconX - 6} y={iconY - 6} width="12" height="12" /><line x1={iconX - 6} y1={iconY - 2} x2={iconX + 6} y2={iconY - 2} /><line x1={iconX - 6} y1={iconY + 2} x2={iconX + 6} y2={iconY + 2} /></g>;
  }
  return null;
};

export function SequenceDiagramCanvas({
  content,
  layout,
  selected,
  theme,
  onSelect,
  onParticipantPointerDown,
  onNotePointerDown,
  onNoteResizePointerDown,
  onFragmentPointerDown,
  onFragmentResizePointerDown,
  onConnect,
  onEditMessage,
  svgRef,
}: SequenceDiagramCanvasProps) {
  const stroke = theme.association.stroke;
  const selectedStroke = theme.association.strokeSelected;
  const participantFill = theme.classNode.background;
  const participantBorder = theme.classNode.border;
  const textColor = theme.classNode.text;
  const muted = theme.classNode.mutedText;
  const numbers = buildSequenceMessageNumbers(content);
  const svgElementRef = useRef<SVGSVGElement | null>(null);
  type ConnectionState = {
    sourceId: string;
    targetId: string | null;
    pointerId: number | null;
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
    fromPendingClick: boolean;
  };
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const connectionRef = useRef<ConnectionState | null>(null);

  const updateConnection = (next: ConnectionState | null): void => {
    connectionRef.current = next;
    setConnection(next);
  };

  const pointInSvg = (svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } => {
    const transform = svg.getScreenCTM?.();
    if (transform !== null && transform !== undefined) {
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const transformed = point.matrixTransform(transform.inverse());
      return { x: transformed.x, y: transformed.y };
    }
    const bounds = svg.getBoundingClientRect();
    return {
      x: bounds.width > 0 ? ((clientX - bounds.left) / bounds.width) * layout.width : clientX,
      y: bounds.height > 0 ? ((clientY - bounds.top) / bounds.height) * layout.height : clientY,
    };
  };

  const participantAtPoint = (point: { x: number; y: number }): SequenceParticipant | undefined => {
    let nearest: SequenceParticipant | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    content.participants.forEach((participant) => {
      const x = layout.participantX.get(participant.id);
      const startY = layout.participantStartY.get(participant.id);
      const endY = layout.participantEndY.get(participant.id);
      if (x === undefined || startY === undefined || endY === undefined || point.y < startY || point.y > endY) return;
      const distance = Math.abs(point.x - x);
      if (distance <= 22 && distance < nearestDistance) {
        nearest = participant;
        nearestDistance = distance;
      }
    });
    return nearest;
  };

  const releasePointer = (svg: SVGSVGElement, pointerId: number): void => {
    if (svg.hasPointerCapture?.(pointerId)) svg.releasePointerCapture(pointerId);
  };

  const cancelConnection = (): void => {
    const current = connectionRef.current;
    const svg = svgElementRef.current;
    if (current?.pointerId !== null && current?.pointerId !== undefined && svg) releasePointer(svg, current.pointerId);
    updateConnection(null);
  };

  useEffect(() => {
    if (connection === null) return undefined;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      const current = connectionRef.current;
      const svg = svgElementRef.current;
      if (current?.pointerId !== null && current?.pointerId !== undefined && svg && svg.hasPointerCapture?.(current.pointerId)) {
        svg.releasePointerCapture(current.pointerId);
      }
      connectionRef.current = null;
      setConnection(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connection]);

  const handleLifelinePointerDown = (participantId: string, event: ReactPointerEvent<SVGRectElement>): void => {
    if (!onConnect || event.button !== 0) return;
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement ?? svgElementRef.current;
    if (!svg) return;
    const point = pointInSvg(svg, event.clientX, event.clientY);
    const pending = connectionRef.current?.pointerId === null ? connectionRef.current : null;
    const next: ConnectionState = {
      sourceId: pending?.sourceId ?? participantId,
      targetId: pending ? participantId : participantId,
      pointerId: event.pointerId,
      x: point.x,
      y: pending?.startY ?? point.y,
      startX: point.x,
      startY: pending?.startY ?? point.y,
      moved: false,
      fromPendingClick: pending !== null,
    };
    updateConnection(next);
    svg.setPointerCapture?.(event.pointerId);
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const current = connectionRef.current;
    if (!current || (current.pointerId !== null && current.pointerId !== event.pointerId)) return;
    const point = pointInSvg(event.currentTarget, event.clientX, event.clientY);
    const target = participantAtPoint({ x: point.x, y: current.startY });
    if (current.pointerId === null) {
      updateConnection({ ...current, x: point.x, y: current.startY, targetId: target?.id ?? null });
      return;
    }
    const moved = current.moved || Math.hypot(point.x - current.startX, point.y - current.startY) > 4;
    updateConnection({ ...current, x: point.x, y: current.startY, targetId: target?.id ?? null, moved });
  };

  const handleCanvasPointerUp = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const current = connectionRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const point = pointInSvg(event.currentTarget, event.clientX, event.clientY);
    const target = participantAtPoint({ x: point.x, y: current.startY });
    releasePointer(event.currentTarget, event.pointerId);
    if (current.fromPendingClick || current.moved) {
      if (target) onConnect?.(current.sourceId, target.id, current.startY);
      updateConnection(null);
      return;
    }
    updateConnection({ ...current, pointerId: null, targetId: null, x: point.x, y: current.startY });
  };

  const handleCanvasPointerCancel = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const current = connectionRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    releasePointer(event.currentTarget, event.pointerId);
    updateConnection(null);
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (!onConnect || event.button !== 0 || connectionRef.current?.pointerId !== null) return;
    const point = pointInSvg(event.currentTarget, event.clientX, event.clientY);
    if (!participantAtPoint(point)) cancelConnection();
  };

  const renderFragment = (fragment: SequenceFragment) => {
    const box = layout.fragmentLayouts.get(fragment.id);
    if (box === undefined) return null;
    const isSelected = selected?.kind === 'fragment' && selected.id === fragment.id;
    return (
      <g
        key={fragment.id}
        className="sequence-fragment"
        data-selected={isSelected || undefined}
        onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'fragment', id: fragment.id }); }}
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target instanceof Element && event.target.hasAttribute('data-export-control'))) return;
          onFragmentPointerDown?.(fragment, event);
        }}
      >
        <rect x={box.x} y={box.y} width={box.width} height={box.height} fill="rgba(255,255,255,0.16)" stroke={isSelected ? selectedStroke : stroke} strokeWidth={isSelected ? 2 : 1.2} cursor="move" />
        <path d={`M ${box.x} ${box.y} H ${box.x + 82} L ${box.x + 94} ${box.y + 22} H ${box.x} Z`} fill={participantFill} stroke={isSelected ? selectedStroke : stroke} cursor="move" />
        <text x={box.x + 9} y={box.y + 16} fill={textColor} fontSize="12" fontWeight="bold" cursor="move">{fragment.operator}</text>
        {fragment.name ? <text x={box.x + 104} y={box.y + 17} fill={muted} fontSize="11">{fragment.name}</text> : null}
        {box.operands.map((operand, index) => (
          <g key={operand.id}>
            {index > 0 ? <line x1={box.x} y1={operand.top} x2={box.x + box.width} y2={operand.top} stroke={stroke} strokeDasharray="7 5" /> : null}
            <text x={box.x + 12} y={operand.top + 18} fill={textColor} fontSize="11">[{operand.guard || 'condición'}]</text>
          </g>
        ))}
        {isSelected ? (
          <g data-export-control="true">
            {/* Esquinas (NW, NE, SE, SW) */}
            <rect x={box.x - 5} y={box.y - 5} width="10" height="10" rx="2" fill={selectedStroke} stroke="#fff" strokeWidth="1.2" cursor="nwse-resize" onPointerDown={(event) => { event.stopPropagation(); onFragmentResizePointerDown?.(fragment, 'nw', event); }} />
            <rect x={box.x + box.width - 5} y={box.y - 5} width="10" height="10" rx="2" fill={selectedStroke} stroke="#fff" strokeWidth="1.2" cursor="nesw-resize" onPointerDown={(event) => { event.stopPropagation(); onFragmentResizePointerDown?.(fragment, 'ne', event); }} />
            <rect x={box.x + box.width - 5} y={box.y + box.height - 5} width="10" height="10" rx="2" fill={selectedStroke} stroke="#fff" strokeWidth="1.2" cursor="nwse-resize" onPointerDown={(event) => { event.stopPropagation(); onFragmentResizePointerDown?.(fragment, 'se', event); }} />
            <rect x={box.x - 5} y={box.y + box.height - 5} width="10" height="10" rx="2" fill={selectedStroke} stroke="#fff" strokeWidth="1.2" cursor="nesw-resize" onPointerDown={(event) => { event.stopPropagation(); onFragmentResizePointerDown?.(fragment, 'sw', event); }} />
            {/* Bordes (N, S, W, E) */}
            <rect x={box.x + box.width / 2 - 12} y={box.y - 4} width="24" height="8" rx="2" fill={selectedStroke} stroke="#fff" strokeWidth="1.2" cursor="ns-resize" onPointerDown={(event) => { event.stopPropagation(); onFragmentResizePointerDown?.(fragment, 'n', event); }} />
            <rect x={box.x + box.width / 2 - 12} y={box.y + box.height - 4} width="24" height="8" rx="2" fill={selectedStroke} stroke="#fff" strokeWidth="1.2" cursor="ns-resize" onPointerDown={(event) => { event.stopPropagation(); onFragmentResizePointerDown?.(fragment, 's', event); }} />
            <rect x={box.x - 4} y={box.y + box.height / 2 - 12} width="8" height="24" rx="2" fill={selectedStroke} stroke="#fff" strokeWidth="1.2" cursor="ew-resize" onPointerDown={(event) => { event.stopPropagation(); onFragmentResizePointerDown?.(fragment, 'w', event); }} />
            <rect x={box.x + box.width - 4} y={box.y + box.height / 2 - 12} width="8" height="24" rx="2" fill={selectedStroke} stroke="#fff" strokeWidth="1.2" cursor="ew-resize" onPointerDown={(event) => { event.stopPropagation(); onFragmentResizePointerDown?.(fragment, 'e', event); }} />
          </g>
        ) : null}
      </g>
    );
  };

  const renderMessage = (message: SequenceMessage) => {
    const box = layout.messageLayouts.get(message.id);
    const endpoints = getSequenceMessageEndpoints(content, layout, message);
    const sourceX = endpoints?.sourceX;
    const targetX = endpoints?.targetX;
    if (box === undefined || sourceX === undefined || targetX === undefined) return null;
    const isSelected = selected?.kind === 'message' && selected.id === message.id;
    const lineStroke = isSelected ? selectedStroke : stroke;
    const isSelf = message.sourceId === message.targetId;
    const dashed = message.type === 'return' || message.type === 'create';
    const marker = message.type === 'synchronous' ? 'url(#sequence-arrow-filled)' : 'url(#sequence-arrow-open)';
    const label = formatSequenceMessageLabel(message, numbers.get(message.id));
    const direction = targetX >= sourceX ? 1 : -1;
    const path = isSelf
      ? `M ${sourceX} ${box.y} H ${Math.max(sourceX, targetX) + 52} v 30 H ${targetX}`
      : `M ${sourceX} ${box.y} L ${targetX} ${box.y}`;
    const labelX = isSelf ? sourceX + 38 * direction : (sourceX + targetX) / 2;
    const labelLines = wrapText(label, Math.max(18, Math.floor(Math.abs(targetX - sourceX) / 7.6)));
    const labelWidth = Math.min(Math.max(70, ...labelLines.map((line) => line.length * 6.3 + 12)), Math.max(90, Math.abs(targetX - sourceX) - 26));
    const labelY = box.y - 10 - (labelLines.length - 1) * 14;

    return (
      <g
        key={message.id}
        className="sequence-message"
        data-sequence-message-bottom={box.y + box.height / 2}
        data-sequence-message-top={box.y - box.height / 2}
        data-selected={isSelected || undefined}
        onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'message', id: message.id }); }}
        onDoubleClick={(event) => {
          if (!onEditMessage) return;
          event.stopPropagation();
          onEditMessage(message.id);
        }}
      >
        <path d={path} fill="none" stroke={lineStroke} strokeWidth={isSelected ? 2 : 1.4} strokeDasharray={dashed ? '7 5' : undefined} markerEnd={message.type === 'destroy' ? undefined : marker} />
        <path d={path} fill="none" stroke="transparent" strokeWidth="14" />
        {message.type === 'destroy' ? (
          <g stroke={lineStroke} strokeWidth="2">
            <line x1={targetX - 8} y1={box.y - 8} x2={targetX + 8} y2={box.y + 8} />
            <line x1={targetX + 8} y1={box.y - 8} x2={targetX - 8} y2={box.y + 8} />
          </g>
        ) : null}
        {message.type !== 'return' && label.length > 0 ? (
          <g>
            <rect x={labelX - labelWidth / 2} y={labelY - 13} width={labelWidth} height={labelLines.length * 14 + 5} rx="3" fill={theme.canvas.background} opacity="0.96" />
            <text x={labelX} y={labelY} fill={textColor} fontSize="11.5" textAnchor="middle">
              {labelLines.map((line, index) => <tspan key={`${message.id}:${index}`} x={labelX} dy={index === 0 ? 0 : 14}>{line}</tspan>)}
            </text>
          </g>
        ) : null}
        {message.flowReference ? <text x={labelX} y={box.y + 17} fill={muted} fontSize="9.5" textAnchor="middle">Ref. {message.flowReference}</text> : null}
      </g>
    );
  };

  return (
    <svg
      aria-label="Diagrama de secuencia"
      className="sequence-diagram-svg"
      data-sequence-export-root="true"
      height={layout.height}
      onClick={() => onSelect(null)}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onPointerCancel={handleCanvasPointerCancel}
      role="img"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      xmlns="http://www.w3.org/2000/svg"
      fontFamily="Arial, sans-serif"
      ref={(element) => {
        svgElementRef.current = element;
        svgRef?.(element);
      }}
    >
      <defs>
        <marker id="sequence-arrow-filled" markerHeight="8" markerUnits="strokeWidth" markerWidth="10" orient="auto" refX="10" refY="4" viewBox="0 0 10 8">
          <path d="M 0 0 L 10 4 L 0 8 Z" fill={stroke} />
        </marker>
        <marker id="sequence-arrow-open" markerHeight="9" markerUnits="strokeWidth" markerWidth="11" orient="auto" refX="10" refY="4.5" viewBox="0 0 11 9">
          <path d="M 1 1 L 10 4.5 L 1 8" fill="none" stroke={stroke} strokeWidth="1.3" />
        </marker>
        <marker id="sequence-arrow-preview" markerHeight="9" markerUnits="strokeWidth" markerWidth="11" orient="auto" refX="10" refY="4.5" viewBox="0 0 11 9">
          <path d="M 1 1 L 10 4.5 L 1 8" fill="none" stroke={selectedStroke} strokeWidth="1.5" />
        </marker>
        <pattern id="sequence-paper-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.75" fill={theme.canvas.gridColorStrong} opacity="0.48" />
        </pattern>
      </defs>
      <rect width={layout.width} height={layout.height} fill={theme.canvas.background} />
      <rect data-export-control="true" width={layout.width} height={layout.height} fill="url(#sequence-paper-grid)" />

      {Array.from(layout.fragmentLayouts.keys()).map((id) => {
        const find = (items: SequenceDiagramContent['items']): SequenceFragment | undefined => {
          for (const item of items) {
            if (item.kind === 'fragment' && item.id === id) return item;
            if (item.kind === 'fragment') {
              for (const operand of item.operands) {
                const nested = find(operand.items);
                if (nested !== undefined) return nested;
              }
            }
          }
          return undefined;
        };
        const fragment = find(content.items);
        return fragment ? renderFragment(fragment) : null;
      })}

      {content.participants.map((participant) => {
        const x = layout.participantX.get(participant.id) ?? 0;
        const startY = layout.participantStartY.get(participant.id) ?? SEQUENCE_HEADER_Y + SEQUENCE_HEADER_HEIGHT;
        const endY = layout.participantEndY.get(participant.id) ?? layout.height - 50;
        return <line key={`life:${participant.id}`} x1={x} y1={startY} x2={x} y2={endY} stroke={stroke} strokeDasharray="6 5" strokeWidth="1.1" />;
      })}

      {content.showActivations ? layout.activationLayouts.map((activation) => (
        <rect key={activation.id} x={activation.x} y={activation.y} width={activation.width} height={activation.height} fill={participantFill} stroke={stroke} strokeWidth="1" />
      )) : null}

      {onConnect ? content.participants.map((participant) => {
        const x = layout.participantX.get(participant.id);
        const startY = layout.participantStartY.get(participant.id);
        const endY = layout.participantEndY.get(participant.id);
        if (x === undefined || startY === undefined || endY === undefined) return null;
        return (
          <rect
            key={`lifeline-hit:${participant.id}`}
            data-export-control="true"
            data-sequence-lifeline-hit={participant.id}
            x={x - 22}
            y={startY}
            width="44"
            height={Math.max(1, endY - startY)}
            fill="transparent"
            pointerEvents="all"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => handleLifelinePointerDown(participant.id, event)}
          />
        );
      }) : null}

      {layout.orderedMessages.map(renderMessage)}

      {onConnect && connection?.targetId ? (() => {
        const target = content.participants.find((participant) => participant.id === connection.targetId);
        const targetX = target ? layout.participantX.get(target.id) : undefined;
        const targetStartY = target ? layout.participantStartY.get(target.id) : undefined;
        const targetEndY = target ? layout.participantEndY.get(target.id) : undefined;
        if (!target || targetX === undefined || targetStartY === undefined || targetEndY === undefined) return null;
        return <rect data-export-control="true" data-sequence-lifeline-target={target.id} x={targetX - 25} y={targetStartY} width="50" height={Math.max(1, targetEndY - targetStartY)} fill={selectedStroke} opacity="0.1" stroke={selectedStroke} strokeDasharray="4 4" pointerEvents="none" />;
      })() : null}

      {onConnect && connection ? (() => {
        const sourceX = layout.participantX.get(connection.sourceId);
        if (sourceX === undefined) return null;
        const targetX = connection.targetId
          ? layout.participantX.get(connection.targetId) ?? connection.x
          : connection.x;
        const direction = targetX >= sourceX ? 1 : -1;
        const self = connection.targetId === connection.sourceId;
        const path = self
          ? `M ${sourceX} ${connection.y} h ${52 * direction} v 24 h ${-52 * direction}`
          : `M ${sourceX} ${connection.y} L ${targetX} ${connection.y}`;
        return <path data-export-control="true" data-sequence-connection-preview="true" d={path} fill="none" stroke={selectedStroke} strokeWidth="2" strokeDasharray="6 4" markerEnd="url(#sequence-arrow-preview)" pointerEvents="none" />;
      })() : null}

      {content.participants.map((participant) => {
        const x = layout.participantX.get(participant.id) ?? 0;
        const createY = participant.createdByMessageId ? layout.messageLayouts.get(participant.createdByMessageId)?.y : undefined;
        const headerY = createY === undefined ? SEQUENCE_HEADER_Y : createY - SEQUENCE_HEADER_HEIGHT / 2;
        const isActor = participant.kind === 'actor';
        const isSelected = selected?.kind === 'participant' && selected.id === participant.id;
        const name = formatSequenceParticipantName(participant);
        const nameLines = wrapText(name, 23).slice(0, 2);
        return (
          <g
            key={participant.id}
            className="sequence-participant"
            data-selected={isSelected || undefined}
            data-sequence-top-header={createY === undefined ? 'true' : undefined}
            data-sequence-label={name}
            data-sequence-x={x}
            onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'participant', id: participant.id }); }}
            onPointerDown={(event) => onParticipantPointerDown(participant, event)}
          >
            {isActor ? (
              <>
                <ParticipantGlyph participant={participant} x={x} y={headerY} stroke={isSelected ? selectedStroke : stroke} />
                <text x={x} y={headerY + 72} fill={textColor} fontSize="11" fontWeight="bold" textAnchor="middle">{name}</text>
                <rect data-export-control="true" x={x - 46} y={headerY} width="92" height="80" fill="transparent" stroke={isSelected ? selectedStroke : 'transparent'} strokeWidth="2" />
              </>
            ) : (
              <>
                <rect x={x - 80} y={headerY} width="160" height={SEQUENCE_HEADER_HEIGHT} rx="3" fill={participantFill} stroke={isSelected ? selectedStroke : participantBorder} strokeWidth={isSelected ? 2 : 1.2} />
                <ParticipantGlyph participant={participant} x={x} y={headerY} stroke={isSelected ? selectedStroke : stroke} />
                <text x={x} y={headerY + 29} fill={textColor} fontSize="11" fontWeight="bold" textAnchor="middle">
                  {nameLines.map((line, index) => <tspan key={`${participant.id}:name:${index}`} x={x} dy={index === 0 ? 0 : 12}>{line}</tspan>)}
                </text>
                <text x={x} y={headerY + 53} fill={muted} fontSize="9.5" textAnchor="middle">«{participant.kind}»</text>
              </>
            )}
          </g>
        );
      })}

      {content.notes.map((note) => {
        const isSelected = selected?.kind === 'note' && selected.id === note.id;
        const lines = wrapText(note.text || 'Nota', Math.max(12, Math.floor((note.width - 24) / 7)));
        const anchorPoint = note.anchorKind === 'message' && note.anchorId
          ? (() => {
              const message = layout.orderedMessages.find((candidate) => candidate.id === note.anchorId);
              const messageLayout = layout.messageLayouts.get(note.anchorId);
              if (!message || !messageLayout) return undefined;
              const sourceX = layout.participantX.get(message.sourceId) ?? 0;
              const targetX = layout.participantX.get(message.targetId) ?? sourceX;
              return { x: (sourceX + targetX) / 2, y: messageLayout.y };
            })()
          : note.anchorKind === 'fragment' && note.anchorId
            ? (() => {
                const fragment = layout.fragmentLayouts.get(note.anchorId);
                return fragment ? { x: fragment.x + fragment.width, y: fragment.y + 26 } : undefined;
              })()
            : note.anchorKind === 'participant' && note.anchorId
              ? { x: layout.participantX.get(note.anchorId) ?? 0, y: SEQUENCE_HEADER_Y + SEQUENCE_HEADER_HEIGHT }
              : undefined;
        return (
          <g
            key={note.id}
            className="sequence-note"
            data-selected={isSelected || undefined}
            onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'note', id: note.id }); }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onSelect({ kind: 'note', id: note.id });
            }}
            onPointerDown={(event) => onNotePointerDown(note, event)}
          >
            {anchorPoint ? (
              <g>
                <circle cx={anchorPoint.x} cy={anchorPoint.y} r="3" fill={theme.parametricNote.connectionLine} />
                <line
                  x1={anchorPoint.x}
                  y1={anchorPoint.y}
                  x2={note.x + note.width / 2}
                  y2={note.y + note.height / 2}
                  stroke={theme.parametricNote.connectionLine}
                  strokeWidth="1.4"
                  strokeDasharray={theme.parametricNote.connectionDash}
                />
              </g>
            ) : null}
            <path d={`M ${note.x} ${note.y} H ${note.x + note.width - 20} L ${note.x + note.width} ${note.y + 20} V ${note.y + note.height} H ${note.x} Z`} fill={theme.parametricNote.background} stroke={isSelected ? selectedStroke : theme.parametricNote.border} strokeWidth={isSelected ? 2 : 1.1} />
            <path d={`M ${note.x + note.width - 20} ${note.y} V ${note.y + 20} H ${note.x + note.width}`} fill="none" stroke={theme.parametricNote.border} />
            <text x={note.x + 12} y={note.y + 22} fill={theme.parametricNote.text} fontSize="11">
              {lines.map((line, index) => <tspan key={`${note.id}:${index}`} x={note.x + 12} dy={index === 0 ? 0 : 15}>{line}</tspan>)}
            </text>
            {isSelected ? <rect data-export-control="true" x={note.x + note.width - 7} y={note.y + note.height - 7} width="14" height="14" fill={selectedStroke} cursor="nwse-resize" onPointerDown={(event) => onNoteResizePointerDown(note, event)} /> : null}
          </g>
        );
      })}
    </svg>
  );
}
