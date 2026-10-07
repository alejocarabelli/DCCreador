import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ArtifactViewer } from './components/ArtifactViewer';
import { parseViewerHash } from './storage/nativeWindows';
import { DialogProvider } from './components/ConfirmDialog';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/400-italic.css';
import '@fontsource/ibm-plex-sans-condensed/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';
import './refined.css';
import './design/system.css';
import './design/shell.css';
import './design/editors.css';
import './design/viewer.css';

// Los nombres de métodos, atributos y mensajes se escriben tal cual: sin mayúscula
// automática ni autocorrección del sistema en ningún campo de texto.
document.addEventListener('focusin', (event) => {
  const field = event.target;
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    field.setAttribute('autocapitalize', 'off');
    field.setAttribute('autocorrect', 'off');
    field.spellcheck = false;
  }
});

// Una ventana secundaria muestra un diagrama en solo lectura y nunca monta la
// aplicación completa: así no guarda proyectos ni pisa lo que se edita en la principal.
const viewer = parseViewerHash(window.location.hash);

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {viewer ? (
      <ArtifactViewer projectId={viewer.projectId} artifactId={viewer.artifactId} />
    ) : (
      <DialogProvider>
        <App />
      </DialogProvider>
    )}
  </StrictMode>,
);
