import { jsPDF } from 'jspdf';
import type { FlowDocLine, FlowDocSegment, FlowDocTable, FlowDocument } from './flowDocument';
import { formatPathRef } from './flowDocument';

/*
 * PDF export drawn with jsPDF's own text layout (WKWebView has no print
 * dialog). Rows split across pages line by line, so a long step such as a
 * 60-line «Actualizar estado» never gets cut or shrunk.
 */

const PAGE = { width: 842, height: 595 };
const MARGIN = 34;
const FONT_SIZE = 9.5;
const LINE_HEIGHT = 12;
const BASELINE = 9;
const PAD_X = 5;
const PAD_Y = 3.5;
const DEPTH_INDENT = 16;
const LABEL_WIDTH = 92;
const ACTOR_WIDTH = 190;
const REF_WIDTH = 64;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

type FontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic';

type Piece = { style: FontStyle; text: string; underline: boolean; x: number };

type VisualLine = { bullet?: { kind: number; x: number }; pieces: Piece[] };

type Column = { align?: 'center'; fill?: [number, number, number]; lines: VisualLine[]; width: number };

const styleOf = (segment: FlowDocSegment, forceBold: boolean): FontStyle => {
  const bold = forceBold || segment.bold === true;
  const italic = segment.italic === true;
  return bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
};

class PdfLayout {
  readonly doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  y = MARGIN;

  constructor() {
    this.doc.setFontSize(FONT_SIZE);
    this.doc.setLineWidth(0.6);
  }

  width(text: string, style: FontStyle): number {
    this.doc.setFont('helvetica', style);
    return this.doc.getTextWidth(text);
  }

  /** Wraps one document line into visual lines inside `width`. */
  wrap(line: FlowDocLine, width: number): VisualLine[] {
    const indent = line.depth * DEPTH_INDENT;
    const marker = line.number;
    const markerStyle: FontStyle = line.bold ? 'bold' : 'normal';
    const markerWidth = marker !== undefined
      ? Math.max(14, this.width(marker, markerStyle) + 6)
      : line.bullet !== undefined ? 11 : 0;
    const textX = indent + markerWidth;
    const available = Math.max(40, width - textX);
    const first: VisualLine = { pieces: [] };

    if (marker !== undefined) {
      first.pieces.push({ style: markerStyle, text: marker, underline: false, x: indent });
    } else if (line.bullet !== undefined) {
      first.bullet = { kind: line.bullet, x: indent + 3 };
    }

    const lines: VisualLine[] = [first];
    let cursor = 0;

    const words = line.segments.flatMap((segment) =>
      segment.text.split(/(\s+)/).filter((part) => part.length > 0).map((part) => ({
        style: styleOf(segment, line.bold === true),
        text: part,
        underline: segment.underline === true,
      })),
    );

    words.forEach((word) => {
      const isSpace = /^\s+$/.test(word.text);
      let wordWidth = this.width(word.text, word.style);

      if (isSpace && cursor === 0) {
        return;
      }

      if (!isSpace && cursor > 0 && cursor + wordWidth > available) {
        lines.push({ pieces: [] });
        cursor = 0;
      }

      let text = word.text;
      // A single identifier wider than the column breaks by characters.
      while (!isSpace && wordWidth > available && text.length > 1) {
        let fit = text.length - 1;
        while (fit > 1 && this.width(text.slice(0, fit), word.style) > available - cursor) {
          fit -= 1;
        }
        lines[lines.length - 1].pieces.push({ ...word, text: text.slice(0, fit), x: textX + cursor });
        lines.push({ pieces: [] });
        cursor = 0;
        text = text.slice(fit);
        wordWidth = this.width(text, word.style);
      }

      lines[lines.length - 1].pieces.push({ ...word, text, x: textX + cursor });
      cursor += wordWidth;
    });

    return lines;
  }

  wrapAll(lines: FlowDocLine[], width: number): { firstVisual: number[]; lines: VisualLine[] } {
    const visual: VisualLine[] = [];
    const firstVisual: number[] = [];
    lines.forEach((line) => {
      firstVisual.push(visual.length);
      visual.push(...this.wrap(line, width));
    });
    return { firstVisual, lines: visual };
  }

  newPage(): void {
    this.doc.addPage();
    this.y = MARGIN;
  }

  ensureSpace(height: number): void {
    if (this.y + height > PAGE.height - MARGIN) {
      this.newPage();
    }
  }

  drawVisualLine(line: VisualLine, x: number, baseline: number, align: 'center' | undefined, width: number): void {
    const doc = this.doc;
    let offset = 0;

    if (align === 'center') {
      const last = line.pieces[line.pieces.length - 1];
      const lineWidth = last === undefined ? 0 : last.x + this.width(last.text, last.style);
      offset = Math.max(0, (width - lineWidth) / 2);
    }

    if (line.bullet !== undefined) {
      const bx = x + offset + line.bullet.x;
      const by = baseline - 3.2;
      if (line.bullet.kind === 0) {
        doc.circle(bx, by, 1.7, 'F');
      } else if (line.bullet.kind === 1) {
        doc.setLineWidth(0.5);
        doc.circle(bx, by, 1.7, 'S');
        doc.setLineWidth(0.6);
      } else {
        doc.rect(bx - 1.6, by - 1.6, 3.2, 3.2, 'F');
      }
    }

    line.pieces.forEach((piece) => {
      doc.setFont('helvetica', piece.style);
      doc.text(piece.text, x + offset + piece.x, baseline);
      if (piece.underline) {
        const pieceWidth = doc.getTextWidth(piece.text);
        doc.setLineWidth(0.4);
        doc.line(x + offset + piece.x, baseline + 1.3, x + offset + piece.x + pieceWidth, baseline + 1.3);
        doc.setLineWidth(0.6);
      }
    });
  }

