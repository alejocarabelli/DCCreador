import { useState, type RefObject } from 'react';
import type { Rect } from 'reactflow';
import { createPdfFromJpegDataUrl, downloadBlob, downloadDataUrl } from '../utils/pdfExport';
import { planDiagramCapture } from '../utils/diagramImageExport';
import { applyExportThemeVariables } from './useTheme';

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

  const captureDiagramImage = async (format: 'jpeg' | 'png'): Promise<{ dataUrl: string; plan: ReturnType<typeof planDiagramCapture> } | null> => {
    if (canvasRef.current === null || !hasNodes) {
      showFeedback('No hay diagrama para exportar');
      return null;
    }

    const viewport = canvasRef.current.querySelector<HTMLElement>('.react-flow__viewport');
    const flowRoot = canvasRef.current.querySelector<HTMLElement>('.react-flow');

    if (viewport === null || flowRoot === null) {
      return null;
    }

    // Exports are documents: capture them on the light palette even in dark mode.
    const restoreTheme = applyExportThemeVariables(canvasRef.current);
    // The diagram at its own size (zoom 1), rendered at up to 3× for print.
    const plan = planDiagramCapture(getDiagramBounds());
    const backgroundColor = getEffectiveBackgroundColor(flowRoot);
    const edgePathStyleBackups = Array.from(viewport.querySelectorAll<SVGElement>('.react-flow__edges path, .react-flow__edges polygon')).map(
      (path) => ({
        path,
        style: path.getAttribute('style'),
      }),
    );
    canvasRef.current.classList.add('exporting-png');

    try {
      const { toJpeg, toPng } = await import('html-to-image');
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
        pixelRatio: plan.pixelRatio,
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
        height: plan.height,
        style: {
          height: `${plan.height}px`,
          transform: `translate(${plan.x}px, ${plan.y}px) scale(1)`,
          width: `${plan.width}px`,
        },
        width: plan.width,
      };

      const dataUrl = format === 'png'
        ? await toPng(viewport, imageOptions)
        : await toJpeg(viewport, { ...imageOptions, quality: 0.95 });
      return { dataUrl, plan };
    } finally {
      edgePathStyleBackups.forEach(({ path, style }) => {
        if (style === null) {
          path.removeAttribute('style');
        } else {
          path.setAttribute('style', style);
        }
      });
      canvasRef.current.classList.remove('exporting-png');
      restoreTheme();
    }
  };

  const exportPng = async (): Promise<void> => {
    if (isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      const capture = await captureDiagramImage('png');

      if (capture === null) {
        return;
      }

      const outcome = await downloadDataUrl(`${projectName.trim() || 'diagrama'} - ${artifactName.trim() || 'artefacto'}.png`, capture.dataUrl);
      if (outcome.status === 'failed') throw new Error(outcome.error);
      if (outcome.status === 'saved') showFeedback('PNG exportado');
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
      const capture = await captureDiagramImage('jpeg');

      if (capture === null) {
        return;
      }

      const { plan } = capture;
      // Page in points at the diagram's own size; the image carries the extra pixels.
      const pdf = createPdfFromJpegDataUrl(capture.dataUrl, plan.imageWidth, plan.imageHeight, plan.pageWidth, plan.pageHeight);
      const outcome = await downloadBlob(`${projectName.trim() || 'diagrama'} - ${artifactName.trim() || 'artefacto'}.pdf`, pdf);
      if (outcome.status === 'failed') throw new Error(outcome.error);
      if (outcome.status === 'saved') showFeedback('PDF exportado');
    } catch {
      showFeedback('No se pudo exportar el PDF');
    } finally {
      setIsExporting(false);
    }
  };

  return { exportPng, exportPdf, isExporting };
}
