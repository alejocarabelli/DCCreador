import { Keyboard, X } from 'lucide-react';
import { useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

type Shortcut = [keys: string, description: string];

/**
 * Every shortcut in the app, in one place. It replaces the flow editor's own
 * "Atajos" menu and the sequence shortcuts that were only discoverable in
 * tooltips. Opens with `?` or from the sidebar.
 */
const SECTIONS: Array<{ title: string; shortcuts: Shortcut[] }> = [
  {
    title: 'En toda la app',
    shortcuts: [
      ['⌘Z', 'Deshacer'],
      ['⇧⌘Z', 'Rehacer'],
      ['?', 'Mostrar estos atajos'],
      ['⌘\\', 'Mostrar u ocultar la barra lateral'],
      ['Esc', 'Cerrar un menú o cancelar la edición'],
    ],
  },
  {
    title: 'Diagramas de clases y casos de uso',
    shortcuts: [
      ['Doble clic', 'Crear en el lugar (clase o caso de uso)'],
      ['⌫', 'Eliminar la selección'],
      ['⇧ arrastrar', 'Seleccionar un área'],
      ['⌘ clic', 'Sumar o quitar de la selección'],
      ['↵  Esc', 'Confirmar o cancelar al editar un nombre'],
    ],
  },
  {
    title: 'Diagrama de secuencia',
    shortcuts: [
      ['M', 'Entrar o salir del modo teclado'],
      ['⌘D', 'Duplicar el elemento seleccionado'],
      ['⌘C  ⌘V', 'Copiar y pegar mensajes'],
      ['⌥↑  ⌥↓', 'Mover el elemento en la línea de tiempo'],
      ['⇧⌘U', 'Desempaquetar el fragmento seleccionado'],
      ['⌫', 'Eliminar la selección'],
    ],
  },
  {
    title: 'Secuencia · modo teclado',
    shortcuts: [
      ['←  →', 'Elegir participante'],
      ['↵', 'Mensaje síncrono'],
      ['S  R  C  D', 'Síncrono, retorno, creación, destrucción'],
      ['P', 'Nuevo participante'],
      ['F', 'Fragmento combinado'],
      ['G', 'Editar la condición del operando'],
      ['E', 'Editar el elemento actual'],
    ],
  },
  {
    title: 'Flujo de sucesos',
    shortcuts: [
      ['↵', 'Paso siguiente, ya numerado'],
      ['Tab  ⇧Tab', 'Bajar o subir un nivel'],
      ['- al inicio', 'Viñeta de detalle'],
      ['⌘↵', 'Pasarle el turno al otro lado'],
      ['⇧⌘↵', 'Turno al revés (dentro o fuera del bloque)'],
      ['⌘.', 'Plegar o desplegar el paso'],
      ['⇧⌘A', 'Camino alternativo desde esta línea'],
      ['⌘ clic', 'Ir al paso o camino mencionado'],
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useFocusTrap(dialogRef, true, onClose);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        aria-labelledby="shortcuts-title"
        aria-modal="true"
        className="project-dialog v2-shortcuts"
        ref={dialogRef}
        role="dialog"
      >
        <header className="v2-dialog-header">
          <span className="v2-dialog-icon" aria-hidden="true"><Keyboard size={18} /></span>
          <h2 id="shortcuts-title">Atajos de teclado</h2>
          <button aria-label="Cerrar" className="v2-tool" type="button" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="v2-shortcuts-grid">
          {SECTIONS.map((section) => (
            <section key={section.title} className="v2-shortcuts-section">
              <h3>{section.title}</h3>
              <dl>
                {section.shortcuts.map(([keys, description]) => (
                  <div key={keys}>
                    <dt>{keys.split(/\s{2,}/).map((key) => <kbd className="v2-kbd" key={key}>{key}</kbd>)}</dt>
                    <dd>{description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
