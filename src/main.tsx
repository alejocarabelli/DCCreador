import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DialogProvider } from './components/ConfirmDialog';
import './styles.css';
import './refined.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <DialogProvider>
      <App />
    </DialogProvider>
  </StrictMode>,
);
