import { Maximize2, Minus, Plus } from 'lucide-react';
import { ControlButton, Controls, useReactFlow } from 'reactflow';

type CanvasControlsProps = {
  label: string;
};

/**
 * React Flow's built-in controls ship English labels ("zoom in", "fit view"),
 * which were the only English strings left in a Spanish interface. Rendering
 * the buttons ourselves keeps the same affordances and names them in the
 * product's own language.
 */
export function CanvasControls({ label }: CanvasControlsProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  return (
    <Controls aria-label={label} showFitView={false} showInteractive={false} showZoom={false}>
      <ControlButton aria-label="Acercar" title="Acercar" onClick={() => zoomIn({ duration: 160 })}>
        <Plus size={14} />
      </ControlButton>
      <ControlButton aria-label="Alejar" title="Alejar" onClick={() => zoomOut({ duration: 160 })}>
        <Minus size={14} />
      </ControlButton>
      <ControlButton
        aria-label="Ajustar el diagrama a la vista"
        title="Ajustar a la vista"
        onClick={() => fitView({ duration: 240, padding: 0.2 })}
      >
        <Maximize2 size={14} />
      </ControlButton>
    </Controls>
  );
}
