import { createContext, useContext } from 'react';

export type ConfirmRequest = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'neutral';
};

export type NotifyRequest = {
  title: string;
  description?: string;
};

export type DialogApi = {
  /** Resolves true when the person confirms, false when they cancel or press Escape. */
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  /** Reports something that already happened; resolves when the person acknowledges. */
  notify: (request: NotifyRequest) => Promise<void>;
};

export const DialogContext = createContext<DialogApi | null>(null);

export const useDialogs = (): DialogApi => {
  const api = useContext(DialogContext);

  if (api === null) {
    throw new Error('useDialogs necesita estar dentro de <DialogProvider>.');
  }

  return api;
};
