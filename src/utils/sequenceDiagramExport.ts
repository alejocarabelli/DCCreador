import type { SequenceDiagramContent } from '../types/diagram';
import type { SequenceDiagramBounds } from './sequenceDiagramGeometry';
import type { SequenceLayout } from './sequenceDiagramLayout';
import { resolveParticipantVisualIdentity } from './sequenceParticipantColors';

const SVG_NS = 'http://www.w3.org/2000/svg';
const EXPORT_PADDING = 36;
const MAX_PNG_DIMENSION = 16_384;
const MAX_PNG_PIXELS = 60_000_000;

type PdfDocument = import('jspdf').jsPDF;
type SvgToPdf = typeof import('svg2pdf.js').svg2pdf;

export type SequencePdfPaperSize = 'a4' | 'a3' | 'letter';
export type SequenceExportOrientation = 'portrait' | 'landscape';

export type SequenceExportOptions = {
  paperSize: SequencePdfPaperSize;
  orientation: SequenceExportOrientation;
  marginMm: number;
  scale: number;
};

export type SequenceExportPage = {
  index: number;
  source: SequenceDiagramBounds;
  repeatedParticipantIds: string[];
};

export type SequencePdfPlan = {
  crop: SequenceDiagramBounds;
  pages: SequenceExportPage[];
  effectiveScale: number;
  headerHeight: number;
  warnings: string[];
};

export const defaultSequenceExportOptions: SequenceExportOptions = {
  paperSize: 'a4', orientation: 'landscape', marginMm: 10, scale: 72,
};

const paperSizes: Record<SequencePdfPaperSize, readonly [number, number]> = {
  a4: [595.28, 841.89], a3: [841.89, 1190.55], letter: [612, 792],
};

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const safeSequenceFilename = (name: string): string =>
  (name.trim() || 'diagrama-de-secuencia').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

const cleanExportSvg = (source: SVGSVGElement): SVGSVGElement => {
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-export-control="true"]').forEach((element) => element.remove());
  clone.setAttribute('xmlns', SVG_NS);
  return clone;
};

const svgDimensions = (svg: SVGSVGElement): { width: number; height: number } => {
  const viewBox = svg.viewBox.baseVal;
  return { width: Math.max(1, viewBox.width || Number(svg.getAttribute('width')) || 1200), height: Math.max(1, viewBox.height || Number(svg.getAttribute('height')) || 900) };
};

const paddedBounds = (bounds: SequenceDiagramBounds): SequenceDiagramBounds => {
  const left = Math.floor(bounds.left - EXPORT_PADDING);
  const top = Math.floor(bounds.top - EXPORT_PADDING);
  const right = Math.ceil(bounds.right + EXPORT_PADDING);
  const bottom = Math.ceil(bounds.bottom + EXPORT_PADDING);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
};

/** Content-only crop; the working canvas dimensions never participate. */
export const getSequenceExportBounds = (layout: Pick<SequenceLayout, 'bounds'>): SequenceDiagramBounds => paddedBounds(layout.bounds);

const pageSize = (options: SequenceExportOptions): { width: number; height: number } => {
  const [short, long] = paperSizes[options.paperSize];
  return options.orientation === 'landscape' ? { width: long, height: short } : { width: short, height: long };
};

const intervalUnion = (intervals: Array<{ top: number; bottom: number }>): Array<{ top: number; bottom: number }> => intervals
  .filter((interval) => Number.isFinite(interval.top) && Number.isFinite(interval.bottom) && interval.bottom > interval.top)
  .sort((left, right) => left.top - right.top)
  .reduce<Array<{ top: number; bottom: number }>>((merged, interval) => {
    const last = merged.at(-1);
    if (!last || interval.top > last.bottom) merged.push({ ...interval });
    else last.bottom = Math.max(last.bottom, interval.bottom);
    return merged;
  }, []);

