import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SequenceDiagramCanvas } from '../src/components/SequenceDiagramCanvas';
import { themes } from '../src/theme/themes';
import type { SequenceDiagramContent, SequenceFragment, SequenceMessage, SequenceParticipant } from '../src/types/diagram';
import { createEmptySequenceDiagramContent, normalizeSequenceDiagramContent } from '../src/utils/sequenceDiagram';
import { exportSequencePdf, exportSequencePng, getSequenceExportBounds } from '../src/utils/sequenceDiagramExport';
import { buildSequenceLayout } from '../src/utils/sequenceDiagramLayout';

const participant = (id: string, x: number, name: string, kind: SequenceParticipant['kind'] = 'object'): SequenceParticipant => ({
  id, kind, name, classifierName: '', x,
});

const message = (
  id: string,
  sourceId: string,
  targetId: string,
  name: string,
  type: SequenceMessage['type'] = 'synchronous',
  flowReference?: string,
): SequenceMessage => ({
  id, kind: 'message', type, sourceId, targetId, name, arguments: '()', parameterValues: '', returnType: '', flowReference: flowReference ?? '',
});

// Case 1: Small Diagram in 2400x1800 canvas
const createSmallDiagram = (): SequenceDiagramContent => {
  return normalizeSequenceDiagramContent({
    ...createEmptySequenceDiagramContent(),
    canvas: { width: 2400, height: 1800 },
    participants: [
      participant('client', 120, 'Cliente', 'actor'),
      participant('server', 440, 'Servidor', 'boundary'),
      participant('db', 760, 'BaseDeDatos', 'database'),
    ],
    items: [
      message('m1', 'client', 'server', 'consultarEstado()'),
      message('m2', 'server', 'db', 'buscarRegistroPorClave(id: 104)'),
      message('m3', 'db', 'server', 'registroEncontrado', 'return'),
      message('m4', 'server', 'client', 'respuestaExitosa', 'return'),
    ],
    notes: [
      { id: 'n1', text: 'Nota de verificación concisa en canvas de 2400 × 1800.', x: 480, y: 220, width: 220, height: 70, anchorKind: 'free' },
    ],
    showActivations: true,
  });
};

