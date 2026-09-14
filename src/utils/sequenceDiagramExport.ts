import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_PNG_DIMENSION = 32_000;
const MAX_PNG_PIXELS = 90_000_000;

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const safeSequenceFilename = (name: string): string =>
  (name.trim() || 'diagrama-de-secuencia')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const cleanExportSvg = (source: SVGSVGElement): SVGSVGElement => {
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-export-control="true"]').forEach((element) => element.remove());
  clone.setAttribute('xmlns', SVG_NS);
  return clone;
};

const svgDimensions = (svg: SVGSVGElement): { width: number; height: number } => {
  const viewBox = svg.viewBox.baseVal;
  return {
    width: Math.max(1, viewBox.width || Number(svg.getAttribute('width')) || 1200),
    height: Math.max(1, viewBox.height || Number(svg.getAttribute('height')) || 900),
  };
};

export const canExportSequencePng = (svg: SVGSVGElement): boolean => {
  const { width, height } = svgDimensions(svg);
  return width <= MAX_PNG_DIMENSION && height <= MAX_PNG_DIMENSION && width * height <= MAX_PNG_PIXELS;
};

export const exportSequencePng = async (source: SVGSVGElement, filename: string): Promise<void> => {
  const svg = cleanExportSvg(source);
  const { width, height } = svgDimensions(svg);
  if (!canExportSequencePng(svg)) {
    throw new Error('El diagrama es demasiado grande para un PNG confiable. Exportalo como PDF multipágina.');
  }
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const serialized = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('No se pudo preparar la imagen del diagrama.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil(height);
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('El navegador no pudo crear la imagen.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result === null ? reject(new Error('No se pudo generar el PNG.')) : resolve(result), 'image/png');
    });
    downloadBlob(png, `${safeSequenceFilename(filename)}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const exportSequencePdf = async (
  source: SVGSVGElement,
  filename: string,
  mode: 'multipage' | 'wide' = 'multipage',
): Promise<void> => {
  const sourceSvg = cleanExportSvg(source);
  const { width, height } = svgDimensions(sourceSvg);
  const margin = 24;

  if (mode === 'wide') {
    const pageWidth = Math.min(14_400, Math.max(1191, width * 0.72 + margin * 2));
    const pageHeight = Math.min(14_400, Math.max(842, height * 0.72 + margin * 2));
    const document = new jsPDF({ orientation: pageWidth >= pageHeight ? 'landscape' : 'portrait', unit: 'pt', format: [pageWidth, pageHeight] });
    await svg2pdf(sourceSvg, document, {
      x: margin,
      y: margin,
      width: pageWidth - margin * 2,
      height: pageHeight - margin * 2,
    });
    document.save(`${safeSequenceFilename(filename)}.pdf`);
    return;
  }

  const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3', compress: true });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const drawableWidth = pageWidth - margin * 2;
  const drawableHeight = pageHeight - margin * 2;
  const scale = 0.72;
  const tileWidth = Math.min(width, drawableWidth / scale);
  const repeatedHeaderHeight = 48;
  const maximumTileHeight = Math.min(height, (drawableHeight - repeatedHeaderHeight) / scale);
  const horizontalPages = Math.ceil(width / tileWidth);
  const messageBounds = Array.from(sourceSvg.querySelectorAll('[data-sequence-message-bottom]'))
    .map((element) => ({
      top: Number(element.getAttribute('data-sequence-message-top')),
      bottom: Number(element.getAttribute('data-sequence-message-bottom')),
    }))
    .filter((bounds) => Number.isFinite(bounds.top) && Number.isFinite(bounds.bottom))
    .sort((left, right) => left.top - right.top);
  const verticalSlices: Array<{ y: number; height: number }> = [];
  let sliceY = 0;
  while (sliceY < height) {
    const targetBottom = Math.min(height, sliceY + maximumTileHeight);
    if (targetBottom >= height) {
      verticalSlices.push({ y: sliceY, height: height - sliceY });
      break;
    }
    const safeMessage = messageBounds.filter((bounds) => bounds.bottom <= targetBottom - 18 && bounds.bottom > sliceY + 220).at(-1);
    const sliceBottom = safeMessage?.bottom ?? targetBottom;
    verticalSlices.push({ y: sliceY, height: sliceBottom - sliceY });
    sliceY = sliceBottom;
  }
  const verticalPages = verticalSlices.length;
  const repeatedHeaders = Array.from(sourceSvg.querySelectorAll('[data-sequence-top-header="true"]')).flatMap((header) => {
    const x = Number(header.getAttribute('data-sequence-x'));
    if (!Number.isFinite(x)) return [];
    return [{ x, label: header.getAttribute('data-sequence-label') ?? 'Participante' }];
  });
  let pageIndex = 0;

  for (let row = 0; row < verticalPages; row += 1) {
    for (let column = 0; column < horizontalPages; column += 1) {
      if (pageIndex > 0) document.addPage('a3', 'landscape');
      const tileX = column * tileWidth;
      const tileY = verticalSlices[row].y;
      const currentWidth = Math.min(tileWidth, width - tileX);
      const currentHeight = verticalSlices[row].height;
      const tileSvg = cleanExportSvg(sourceSvg);
      tileSvg.setAttribute('viewBox', `${tileX} ${tileY} ${currentWidth} ${currentHeight}`);
      tileSvg.setAttribute('width', String(currentWidth));
      tileSvg.setAttribute('height', String(currentHeight));
      await svg2pdf(tileSvg, document, {
        x: margin,
        y: margin + (row > 0 ? repeatedHeaderHeight : 0),
        width: currentWidth * scale,
        height: currentHeight * scale,
      });
      if (row > 0) {
        document.setFillColor('#ffffff');
        document.setDrawColor('#cbd5e1');
        document.rect(margin, margin, drawableWidth, repeatedHeaderHeight - 4, 'FD');
        repeatedHeaders.forEach((header) => {
          if (header.x < tileX - 90 || header.x > tileX + currentWidth + 90) return;
          const pageX = margin + (header.x - tileX) * scale;
          document.setFillColor('#ffffff');
          document.setDrawColor('#64748b');
          document.roundedRect(pageX - 55, margin + 7, 110, 29, 2, 2, 'FD');
          document.setFont('helvetica', 'normal');
          document.setFontSize(7.5);
          document.setTextColor('#1f2937');
          const label = header.label.length > 28 ? `${header.label.slice(0, 25)}...` : header.label;
          document.text(label, pageX, margin + 24, { align: 'center', maxWidth: 104 });
        });
      }
      document.setFontSize(8);
      document.setTextColor('#64748b');
      document.text(
        `Página ${pageIndex + 1} de ${horizontalPages * verticalPages}`,
        pageWidth - margin,
        pageHeight - 8,
        { align: 'right' },
      );
      pageIndex += 1;
    }
  }
  document.save(`${safeSequenceFilename(filename)}.pdf`);
};