/** Messages, notes, fragment headers, operand guards and activation boundaries are atomic pagination bands. */
export const getSequenceExportProtectedBands = (layout: SequenceLayout): Array<{ top: number; bottom: number }> => intervalUnion([
  ...Array.from(layout.messageLayouts.values()).map((message) => ({
    top: Math.min(message.y - message.height / 2, message.labelTop, message.flowTop ?? Number.POSITIVE_INFINITY) - 4,
    bottom: Math.max(message.y + message.height / 2, message.labelBottom, message.flowBottom ?? Number.NEGATIVE_INFINITY) + 4,
  })),
  ...Array.from(layout.noteLayouts.values()).map((note) => ({ top: note.y - 4, bottom: note.y + note.height + 4 })),
  ...Array.from(layout.fragmentLayouts.values()).flatMap((fragment) => [
    { top: fragment.y - 3, bottom: fragment.y + fragment.headerHeight + 3 },
    ...fragment.operands.map((operand) => ({ top: operand.top - 3, bottom: operand.contentTop + 3 })),
  ]),
  ...layout.activationLayouts.flatMap((activation) => {
    if (activation.height <= 40) {
      return [{ top: activation.y - 2, bottom: activation.y + activation.height + 2 }];
    }
    return [
      { top: activation.y - 2, bottom: activation.y + 16 },
      { top: activation.y + activation.height - 16, bottom: activation.y + activation.height + 2 },
    ];
  }),
  ...Array.from(layout.participantLayouts.values()).map((participant) => ({ top: participant.headerY - 2, bottom: participant.headerY + participant.headerHeight + 2 })),
]);

const splitVerticalPages = (crop: SequenceDiagramBounds, bands: Array<{ top: number; bottom: number }>, maximumHeight: number): Array<{ top: number; bottom: number }> => {
  const pages: Array<{ top: number; bottom: number }> = [];
  let top = crop.top;
  while (top < crop.bottom - 0.5) {
    const target = Math.min(crop.bottom, top + maximumHeight);
    if (target >= crop.bottom) { pages.push({ top, bottom: crop.bottom }); break; }
    const safeCut = bands.filter((band) => band.bottom <= target && band.bottom > top + 20)
      .map((band) => band.bottom).filter((cut) => !bands.some((band) => band.top < cut && cut < band.bottom)).at(-1);
    if (safeCut !== undefined) { pages.push({ top, bottom: safeCut }); top = safeCut; continue; }
    const nextBand = bands.find((band) => band.bottom > top + 0.5);
    if (nextBand && nextBand.top > top + 20 && nextBand.top <= target) {
      pages.push({ top, bottom: nextBand.top }); top = nextBand.top; continue;
    }
    pages.push({ top, bottom: target }); top = target;
  }
  return pages;
};

export const buildSequencePdfPlan = (content: Pick<SequenceDiagramContent, 'participants'>, layout: SequenceLayout, suppliedOptions: Partial<SequenceExportOptions> = {}): SequencePdfPlan => {
  const options = { ...defaultSequenceExportOptions, ...suppliedOptions };
  const crop = getSequenceExportBounds(layout);
  const paper = pageSize(options);
  const margin = Math.max(0, Math.min(40, options.marginMm)) * 72 / 25.4;
  const usableWidth = Math.max(72, paper.width - margin * 2);
  const headerHeight = Math.max(54, Math.ceil((layout.maxParticipantHeaderHeight ?? 58) + 8));
  const usableHeight = Math.max(72, paper.height - margin * 2 - headerHeight);
  const requestedScale = Math.max(0.2, Math.min(2, options.scale / 100));
  const bands = getSequenceExportProtectedBands(layout);
  const largestBand = Math.max(1, ...bands.map((band) => band.bottom - band.top));
  const scaleForBand = usableHeight / (largestBand + EXPORT_PADDING * 2);
  let effectiveScale = Math.max(0.2, Math.min(requestedScale, usableWidth / crop.width, scaleForBand));
  let slices = splitVerticalPages(crop, bands, usableHeight / effectiveScale);
  if (slices.length > 1 && slices[0].bottom - slices[0].top < (usableHeight / effectiveScale) * 0.25) {
    const joinedHeight = slices[1].bottom - crop.top;
    effectiveScale = Math.max(0.2, Math.min(effectiveScale, usableHeight / joinedHeight));
    slices = splitVerticalPages(crop, bands, usableHeight / effectiveScale);
  }
  const warnings: string[] = [];
  if (effectiveScale < requestedScale - 0.001) {
    warnings.push('La escala se redujo para no cortar mensajes, notas ni encabezados de fragmentos.');
  }
  const hasSplitBand = slices.some((slice) =>
    bands.some((band) => band.top < slice.bottom && slice.bottom < band.bottom));
  if (hasSplitBand) {
    warnings.push('Una sección del diagrama supera la altura de página disponible y debió dividirse.');
  }
  return {
    crop, effectiveScale, headerHeight, warnings,
    pages: slices.map((slice, index) => ({
      index,
      source: { left: crop.left, right: crop.right, top: slice.top, bottom: slice.bottom, width: crop.width, height: slice.bottom - slice.top },
      repeatedParticipantIds: index === 0 ? [] : content.participants.flatMap((participant) => {
        const startY = layout.participantStartY.get(participant.id) ?? Number.POSITIVE_INFINITY;
        const isCreated = startY <= slice.top + 1;
        const endY = layout.participantEndY.get(participant.id);
        const isTerminated = (layout.terminatedParticipantIds?.has(participant.id) || participant.destroyedByMessageId !== undefined)
          && endY !== undefined
          && endY <= slice.top;
        return (isCreated && !isTerminated) ? [participant.id] : [];
      }),
    })),
  };
};

