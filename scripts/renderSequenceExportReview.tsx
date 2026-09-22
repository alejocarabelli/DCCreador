type BuiltinProcess = { cwd: () => string; getBuiltinModule: (name: 'fs' | 'path') => unknown };
type FsModule = { mkdirSync: (path: string, options: { recursive: boolean }) => void; writeFileSync: (path: string, contents: string) => void };
type PathModule = { join: (...paths: string[]) => string };
declare const process: BuiltinProcess;
const { mkdirSync, writeFileSync } = process.getBuiltinModule('fs') as FsModule;
const { join } = process.getBuiltinModule('path') as PathModule;
import { renderToStaticMarkup } from 'react-dom/server';
import { themes } from '../src/theme/themes';
import { SequenceDiagramCanvas } from '../src/components/SequenceDiagramCanvas';
import type { SequenceDiagramContent, SequenceFragment, SequenceMessage, SequenceParticipant } from '../src/types/diagram';
import { createEmptySequenceDiagramContent, normalizeSequenceDiagramContent } from '../src/utils/sequenceDiagram';
import { buildSequenceLayout } from '../src/utils/sequenceDiagramLayout';

const participant = (id: string, x: number, name: string): SequenceParticipant => ({ id, kind: 'object', name, classifierName: '', x });
const message = (id: string, sourceId: string, targetId: string, name: string): SequenceMessage => ({ id, kind: 'message', type: 'synchronous', sourceId, targetId, name, arguments: '', parameterValues: '', returnType: '', flowReference: '' });
const alt: SequenceFragment = {
  id: 'alt-review', kind: 'fragment', operator: 'alt', name: 'Procesar solicitud', y: 210,
  operands: [
    { id: 'ok', guard: 'datos válidos con condición extensa', items: [message('validate', 'client', 'service', 'validarSolicitudConTextoExtenso') ] },
    { id: 'error', guard: 'datos incompletos', items: [message('reject', 'service', 'client', 'informarErrorConDetalleCompleto') ] },
  ],
};
const content: SequenceDiagramContent = normalizeSequenceDiagramContent({
  ...createEmptySequenceDiagramContent(), canvas: { width: 2400, height: 1800 },
  participants: [participant('client', 120, 'Cliente'), participant('service', 430, 'Servicio'), participant('repository', 740, 'Repositorio')],
  items: [alt],
  notes: [{ id: 'note-review', text: 'Nota extensa incluida en la revisión visual. Debe conservar todas sus líneas en PNG y PDF, sin arrastrar el espacio vacío del lienzo. '.repeat(9), x: 810, y: 320, width: 260, height: 70, anchorKind: 'free' }],
});
const layout = buildSequenceLayout(content);
const crop = {
  left: Math.floor(layout.bounds.left - 36), top: Math.floor(layout.bounds.top - 36),
  right: Math.ceil(layout.bounds.right + 36), bottom: Math.ceil(layout.bounds.bottom + 36),
  width: Math.ceil(layout.bounds.right - layout.bounds.left + 72), height: Math.ceil(layout.bounds.bottom - layout.bounds.top + 72),
};
const markup = renderToStaticMarkup(<SequenceDiagramCanvas content={content} layout={layout} selected={null} interactive={false} theme={themes[1]} onSelect={() => undefined} onParticipantPointerDown={() => undefined} onNotePointerDown={() => undefined} onNoteResizePointerDown={() => undefined} />)
  .replace(`viewBox="0 0 ${layout.width} ${layout.height}"`, `viewBox="${crop.left} ${crop.top} ${crop.width} ${crop.height}"`)
  .replace(`width="${layout.width}"`, `width="${crop.width}"`)
  .replace(`height="${layout.height}"`, `height="${crop.height}"`);
const output = join(process.cwd(), 'fixtures', 'export-review');
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'sequence-export-review.svg'), `<?xml version="1.0" encoding="UTF-8"?>${markup}`);
console.log(JSON.stringify({ output, crop, canvas: content.canvas }));