// Case 2: Multipage Diagram with all required features:
// - multiple pages (A4 landscape)
// - participant created mid-sequence
// - participant destroyed mid-sequence
// - nested fragments (alt -> loop)
// - operand conditions
// - long notes near page break
// - long text labels
// - activations
const createMultipageDiagram = (): SequenceDiagramContent => {
  const innerLoop: SequenceFragment = {
    id: 'loop-items',
    kind: 'fragment',
    operator: 'loop',
    name: 'Procesamiento por lote de cada elemento recibido',
    y: 540,
    operands: [
      {
        id: 'loop-op',
        guard: 'para cada documento en listaDocumentosPendientes con estado Activo',
        items: [
          message('m_loop_1', 'controller', 'worker', 'validarIntegridadCriptografica(documento)'),
          message('m_loop_2', 'worker', 'storage', 'almacenarBloqueFirmado(hashSha256)'),
          message('m_loop_3', 'storage', 'worker', 'bloqueConfirmado', 'return'),
        ],
      },
    ],
  };

  const outerAlt: SequenceFragment = {
    id: 'alt-validation',
    kind: 'fragment',
    operator: 'alt',
    name: 'Evaluación integral de reglas de negocio y consistencia transaccional',
    y: 430,
    operands: [
      {
        id: 'alt-ok',
        guard: 'condición favorable: token de seguridad válido y cuota de procesamiento disponible',
        items: [innerLoop],
      },
      {
        id: 'alt-err',
        guard: 'caso de contingencia: falla transaccional o datos incompletos en la solicitud',
        items: [
          message('m_err_1', 'controller', 'user', 'notificarErrorConDetalles(codigoError: 400)', 'return'),
        ],
      },
    ],
  };

  return normalizeSequenceDiagramContent({
    ...createEmptySequenceDiagramContent(),
    canvas: { width: 2400, height: 2600 },
    participants: [
      participant('user', 120, 'Usuario Operador', 'actor'),
      participant('controller', 400, 'ControladorCentral', 'control'),
      participant('worker', 680, 'ServicioNotificaciones', 'boundary'),
      participant('storage', 960, 'RepositorioDocumental', 'entity'),
      participant('temp', 1240, 'RecursoTemporal', 'object'),
    ],
    items: [
      message('m_start', 'user', 'controller', 'iniciarProcesoPrincipalConParametrosExtendidos()', 'synchronous', 'Paso 1: Inicio'),
      message('m_temp_create', 'controller', 'temp', 'create', 'create'),
      message('m_temp_use', 'controller', 'temp', 'almacenarEstadoTemporal()'),
      message('m_temp_destroy', 'controller', 'temp', 'destroy', 'destroy'),
      outerAlt,
      message('m_followup_1', 'controller', 'storage', 'consolidarTransaccionFinal()', 'synchronous', 'Paso 3: Consolidación'),
      message('m_followup_2', 'storage', 'controller', 'transaccionCompletadaConExito', 'return'),
      message('m_followup_3', 'controller', 'user', 'informarResultadoAlOperador()', 'return'),
    ],
    notes: [
      {
        id: 'note-long-cut',
        text: 'Nota extensa ubicada estratégicamente cerca del corte entre páginas. ' +
              'Debe mantener su ancho, envoltura automática de líneas e integridad tipográfica ' +
              'sin fragmentarse visualmente ni solapar elementos adyacentes del diagrama. ' +
              'Revisión minuciosa de límites, bordes y tipografía.',
        x: 480,
        y: 680,
        width: 320,
        height: 120,
        anchorKind: 'free',
      },
      {
        id: 'note-final',
        text: 'Nota de cierre de la secuencia documental en la última página.',
        x: 720,
        y: 1100,
        width: 240,
        height: 80,
        anchorKind: 'free',
      },
    ],
    showActivations: true,
  });
};

// Case 3: Wide Diagram
const createWideDiagram = (): SequenceDiagramContent => {
  return normalizeSequenceDiagramContent({
    ...createEmptySequenceDiagramContent(),
    canvas: { width: 3200, height: 1800 },
    participants: [
      participant('nodeA', 120, 'Nodo Cliente Móvil', 'actor'),
      participant('nodeB', 460, 'Gateway API Regional', 'boundary'),
      participant('nodeC', 820, 'Autenticador OAuth2', 'control'),
      participant('nodeD', 1180, 'Motor Transaccional', 'control'),
      participant('nodeE', 1540, 'Servicio Auditoría', 'entity'),
      participant('nodeF', 1900, 'Data Warehouse Central', 'database'),
    ],
    items: [
      message('w1', 'nodeA', 'nodeB', 'solicitarAccesoGlobalConCertificadoDigital()'),
      message('w2', 'nodeB', 'nodeC', 'validarCredencialesFederadas()'),
      message('w3', 'nodeC', 'nodeB', 'tokenValidoEmitido', 'return'),
      message('w4', 'nodeB', 'nodeD', 'ejecutarOperacionDistribuidaMultiNodo(token)'),
      message('w5', 'nodeD', 'nodeE', 'registrarBitacoraSeguridad(eventoAuditado)'),
      message('w6', 'nodeE', 'nodeF', 'persistirEntradaInmutableEnAlmacen()'),
      message('w7', 'nodeF', 'nodeE', 'registroPersistido', 'return'),
      message('w8', 'nodeD', 'nodeB', 'resultadoOperacionCompletada', 'return'),
      message('w9', 'nodeB', 'nodeA', 'confirmacionFinalExitosa', 'return'),
    ],
    notes: [
      { id: 'w_note', text: 'Diagrama deliberadamente ancho con 6 participantes distribuidos hasta X=1900.', x: 900, y: 380, width: 280, height: 80, anchorKind: 'free' },
    ],
    showActivations: true,
  });
};