const cropSvg = (source: SVGSVGElement, bounds: SequenceDiagramBounds): SVGSVGElement => {
  const svg = cleanExportSvg(source);
  svg.setAttribute('viewBox', `${bounds.left} ${bounds.top} ${bounds.width} ${bounds.height}`);
  svg.setAttribute('width', String(bounds.width)); svg.setAttribute('height', String(bounds.height));
  const bgRect = svg.querySelector('rect:not([data-export-control="true"])');
  if (bgRect) {
    bgRect.setAttribute('x', String(bounds.left));
    bgRect.setAttribute('y', String(bounds.top));
    bgRect.setAttribute('width', String(bounds.width));
    bgRect.setAttribute('height', String(bounds.height));
  }
  return svg;
};

export const canExportSequencePng = (svg: SVGSVGElement, bounds?: SequenceDiagramBounds): boolean => {
  const dimensions = bounds ?? svgDimensions(svg);
  return dimensions.width <= MAX_PNG_DIMENSION && dimensions.height <= MAX_PNG_DIMENSION && dimensions.width * dimensions.height <= MAX_PNG_PIXELS;
};

export const exportSequencePng = async (
  source: SVGSVGElement,
  filename: string,
  layout?: Pick<SequenceLayout, 'bounds'>,
  options?: { download?: boolean },
): Promise<{ blob: Blob; width: number; height: number }> => {
  const crop = layout ? getSequenceExportBounds(layout) : (() => {
    const { width, height } = svgDimensions(source); return { left: 0, top: 0, right: width, bottom: height, width, height };
  })();
  if (!canExportSequencePng(source, crop)) throw new Error(`El PNG requeriría ${Math.ceil(crop.width)} × ${Math.ceil(crop.height)} píxeles, por encima del límite seguro. Elegí PDF o reducí el diagrama.`);
  const svg = cropSvg(source, crop);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('No se pudo preparar la imagen del diagrama.')); image.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(crop.width); canvas.height = Math.ceil(crop.height);
    const context = canvas.getContext('2d'); if (!context) throw new Error('El navegador no pudo crear la imagen.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, crop.width, crop.height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('No se pudo generar el PNG.')), 'image/png'));
    if (options?.download !== false) {
      downloadBlob(png, `${safeSequenceFilename(filename)}.png`);
    }
    return { blob: png, width: canvas.width, height: canvas.height };
  } finally { URL.revokeObjectURL(url); }
};

const participantLabel = (content: Pick<SequenceDiagramContent, 'participants'>, id: string): string => {
  const participant = content.participants.find((candidate) => candidate.id === id);
  return participant?.name || participant?.classifierName || 'Participante';
};

export const buildRepeatedHeaderSvg = (
  sourceSvg: SVGSVGElement,
  page: SequenceExportPage,
  layout: SequenceLayout,
  headerHeight: number,
): SVGSVGElement => {
  const headerSvg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  headerSvg.setAttribute('viewBox', `${page.source.left} 0 ${page.source.width} ${headerHeight}`);
  headerSvg.setAttribute('width', String(page.source.width));
  headerSvg.setAttribute('height', String(headerHeight));
  headerSvg.setAttribute('xmlns', SVG_NS);

  const background = document.createElementNS(SVG_NS, 'rect');
  background.setAttribute('x', String(page.source.left));
  background.setAttribute('y', '0');
  background.setAttribute('width', String(page.source.width));
  background.setAttribute('height', String(headerHeight - 4));
  background.setAttribute('fill', '#ffffff');
  background.setAttribute('stroke', '#cbd5e1');
  background.setAttribute('stroke-width', '1');
  headerSvg.appendChild(background);

  page.repeatedParticipantIds.forEach((id) => {
    const selector = `[data-sequence-participant-id="${id}"], [data-participant-id="${id}"]`;
    const original = sourceSvg.querySelector(selector);
    const headerLayout = layout.participantLayouts.get(id);
    if (!original || !headerLayout) return;

    const clone = original.cloneNode(true) as SVGGElement;
    clone.querySelectorAll('[data-export-control="true"]').forEach((element) => element.remove());
    const targetY = Math.max(2, (headerHeight - 4 - headerLayout.headerHeight) / 2);
    const deltaY = targetY - headerLayout.headerY;
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('transform', `translate(0, ${deltaY})`);
    group.appendChild(clone);
    headerSvg.appendChild(group);
  });

  return headerSvg;
};