  /**
   * Draws one table row. Lines that do not fit move to the next page with the
   * cell borders drawn on both sides, so a row reads as continuing.
   */
  drawRow(columns: Column[], options: { openBottom?: boolean; openTop?: boolean } = {}): void {
    const cursors = columns.map(() => 0);
    const total = Math.max(1, ...columns.map((column) => column.lines.length));
    let firstSlice = true;

    while (firstSlice || cursors.some((cursor, index) => cursor < columns[index].lines.length)) {
      const room = Math.floor((PAGE.height - MARGIN - this.y - PAD_Y * 2) / LINE_HEIGHT);
      const remaining = Math.max(1, ...columns.map((column, index) => column.lines.length - cursors[index]));

      if (room < Math.min(2, remaining) && this.y > MARGIN + 1) {
        this.newPage();
        continue;
      }

      const take = Math.max(1, Math.min(room, remaining));
      const height = (firstSlice && total === 0 ? 1 : take) * LINE_HEIGHT + PAD_Y * 2;
      let x = MARGIN;
      const doc = this.doc;

      columns.forEach((column, index) => {
        if (column.fill !== undefined) {
          doc.setFillColor(...column.fill);
          doc.rect(x, this.y, column.width, height, 'F');
          doc.setFillColor(0, 0, 0);
        }

        const slice = column.lines.slice(cursors[index], cursors[index] + take);
        slice.forEach((line, lineIndex) => {
          this.drawVisualLine(line, x + PAD_X, this.y + PAD_Y + lineIndex * LINE_HEIGHT + BASELINE, column.align, column.width - PAD_X * 2);
        });
        cursors[index] += slice.length;

        doc.line(x, this.y, x, this.y + height);
        x += column.width;
      });

      const done = cursors.every((cursor, index) => cursor >= columns[index].lines.length);
      doc.line(x, this.y, x, this.y + height);
      if (firstSlice && !options.openTop) {
        doc.line(MARGIN, this.y, x, this.y);
      }
      if (!(done && options.openBottom)) {
        doc.line(MARGIN, this.y + height, x, this.y + height);
      }

      this.y += height;
      firstSlice = false;

      if (!done) {
        this.newPage();
      }
    }
  }
}

const labelLine = (text: string, bold = false): FlowDocLine => ({ bold, depth: 0, refs: [], segments: [{ text }] });

const drawDescription = (layout: PdfLayout, document: FlowDocument): void => {
  const valueWidth = CONTENT_WIDTH - LABEL_WIDTH;
  document.fields.forEach((field) => {
    layout.drawRow([
      { width: LABEL_WIDTH, lines: layout.wrap(labelLine(field.label), LABEL_WIDTH - PAD_X * 2) },
      { width: valueWidth, lines: layout.wrapAll(field.lines, valueWidth - PAD_X * 2).lines },
    ]);
  });
};

const drawFlowTable = (layout: PdfLayout, table: FlowDocTable): void => {
  const systemWidth = CONTENT_WIDTH - ACTOR_WIDTH - REF_WIDTH;
  layout.ensureSpace(LINE_HEIGHT * 5);
  layout.drawRow([
    { width: CONTENT_WIDTH, align: 'center', fill: [242, 242, 242], lines: layout.wrap(labelLine(table.title, true), CONTENT_WIDTH - PAD_X * 2) },
  ]);
  layout.drawRow([
    { width: ACTOR_WIDTH, align: 'center', lines: layout.wrap(labelLine('ACTOR', true), ACTOR_WIDTH) },
    { width: systemWidth, align: 'center', lines: layout.wrap(labelLine('SISTEMA', true), systemWidth) },
    { width: REF_WIDTH, lines: layout.wrap(labelLine('REF.', true), REF_WIDTH) },
  ]);

  table.rows.forEach((row) => {
    const actor = layout.wrapAll(row.actor, ACTOR_WIDTH - PAD_X * 2);
    const system = layout.wrapAll(row.system, systemWidth - PAD_X * 2);
    const refs: VisualLine[] = [];
    const place = (index: number, text: string): void => {
      while (refs.length <= index) {
        refs.push({ pieces: [] });
      }
      const current = refs[index].pieces[0]?.text;
      refs[index] = { pieces: [{ style: 'normal', text: current === undefined ? text : `${current} ${text}`, underline: false, x: 0 }] };
    };

    if (row.ref.length > 0) {
      place(0, formatPathRef(row.ref));
    }
    row.actor.forEach((line, index) => line.refs.forEach((ref) => place(actor.firstVisual[index], formatPathRef(ref))));
    row.system.forEach((line, index) => line.refs.forEach((ref) => place(system.firstVisual[index], formatPathRef(ref))));

    layout.drawRow([
      { width: ACTOR_WIDTH, lines: actor.lines },
      { width: systemWidth, lines: system.lines },
      { width: REF_WIDTH, lines: refs },
    ]);
  });
};

export const createFlowPdf = (document: FlowDocument): Blob => {
  const layout = new PdfLayout();
  drawDescription(layout, document);
  layout.y += 14;
  drawFlowTable(layout, document.basic);
  document.alternatives.forEach((alternative) => {
    layout.y += 14;
    drawFlowTable(layout, alternative);
  });
  return layout.doc.output('blob');
};