const uploadArtifact = async (name: string, blob: Blob): Promise<void> => {
  const response = await fetch(`/api/upload?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(`Error uploading artifact ${name}: ${response.statusText}`);
  }
};

const notifyDone = async (report: unknown): Promise<void> => {
  await fetch('/api/done', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
};

export function ExportRunner() {
  const [status, setStatus] = useState<string>('Iniciando exportaciones...');
  const [currentDiagram, setCurrentDiagram] = useState<{
    name: string;
    content: SequenceDiagramContent;
  } | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const cases = [
          { name: 'diagram-small', content: createSmallDiagram(), options: { paperSize: 'a4' as const, orientation: 'landscape' as const, scale: 100 } },
          { name: 'diagram-multipage', content: createMultipageDiagram(), options: { paperSize: 'a4' as const, orientation: 'landscape' as const, scale: 100 } },
          { name: 'diagram-wide', content: createWideDiagram(), options: { paperSize: 'a4' as const, orientation: 'landscape' as const, scale: 100 } },
        ];

        const report: Record<string, unknown> = {};

        for (const testCase of cases) {
          setStatus(`Procesando ${testCase.name}...`);
          setCurrentDiagram({ name: testCase.name, content: testCase.content });

          // Wait 300ms for React render and SVG mount
          await new Promise((resolve) => setTimeout(resolve, 300));

          const svg = document.querySelector<SVGSVGElement>('#export-svg-container svg');
          if (!svg) throw new Error(`SVG element not found for ${testCase.name}`);

          const layout = buildSequenceLayout(testCase.content);
          const crop = getSequenceExportBounds(layout);

          // 1. Export PNG
          const pngResult = await exportSequencePng(svg, testCase.name, layout, { download: false });
          await uploadArtifact(`${testCase.name}.png`, pngResult.blob);

          // 2. Export PDF
          const pdfResult = await exportSequencePdf(svg, testCase.name, testCase.content, layout, {
            ...testCase.options,
            download: false,
          });

          if (pdfResult?.pdfBlob) {
            await uploadArtifact(`${testCase.name}.pdf`, pdfResult.pdfBlob);
          }

          report[testCase.name] = {
            crop,
            pngDimensions: { width: pngResult.width, height: pngResult.height },
            pdfPages: pdfResult?.pages.length,
            pdfEffectiveScale: pdfResult?.effectiveScale,
            pdfWarnings: pdfResult?.warnings,
            pagesDetail: pdfResult?.pages.map((p) => ({
              index: p.index,
              source: p.source,
              repeatedParticipants: p.repeatedParticipantIds,
            })),
          };
        }

        setStatus('Exportaciones completadas exitosamente.');
        await notifyDone(report);
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('Error in export runner:', error);
        setStatus(`Error: ${error.message}`);
        await notifyDone({ error: error.message, stack: error.stack });
      }
    };

    run();
  }, []);

  if (!currentDiagram) {
    return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>{status}</div>;
  }

  const layout = buildSequenceLayout(currentDiagram.content);

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>{status}</h1>
      <div id="export-svg-container" style={{ border: '1px solid #ccc', marginTop: 16 }}>
        <SequenceDiagramCanvas
          content={currentDiagram.content}
          layout={layout}
          selected={null}
          interactive={false}
          theme={themes[0]}
          onSelect={() => undefined}
          onParticipantPointerDown={() => undefined}
          onNotePointerDown={() => undefined}
          onNoteResizePointerDown={() => undefined}
          onFragmentPointerDown={() => undefined}
          onFragmentResizePointerDown={() => undefined}
        />
      </div>
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<ExportRunner />);
}
