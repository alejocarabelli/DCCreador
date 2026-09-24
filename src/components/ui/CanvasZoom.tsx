import { Maximize2, Minus, Plus } from 'lucide-react';

/**
 * The only zoom control in the app. Every canvas (clases, casos de uso, clases
 * de secuencias, secuencia) shows it in the same corner, with the same order
 * and the same names; the toolbar no longer repeats it.
 */
export function CanvasZoom({
  label,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onFit,
  onResetZoom,
}: {
  label: string;
  /** When known, the current zoom shows between the buttons and resets to 100 % on click. */
  zoomPercent?: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onResetZoom?: () => void;
}) {
  return (
    <div className="v2-zoom" role="group" aria-label={label} data-export-control="true">
      <button type="button" aria-label="Alejar" title="Alejar" onClick={onZoomOut}>
        <Minus size={14} aria-hidden="true" />
      </button>
      {zoomPercent !== undefined ? (
        <button
          type="button"
          className="v2-zoom-value"
          aria-label={`Zoom ${zoomPercent} %. Restablecer al 100 %`}
          title="Restablecer al 100 %"
          onClick={onResetZoom}
        >
          {zoomPercent}%
        </button>
      ) : null}
      <button type="button" aria-label="Acercar" title="Acercar" onClick={onZoomIn}>
        <Plus size={14} aria-hidden="true" />
      </button>
      <span className="v2-zoom-divider" aria-hidden="true" />
      <button type="button" aria-label="Ajustar el diagrama a la vista" title="Ajustar a la vista" onClick={onFit}>
        <Maximize2 size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
