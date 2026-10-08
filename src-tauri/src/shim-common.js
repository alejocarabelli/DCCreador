// Puentes de todas las ventanas (principal y vistas). Tienen la misma forma que
// los del Mac (macos/AppMain.m), `postMessage` que devuelve una promesa con la
// respuesta, pero viven en `window.__modeladorBridges`: en el Mac
// `window.webkit.messageHandlers` es un objeto nativo, y fingirlo en Windows
// haría pasar a WebView2 por Safari ante cualquier librería que lo mire.
(() => {
  if (window.__modeladorShimCommon) return;
  window.__modeladorShimCommon = true;

  const invoke = (command, args, options) => window.__TAURI__.core.invoke(command, args, options);
  const handlers = (window.__modeladorBridges = window.__modeladorBridges || {});

  window.__modeladorNativeWindows = true;
  handlers.windows = {
    postMessage: (message) => invoke('windows_message', {
      action: String(message?.action ?? ''),
      projectId: String(message?.projectId ?? ''),
      artifactId: String(message?.artifactId ?? ''),
      title: message?.title == null ? null : String(message.title),
    }),
  };

  // Exportaciones: diálogo de Guardar nativo. Resuelve con la ruta, o null si se canceló.
  window.__modeladorNativeSave = (filename, bytes) =>
    invoke('save_file', bytes, { headers: { 'x-file-name': encodeURIComponent(filename) } });
})();
