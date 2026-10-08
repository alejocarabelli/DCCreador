# Versión de Windows

La app de Windows es la misma app web que la del Mac, envuelta con [Tauri](https://tauri.app) sobre WebView2 (el motor de Edge que ya trae Windows 10 y 11). Todo lo nativo está en `src-tauri/`; el Mac sigue con `macos/AppMain.m`.

## Qué hace la parte nativa

| Mac (`AppMain.m`) | Windows (`src-tauri/src/main.rs`) |
|---|---|
| Panel de Guardar al exportar | `save_file` abre el diálogo de Guardar de Windows (`src/utils/saveFile.ts` lo usa si existe `window.__modeladorNativeSave`) |
| Respaldo en `~/Documents/Modelador de Sistemas/Respaldos` | Lo mismo en `Documentos\Modelador de Sistemas\Respaldos` (sigue a OneDrive si Documentos está ahí); conserva los últimos 10 |
| Ventanas de vista de solo lectura | Igual: una por diagrama, en otro monitor si hay; se cierran con la principal |
| `window.webkit.messageHandlers` | `window.__modeladorBridges` (mismo `postMessage` con promesa), inyectado por `shim-common.js` y `shim-main.js` |
| Respaldo final al cerrar | La principal no se cierra hasta que el frontend guardó y escribió el respaldo (máximo 5 s; un segundo clic en cerrar no espera) |

Además: los enlaces externos se abren en el navegador, los atajos del navegador de WebView2 (F5, Ctrl+R, Ctrl+P, Ctrl+F, zoom) están apagados para que no pisen los de la app, y las etiquetas de atajos se muestran como `Ctrl+Mayús+Z` en vez de `⇧⌘Z` (`src/utils/shortcutLabel.ts`).

**No cambiar nunca** el `identifier` de `tauri.conf.json` ni el esquema (`http://tauri.localhost`): los proyectos viven en el almacenamiento de WebView2 de ese origen y cambiarlos los escondería.

## Compilar

Lo compila GitHub Actions (`.github/workflows/windows.yml`) en cada push a `main`: el instalador queda como artefacto `modelador-windows`. Con una etiqueta `v2.*` se sube a la release junto al `.dmg`.

Para probar la parte nativa en el Mac (usa WebKit, no WebView2, pero los puentes son los mismos):

```bash
MODELADOR_BACKUP_DIR=/tmp/respaldos-prueba npx tauri dev
```

En desarrollo los respaldos van a `Respaldos-dev` (o a `MODELADOR_BACKUP_DIR` si está definida), nunca a la carpeta de la app real: la rotación borraría sus copias.

Los tests de la parte nativa: `cargo test --manifest-path src-tauri/Cargo.toml` (necesita `npm run build` antes).

Al subir de versión, cambiarla también en `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml`.

## El instalador

Es un instalador NSIS por usuario (no pide permisos de administrador), en español. No está firmado: Windows SmartScreen muestra «Windows protegió tu PC»; se instala con **Más información → Ejecutar de todas formas**.

## Lista de prueba en una PC con Windows

- [ ] Instalar (aviso de SmartScreen incluido) y abrir.
- [ ] Crear un proyecto, cerrar la app, volver a abrir: el proyecto sigue.
- [ ] Editar un proyecto y cerrar la app enseguida (menos de un segundo); al volver a abrir, el cambio sigue.
- [ ] Exportar proyecto JSON, artefacto JSON, PNG y PDF de cada tipo de diagrama, Word y PDF del flujo de casos de uso: cada uno abre el diálogo de Guardar; cancelar no muestra «exportado».
- [ ] Exportar un proyecto cuyo nombre tenga `:` o `/` (por ejemplo «TP 2: Reservas»): el diálogo propone un nombre válido.
- [ ] Importar un JSON.
- [ ] Aparece `Documentos\Modelador de Sistemas\Respaldos\respaldo-*.json` y «revelar» abre el Explorador ahí.
- [ ] Abrir un diagrama en ventana aparte; «Editar en la ventana principal» vuelve a la principal con ese diagrama.
- [ ] Arrastrar para reordenar atributos y pasos.
- [ ] Atajos: Ctrl+Z, Ctrl+Mayús+Z, Ctrl+D, Ctrl+C/V, Ctrl+1…9, Ctrl+W, Ctrl+Tab. F5 y Ctrl+R no recargan. Dentro de un campo de texto siguen andando Ctrl+C/V/X/Z/A.
- [ ] Un enlace externo se abre en el navegador.
- [ ] Reinstalar encima (una versión nueva): los proyectos siguen.
- [ ] Desinstalar: si ofrece borrar los datos de la app, anotarlo aquí (marcarlo borra los proyectos; los respaldos en Documentos quedan).
