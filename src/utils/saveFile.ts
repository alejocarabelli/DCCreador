type NativeSave = (filename: string, bytes: Uint8Array) => Promise<string | null>;

declare global {
  interface Window {
    /** Set by the Windows shell (src-tauri): a native Save dialog that writes the bytes. */
    __modeladorNativeSave?: NativeSave;
  }
}

/** What happened to a save: written (path when native), cancelled in the dialog, or failed. */
export type SaveOutcome = { status: 'saved'; path: string | null } | { status: 'cancelled' } | { status: 'failed'; error: string };

const anchorDownload = (href: string, filename: string): void => {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
};

/**
 * The one way the app hands a file to the user. In the browser and the macOS
 * shell it is the usual `<a download>` (the Mac shell turns it into a Save
 * panel); in the Windows shell it opens the native Save dialog instead, since
 * WebView2 would otherwise drop the file in Downloads without asking.
 */
export const saveBlob = async (blob: Blob, filename: string): Promise<SaveOutcome> => {
  const native = typeof window === 'undefined' ? undefined : window.__modeladorNativeSave;
  if (native) {
    try {
      const path = await native(filename, new Uint8Array(await blob.arrayBuffer()));
      return path === null ? { status: 'cancelled' } : { status: 'saved', path };
    } catch (error) {
      return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  }
  const url = URL.createObjectURL(blob);
  anchorDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { status: 'saved', path: null };
};

export const saveDataUrl = async (dataUrl: string, filename: string): Promise<SaveOutcome> => {
  if (typeof window !== 'undefined' && window.__modeladorNativeSave) {
    return saveBlob(await (await fetch(dataUrl)).blob(), filename);
  }
  anchorDownload(dataUrl, filename);
  return { status: 'saved', path: null };
};

/**
 * For callers that do not report the outcome themselves: a native failure
 * still reaches the user instead of vanishing.
 */
export const reportSaveFailure = (outcome: SaveOutcome): SaveOutcome => {
  if (outcome.status === 'failed') window.alert(`No se pudo guardar el archivo.\n\n${outcome.error}`);
  return outcome;
};