const drawRepeatedHeaders = async (
  document: PdfDocument,
  sourceSvg: SVGSVGElement,
  content: Pick<SequenceDiagramContent, 'participants'>,
  page: SequenceExportPage,
  layout: SequenceLayout,
  margin: number,
  scale: number,
  headerHeight: number,
  width: number,
  svgToPdf: SvgToPdf,
): Promise<void> => {
  if (page.repeatedParticipantIds.length === 0) return;
  try {
    const headerSvg = buildRepeatedHeaderSvg(sourceSvg, page, layout, headerHeight);
    if (headerSvg.querySelector('[data-sequence-participant-id], [data-participant-id]')) {
      await svgToPdf(headerSvg, document, {
        x: margin,
        y: margin,
        width: page.source.width * scale,
        height: headerHeight * scale,
      });
      return;
    }
  } catch {
    // Fallback below
  }

  document.setFillColor('#ffffff'); document.setDrawColor('#cbd5e1'); document.rect(margin, margin, width, headerHeight * scale - 4, 'FD');
  page.repeatedParticipantIds.forEach((id) => {
    const x = layout.participantX.get(id);
    if (x === undefined || x < page.source.left - 100 || x > page.source.right + 100) return;
    const pageX = margin + (x - page.source.left) * scale;
    const participant = content.participants.find((p) => p.id === id);
    const visualIdentity = participant ? resolveParticipantVisualIdentity(participant) : null;
    document.setFillColor(visualIdentity?.headerFill ?? '#ffffff');
    document.setDrawColor(visualIdentity?.headerBorder ?? '#64748b');
    document.roundedRect(pageX - 47, margin + 4, 94, 28, 2, 2, 'FD');
    document.setTextColor('#1f2937'); document.setFontSize(7.5);
    document.text(document.splitTextToSize(participantLabel(content, id), 88), pageX, margin + 15, { align: 'center', maxWidth: 88 });
  });
};

export const exportSequencePdf = async (
  source: SVGSVGElement,
  filename: string,
  content?: Pick<SequenceDiagramContent, 'participants'>,
  layout?: SequenceLayout,
  options?: Partial<SequenceExportOptions> & { download?: boolean },
): Promise<(SequencePdfPlan & { pdfBlob?: Blob; pdfBytes?: Uint8Array }) | undefined> => {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([
    import('jspdf'),
    import('svg2pdf.js'),
  ]);
  if (!content || !layout) {
    const fallback = cleanExportSvg(source); const { width, height } = svgDimensions(fallback);
    const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3', compress: true });
    await svg2pdf(fallback, document, { x: 24, y: 24, width: width * 0.72, height: height * 0.72 });
    if (options?.download !== false) document.save(`${safeSequenceFilename(filename)}.pdf`);
    return undefined;
  }
  const config = { ...defaultSequenceExportOptions, ...options };
  const plan = buildSequencePdfPlan(content, layout, config); const paper = pageSize(config);
  const margin = Math.max(0, Math.min(40, config.marginMm)) * 72 / 25.4;
  const document = new jsPDF({ orientation: config.orientation, unit: 'pt', format: config.paperSize, compress: true });
  for (const page of plan.pages) {
    if (page.index > 0) document.addPage(config.paperSize, config.orientation);
    const contentY = margin + (page.index > 0 ? plan.headerHeight * plan.effectiveScale : 0);
    await svg2pdf(cropSvg(source, page.source), document, {
      x: margin,
      y: contentY,
      width: page.source.width * plan.effectiveScale,
      height: page.source.height * plan.effectiveScale,
    });
    if (page.index > 0) {
      await drawRepeatedHeaders(document, source, content, page, layout, margin, plan.effectiveScale, plan.headerHeight, paper.width - margin * 2, svg2pdf);
    }
    document.setFontSize(8); document.setTextColor('#64748b'); document.text(`Página ${page.index + 1} de ${plan.pages.length}`, paper.width - margin, paper.height - 8, { align: 'right' });
  }
  if (options?.download !== false) {
    document.save(`${safeSequenceFilename(filename)}.pdf`);
  }
  const pdfBytes = new Uint8Array(document.output('arraybuffer'));
  const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
  return { ...plan, pdfBlob, pdfBytes };
};
