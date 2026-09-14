import { useState, type RefObject } from 'react';
import { getViewportForBounds, type Rect } from 'reactflow';
import { toJpeg, toPng } from 'html-to-image';
import { createPdfFromJpegDataUrl, downloadBlob, downloadDataUrl } from '../utils/pdfExport';

const PNG_WIDTH = 1600;
const PNG_HEIGHT = 1000;

type DiagramImageExportOptions = {
  canvasRef: RefObject<HTMLDivElement | null>;
  hasNodes: boolean;
  getDiagramBounds: () => Rect;
  projectName: string;
  artifactName: string;
  showFeedback: (message: string) => void;
};

const getEffectiveBackgroundColor = (element: HTMLElement): string => {
  let currentElement: HTMLElement | null = element;

  while (currentElement !== null) {
    const backgroundColor = getComputedStyle(currentElement).backgroundColor;

    if (backgroundColor !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'transparent') {
      return backgroundColor;
    }

    currentElement = currentElement.parentElement;
  }

  return '#f5f7f8';
};

export function useDiagramImageExport({
  canvasRef,
  hasNodes,
  getDiagramBounds,
  projectName,
  artifactName,
  showFeedback,
}: DiagramImageExportOptions) {
  const [isExporting, setIsExporting] = useState(false);

  const captureDiagramImage = async (format: 'jpeg' | 'png'): Promise<string | null> => {
    if (canvasRef.current === null || !hasNodes) {
      showFeedback('No hay diagrama para exportar');
      return null;
    }

    const viewport = canvasRef.current.querySelector<HTMLElement>('.react-flow__viewport');
    const flowRoot = canvasRef.current.querySelector<HTMLElement>('.react-flow');

    if (viewport === null || flowRoot === null) {
      return null;
    }

    const nodesBounds = getDiagramBounds();
    const transform = getViewportForBounds(nodesBounds, PNG_WIDTH, PNG_HEIGHT, 0.01, 2, 0.16);
    const backgroundColor = getEffectiveBackgroundColor(flowRoot);
    const edgePathStyleBackups = Array.from(viewport.querySelectorAll<SVGElement>('.react-flow__edges path, .react-flow__edges polygon')).map(
      (path) => ({
        path,
        style: path.getAttribute('style'),
      }),
    );
    canvasRef.current.classList.add('exporting-png');

    try {
      edgePathStyleBackups.forEach(({ path }) => {
        const computedStyle = window.getComputedStyle(path);
        path.style.stroke = computedStyle.stroke;
        path.style.strokeWidth = computedStyle.strokeWidth;
        path.style.strokeDasharray = computedStyle.strokeDasharray;
        path.style.fill = computedStyle.fill;
      });

      const imageOptions = {
        backgroundColor,
        cacheBust: true,
        // Match the PDF image dimensions even on Retina displays.
        pixelRatio: 1,
        filter: (node: HTMLElement) => {
          if (!(node instanceof Element)) {
            return true;
          }

          return (
            !node.classList.contains('react-flow__handle') &&
            !node.classList.contains('react-flow__edge-interaction') &&
            !node.classList.contains('association-edge-hit-area') &&
            !node.classList.contains('react-flow__background') &&
            !node.classList.contains('react-flow__controls') &&
            !node.classList.contains('react-flow__minimap')
          );
        },
        height: PNG_HEIGHT,
        style: {
          height: `${PNG_HEIGHT}px`,
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
          width: `${PNG_WIDTH}px`,
        },
        width: PNG_WIDTH,
      };

      return format === 'png'
        ? await toPng(viewport, imageOptions)
        : await toJpeg(viewport, { ...imageOptions, quality: 0.95 });
    } finally {
      edgePathStyleBackups.forEach(({ path, style }) => {
        if (style === null) {
          path.removeAttribute('style');
        } else {
          path.setAttribute('style', style);
        }
      });
      canvasRef.current.classList.remove('exporting-png');
    }
  };

  const exportPng = async (): Promise<void> => {
    if (isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      const dataUrl = await captureDiagramImage('png');

      if (dataUrl === null) {
        return;
      }

      downloadDataUrl(`${projectName.trim() || 'diagrama'} - ${artifactName.trim() || 'artefacto'}.png`, dataUrl);
      showFeedback('PNG exportado');
    } catch {
      showFeedback('No se pudo exportar el PNG');
    } finally {
      setIsExporting(false);
    }
  };

  const exportPdf = async (): Promise<void> => {
    if (isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      const dataUrl = await captureDiagramImage('jpeg');

      if (dataUrl === null) {
        return;
      }

      const pdf = createPdfFromJpegDataUrl(dataUrl, PNG_WIDTH, PNG_HEIGHT);
      downloadBlob(`${projectName.trim() || 'diagrama'} - ${artifactName.trim() || 'artefacto'}.pdf`, pdf);
      showFeedback('PDF exportado');
    } catch {
      showFeedback('No se pudo exportar el PDF');
    } finally {
      setIsExporting(false);
    }
  };

  return { exportPng, exportPdf, isExporting };
}
