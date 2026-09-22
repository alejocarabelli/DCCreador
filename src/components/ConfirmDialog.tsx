import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { DialogContext, type ConfirmRequest, type DialogApi, type NotifyRequest } from '../hooks/useDialogs';

type PendingDialog = {
  kind: 'confirm' | 'notify';
  request: ConfirmRequest & NotifyRequest;
  host: HTMLElement;
  resolve: (accepted: boolean) => void;
};

type DialogSurfaceProps = {
  pending: PendingDialog;
  onClose: (accepted: boolean) => void;
};

function DialogSurface({ pending, onClose }: DialogSurfaceProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const { title, description } = pending.request;
  const isConfirm = pending.kind === 'confirm';
  const tone = isConfirm ? (pending.request.tone ?? 'danger') : 'neutral';

  const dismiss = useCallback(() => onClose(false), [onClose]);
  // The trap focuses the first focusable child, which is Cancelar on a confirm and
  // the acknowledgement on a notice — the safe default for a destructive action.
  useFocusTrap(dialogRef, true, dismiss);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        ref={dialogRef}
        aria-describedby={description === undefined ? undefined : descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="project-dialog confirm-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role={isConfirm ? 'dialog' : 'alertdialog'}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        {description === undefined ? null : (
          <p className="dialog-description" id={descriptionId}>
            {description}
          </p>
        )}
        <div className="dialog-actions">
          {isConfirm ? (
            <button type="button" onClick={dismiss}>
              {pending.request.cancelLabel ?? 'Cancelar'}
            </button>
          ) : null}
          <button
            className={tone === 'danger' ? 'danger-action' : 'primary-action'}
            type="button"
            onClick={() => onClose(true)}
          >
            {isConfirm ? (pending.request.confirmLabel ?? 'Eliminar') : 'Entendido'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hosts the app's own confirmation and notice dialogs so destructive actions never
 * fall back to the system chrome of `window.confirm` / `window.alert`.
 *
 * The dialog is portalled into `.app-shell` so it inherits the theme tokens even
 * though the provider itself sits above the shell.
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingDialog | null>(null);
  const pendingRef = useRef<PendingDialog | null>(null);

  const api = useMemo<DialogApi>(() => {
    const open = (kind: PendingDialog['kind'], request: ConfirmRequest & NotifyRequest): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        const next: PendingDialog = {
          kind,
          request,
          host: document.querySelector<HTMLElement>('.app-shell') ?? document.body,
          resolve,
        };
        pendingRef.current = next;
        setPending(next);
      });

    return {
      confirm: (request) => open('confirm', request),
      notify: async (request) => {
        await open('notify', request);
      },
    };
  }, []);

  const close = useCallback((accepted: boolean): void => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(accepted);
  }, []);

  return (
    <DialogContext.Provider value={api}>
      {children}
      {pending === null ? null : createPortal(<DialogSurface pending={pending} onClose={close} />, pending.host)}
    </DialogContext.Provider>
  );
}
