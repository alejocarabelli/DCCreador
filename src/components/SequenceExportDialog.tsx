import { FileImage, FileText, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { SequenceDiagramContent } from '../types/diagram';
import {
  buildSequencePdfPlan,
  defaultSequenceExportOptions,
  type SequenceExportOptions,
} from '../utils/sequenceDiagramExport';
import type { SequenceLayout } from '../utils/sequenceDiagramLayout';

type SequenceExportDialogProps = {
  open: boolean;
  content: Pick<SequenceDiagramContent, 'participants'>;
  layout: SequenceLayout;
  options: SequenceExportOptions;
  onOptionsChange: (options: SequenceExportOptions) => void;
  onClose: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
};

export function SequenceExportDialog({ open, content, layout, options, onOptionsChange, onClose, onExportPng, onExportPdf }: SequenceExportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const plan = useMemo(() => buildSequencePdfPlan(content, layout, options), [content, layout, options]);
  const update = <Key extends keyof SequenceExportOptions>(key: Key, value: SequenceExportOptions[Key]): void => onOptionsChange({ ...options, [key]: value });

  return (
    <dialog ref={dialogRef} className="sequence-export-dialog" aria-labelledby="sequence-export-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <form method="dialog" onSubmit={(event) => { event.preventDefault(); }}>
        <header>
          <div><span className="eyebrow">Exportación</span><h2 id="sequence-export-title">Vista previa de páginas</h2></div>
          <button aria-label="Cerrar exportación" className="icon-button" type="button" title="Cerrar" onClick={onClose}><X size={17} /></button>
        </header>
        <div className="sequence-export-dialog-body">
          <section className="sequence-export-options" aria-label="Configuración de PDF">
            <label><span>Papel</span><select value={options.paperSize} onChange={(event) => update('paperSize', event.target.value as SequenceExportOptions['paperSize'])}><option value="a4">A4</option><option value="a3">A3</option><option value="letter">Carta</option></select></label>
            <label><span>Orientación</span><select value={options.orientation} onChange={(event) => update('orientation', event.target.value as SequenceExportOptions['orientation'])}><option value="landscape">Horizontal</option><option value="portrait">Vertical</option></select></label>
            <label><span>Márgenes (mm)</span><input type="number" min="0" max="40" value={options.marginMm} onChange={(event) => update('marginMm', Math.max(0, Math.min(40, Number(event.target.value) || defaultSequenceExportOptions.marginMm)))} /></label>
            <label><span>Escala (%)</span><input type="number" min="20" max="200" value={options.scale} onChange={(event) => update('scale', Math.max(20, Math.min(200, Number(event.target.value) || defaultSequenceExportOptions.scale)))} /></label>
            <p>Área exportada: {Math.round(plan.crop.width)} × {Math.round(plan.crop.height)}. Se excluye el espacio vacío del lienzo.</p>
            {plan.warnings.map((warning) => <p className="sequence-export-warning" key={warning}>{warning}</p>)}
          </section>
          <section className="sequence-export-preview" aria-label={`Vista previa: ${plan.pages.length} páginas`}>
            <strong>{plan.pages.length} página{plan.pages.length === 1 ? '' : 's'}</strong>
            <div className="sequence-export-page-list">
              {plan.pages.map((page) => <div className="sequence-export-page" key={page.index}>
                {page.index > 0 ? <div className="sequence-export-preview-header">Encabezados repetidos: {page.repeatedParticipantIds.length}</div> : null}
                <div className="sequence-export-preview-content" style={{ flexGrow: Math.max(0.35, page.source.height / Math.max(...plan.pages.map((candidate) => candidate.source.height))) }}>
                  <span>Página {page.index + 1}</span><small>y {Math.round(page.source.top)}–{Math.round(page.source.bottom)}</small>
                </div>
              </div>)}
            </div>
          </section>
        </div>
        <footer>
          <small>Los cortes se colocan fuera de mensajes, notas, cabeceras de fragmentos y condiciones.</small>
          <button type="button" className="secondary-action" onClick={onExportPng}><FileImage size={16} /> PNG recortado</button>
          <button type="button" className="primary-action" onClick={onExportPdf}><FileText size={16} /> Exportar PDF</button>
        </footer>
      </form>
    </dialog>
  );
}
