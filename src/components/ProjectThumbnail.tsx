import { useMemo } from 'react';
import type { DesignArtifact, DesignProject } from '../types/diagram';

const WIDTH = 76;
const HEIGHT = 48;
const PADDING = 5;

type Box = { x: number; y: number; w: number; h: number };
type Line = { x1: number; y1: number; x2: number; y2: number };
type Schematic = { boxes: Box[]; lines: Line[]; rounded: boolean };

/** Nodes store a position but never a measured size, so the schematic assumes a
    uniform box. Layout is what makes a diagram recognisable at this scale. */
const NODE_W = 170;
const NODE_H = 96;

type Positioned = { position?: { x?: unknown; y?: unknown } };

const readPositions = (nodes: unknown): { x: number; y: number }[] => {
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((node) => {
    const position = (node as Positioned)?.position;
    const x = position?.x;
    const y = position?.y;
    return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)
      ? [{ x, y }]
      : [];
  });
};

/** Maps a diagram's own coordinate space onto the thumbnail, preserving aspect. */
const fitToBox = (points: { x: number; y: number }[], boxW: number, boxH: number) => {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x + boxW));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y + boxH));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = Math.min((WIDTH - PADDING * 2) / spanX, (HEIGHT - PADDING * 2) / spanY);
  const offsetX = PADDING + ((WIDTH - PADDING * 2) - spanX * scale) / 2;
  const offsetY = PADDING + ((HEIGHT - PADDING * 2) - spanY * scale) / 2;
  return (point: { x: number; y: number }) => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (point.y - minY) * scale,
    w: boxW * scale,
    h: boxH * scale,
  });
};

const nodeSchematic = (content: unknown, rounded: boolean): Schematic | null => {
  const record = content as { nodes?: unknown; edges?: unknown } | null;
  const positions = readPositions(record?.nodes);
  if (positions.length === 0) return null;

  const project = fitToBox(positions, NODE_W, NODE_H);
  const nodes = Array.isArray(record?.nodes) ? record.nodes : [];
  const centres = new Map<string, { x: number; y: number }>();

  const boxes = positions.map((position, index) => {
    const box = project(position);
    const id = (nodes[index] as { id?: unknown })?.id;
    if (typeof id === 'string') centres.set(id, { x: box.x + box.w / 2, y: box.y + box.h / 2 });
    return box;
  });

  const lines: Line[] = [];
  if (Array.isArray(record?.edges)) {
    record.edges.forEach((edge) => {
      const { source, target } = (edge ?? {}) as { source?: unknown; target?: unknown };
      if (typeof source !== 'string' || typeof target !== 'string') return;
      const from = centres.get(source);
      const to = centres.get(target);
      if (from === undefined || to === undefined) return;
      lines.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
    });
  }

  return { boxes, lines, rounded };
};

/** A sequence diagram reads as lifelines crossed by messages, so draw that
    rather than pretending it is a node graph. */
const sequenceSchematic = (content: unknown): Schematic | null => {
  const record = content as { participants?: unknown; items?: unknown } | null;
  if (!Array.isArray(record?.participants) || record.participants.length === 0) return null;

  const xs = record.participants
    .map((participant) => (participant as { x?: unknown })?.x)
    .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (xs.length === 0) return null;

  const minX = Math.min(...xs);
  const spanX = Math.max(Math.max(...xs) - minX, 1);
  const usable = WIDTH - PADDING * 2 - 12;
  const at = (x: number): number => PADDING + 6 + ((x - minX) / spanX) * usable;

  const boxes: Box[] = xs.map((x) => ({ x: at(x) - 6, y: PADDING, w: 12, h: 7 }));
  const lines: Line[] = xs.map((x) => ({ x1: at(x), y1: PADDING + 7, x2: at(x), y2: HEIGHT - PADDING }));

  const countMessages = (items: unknown): number => {
    if (!Array.isArray(items)) return 0;
    return items.reduce<number>((total, item) => {
      const node = item as { kind?: unknown; operands?: unknown };
      if (node?.kind === 'message') return total + 1;
      if (Array.isArray(node?.operands)) {
        return total + node.operands.reduce<number>(
          (sub, operand) => sub + countMessages((operand as { items?: unknown })?.items),
          0,
        );
      }
      return total;
    }, 0);
  };

  const messages = Math.min(countMessages(record.items), 7);
  const top = PADDING + 12;
  const bottom = HEIGHT - PADDING - 3;
  for (let index = 0; index < messages; index += 1) {
    const y = top + ((bottom - top) * (index + 0.5)) / Math.max(messages, 1);
    const from = at(xs[index % xs.length]);
    const to = at(xs[(index + 1) % xs.length]);
    lines.push({ x1: from, y1: y, x2: to, y2: y });
  }

  return { boxes, lines, rounded: false };
};

/** A flow is a table, so it reads as stacked rules. */
const documentSchematic = (): Schematic => {
  const lines: Line[] = [];
  for (let index = 0; index < 5; index += 1) {
    const y = PADDING + 6 + index * 8;
    lines.push({ x1: PADDING + 4, y1: y, x2: WIDTH - PADDING - (index % 2 === 0 ? 4 : 16), y2: y });
  }
  return { boxes: [], lines, rounded: false };
};

const schematicFor = (artifact: DesignArtifact): Schematic | null => {
  if (artifact.type === 'sequence-diagram') return sequenceSchematic(artifact.content);
  if (artifact.type === 'use-case-flow') return documentSchematic();
  return nodeSchematic(artifact.content, artifact.type === 'use-case-model');
};

/** Order of preference: whichever artifact best says what this project is. */
const PREFERRED: DesignArtifact['type'][] = [
  'class-diagram',
  'class-sequence-diagram',
  'use-case-model',
  'sequence-diagram',
  'use-case-flow',
];

const pickSchematic = (project: DesignProject): Schematic | null => {
  for (const type of PREFERRED) {
    for (const artifact of project.artifacts) {
      if (artifact.type !== type) continue;
      const schematic = schematicFor(artifact);
      if (schematic !== null && (schematic.boxes.length > 0 || schematic.lines.length > 0)) return schematic;
    }
  }
  return null;
};

type ProjectThumbnailProps = {
  project: DesignProject;
  /** Shown when the project has nothing drawable yet. */
  fallback: string;
};

export function ProjectThumbnail({ project, fallback }: ProjectThumbnailProps) {
  const schematic = useMemo(() => pickSchematic(project), [project]);

  if (schematic === null) {
    return (
      <span className="project-home-cover project-home-cover-empty" aria-hidden="true">
        <strong>{fallback}</strong>
      </span>
    );
  }

  return (
    <span className="project-home-cover" aria-hidden="true">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} role="presentation">
        {schematic.lines.map((line, index) => (
          <line
            key={`l${index}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            className="project-home-cover-line"
          />
        ))}
        {schematic.boxes.map((box, index) => (
          <rect
            key={`b${index}`}
            x={box.x}
            y={box.y}
            width={Math.max(box.w, 3)}
            height={Math.max(box.h, 2.5)}
            rx={schematic.rounded ? Math.min(box.h, box.w) / 2 : 1}
            className="project-home-cover-node"
          />
        ))}
      </svg>
    </span>
  );
}
