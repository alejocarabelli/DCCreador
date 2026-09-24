import { useReactFlow, useStore } from 'reactflow';
import { CanvasZoom } from './ui/CanvasZoom';

type CanvasControlsProps = {
  label: string;
};

/** The shared zoom control, wired to a React Flow canvas. */
export function CanvasControls({ label }: CanvasControlsProps) {
  const { fitView, zoomIn, zoomOut, zoomTo } = useReactFlow();
  const zoom = useStore((state) => state.transform[2]);

  return (
    <CanvasZoom
      label={label}
      zoomPercent={Math.round(zoom * 100)}
      onZoomIn={() => zoomIn({ duration: 160 })}
      onZoomOut={() => zoomOut({ duration: 160 })}
      onResetZoom={() => zoomTo(1, { duration: 200 })}
      onFit={() => fitView({ duration: 240, padding: 0.2 })}
    />
  );
}
