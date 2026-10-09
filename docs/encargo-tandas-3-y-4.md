# Encargo: tandas 3 y 4 del lanzamiento al curso

Para el Claude Code de Lauti. Alejo quiere pasarle el Modelador de Sistemas a todo el curso (Mac y Windows) y que nada falle ni confunda a alguien que la abre sin explicación. Las tandas 1 y 2 ya están hechas, en los PRs #31 (`lanzamiento/tanda-1` → `main`) y #32 (`lanzamiento/tanda-2` → `lanzamiento/tanda-1`), sin mergear. Te tocan la **tanda 3 (coherencia)** y la **tanda 4 (versión y distribución)**.

**Antes de escribir código:** leé entera `docs/auditoria-lanzamiento.md` (hallazgos A–F, verificación, decisiones de Alejo y listas de pendientes), `DESIGN.md` y `README.md`. Después mostrale a Lauti un plan corto: qué ítems hacés, en qué orden, qué archivos toca cada uno, qué agente usás para cada uno y cuáles corren en paralelo. Esperá su OK.

## Ramas y PRs

```bash
git fetch
git checkout -b lanzamiento/tanda-3 origin/lanzamiento/tanda-2
```

- Tanda 3: rama `lanzamiento/tanda-3`, PR contra `lanzamiento/tanda-2`.
- Tanda 4: al terminar la 3, rama `lanzamiento/tanda-4` desde `lanzamiento/tanda-3`, PR contra `lanzamiento/tanda-3`.
- **No mergees nada, no crees etiquetas ni publiques una release.** Eso lo hace Alejo.

## Tanda 3: coherencia

Detalle de cada ítem en la auditoría (sección F, E y pendientes). En orden de prioridad:

1. **Revisar con un solo formato** (F7, F8). Hoy el flujo usa un panel lateral y clases y secuencia ventanas flotantes distintas; casos de uso no tiene. Un solo formato en los cinco editores, que se cierre con Esc. Arreglar la cabecera corrida y la tabla cortada del panel del flujo. Sacar falsos avisos que queden.
2. **Pantalla vacía y botón destacado coinciden** (F1). En secuencia, «Mensaje» no activo sin participantes y el primer mensaje propone al actor como origen.
3. **Selección múltiple** (F2). Shift+clic también suma; una pista discreta la primera vez; con varios elementos el inspector dice «N elementos seleccionados» con la acción de eliminar.
4. **Flujo de sucesos** (F6, pendientes 17-18). Placeholders que no parezcan valores («3», «CA 1»); Tab desde Ref. no cae en el botón que agrega filas; «sin paso de origen» o funciona o no parece enlace; la numeración no se pierde al borrar «1. »; el cursor tras la viñeta automática no se reubica mal (`src/utils/textCaret.ts`).
5. **Clases de secuencias** (F4, F15, E15). «N novedades» con un nombre claro; los métodos traídos conservan sus parámetros; «Organizar (2)» y «Al día con 1 secuencia» se entienden solos.
6. **Vincular en secuencias** (F5 y pendiente de B6). Un solo término para la misma acción; «Desvincular» / «Sin modelo de clases» se respetan con `null` explícito, igual que ya se hizo en flujos (`classDiagramArtifactId` en `src/types/diagram.ts`, `src/utils/artifactTransfer.ts`, `docs/artifact-json-guide.md`).
7. **Consistencia chica.** `String`/`Date` iguales en atributos y métodos (E16, F9); el botón «S» de estático se explica (E14); «1 clases de secuencias» (E17); `f(a, b)` igual en estructura y diagrama (F10); los diagramas del ejemplo se abren ajustados a la vista (F11); «Guía de artefactos para IA» fuera de «Nuevo artefacto» (a un lugar discreto, F12); elementos nuevos de casos de uso no nacen pegados al borde (F13); barra del modo teclado sin cortes (F14); avisos de React Flow por `nodeTypes`/`edgeTypes` recreados (F16).
8. **Deshacer en casos de uso.** Crear o borrar una relación siempre abre un paso propio de historial.

Fuera de alcance: inicio asistido / recorrido animado (lo sigue Alejo), sugerir actores ya creados, rediseños visuales grandes.

## Tanda 4: versión y distribución

1. **Versión visible.** Mostrar `APP_VERSION` (sale de `package.json`, única fuente) en un lugar discreto: pie de la barra lateral o diálogo de ayuda. En Windows no hay «Acerca de»: tiene que verse en la app. Actualizar la sección «¿Algo no anda?» del README.
2. **Buscar actualizaciones.** Al abrir (como mucho una vez por día) y a pedido desde la interfaz, consultar `https://api.github.com/repos/alejocarabelli/Modelador-de-Sistemas/releases/latest`. Si hay una versión mayor que `APP_VERSION`, un aviso discreto «Hay una versión nueva (X.Y.Z)» con un botón que abre la página de la release en el navegador. Sin descargas automáticas. Sin conexión o con error, silencio (la app funciona offline). Comparación de versiones semántica con pruebas. Verificar que el enlace se abra afuera en macOS (`macos/AppMain.m`, `decidePolicyForNavigationAction` ya abre enlaces con `NSWorkspace`) y en Windows (Tauri, `tauri-plugin-opener`: revisá `src-tauri/capabilities/` y la CSP de `src-tauri/tauri.conf.json` para permitir el `fetch` a api.github.com).
3. **Notas de la 2.5.0.** Hoy `.github/workflows/macos-v2.yml` publica la release con `--notes-file REDISENO-V2.md`, un registro viejo del rediseño. Crear `docs/release-notes.md` (o similar) para compañeros: instalación en Mac (con el paso real de Gatekeeper del README) y Windows, y las novedades de la 2.5.0 agrupadas por lo que nota el usuario (tandas 1 a 4, en castellano claro, sin jerga). Apuntar el workflow a ese archivo y revisar que `windows.yml` no pise las notas si crea la release primero.
4. **Subir la versión a 2.5.0** en `package.json` (y `package-lock.json`). Nada más: el resto la toma de ahí.
5. **Windows.** Revisar que los atajos y textos de ayuda muestren Ctrl y no ⌘ (`src/components/ShortcutsDialog.tsx` ya convierte; buscar otros lugares con ⌘ fijo). Disparar la compilación en CI: `gh workflow run windows.yml --ref lanzamiento/tanda-4` y revisar que pase. No se puede probar en un equipo real desde acá: decirlo.
6. **Limpieza.** `scripts/advancedSequenceRunner.tsx` (CHECK 5 y 6) busca las plantillas eliminadas: actualizarlo o quitar esos chequeos. Que `REDISENO-V2.md` no se use más como notas.

## Agentes: cuál usar para qué

Vos coordinás, decidís y revisás cada diff; delegá la ejecución para ahorrar límite. Lo que se vio trabajar en las tandas 1 y 2:

**Haiku 5.5** (`model: "haiku"`) es muy barato y rindió bien. Usalo para:
- Ítems bien especificados de uno o pocos archivos: textos, plurales, placeholders, quitar código, cambios de CSS acotados, versión visible, notas de la release, README. Esfuerzo `high`.
- Lógica con trampas (historial de deshacer, teclado, vínculos entre artefactos, comparación de versiones): esfuerzo `xhigh`.
- Confirmar un bug antes de arreglarlo escribiendo una prueba que falla.
- Verificaciones en el navegador **con pasos exactos** (qué tocar, qué escribir, qué valor leer y qué esperar): fue preciso y encontró regresiones reales.
- Cómo pedirle: archivos que puede tocar y **archivos que no** (los que está tocando otro agente), decisiones ya tomadas (no le dejes decidir diseño), criterio de terminado, pruebas a escribir. Si no se lo decís, toma decisiones por su cuenta y las informa al final: leé esa parte del informe.

**Sonnet 5.5** (`model: "sonnet"`, esfuerzo `medium`) solo cuando hace falta criterio o iterar:
- Bugs que no salen leyendo el código y hay que reproducir, instrumentar y probar en vivo. Ejemplo de la tanda 2: el «Maximum update depth» del flujo estaba en el indicador de guardado de `useProjects`, no en el editor; lo encontró Sonnet reproduciéndolo en el navegador después de que un arreglo leyendo el código no alcanzó.
- Cambios visuales y de layout que hay que medir en varios anchos (1100, 1280, 1440) y en claro/oscuro: unificar Revisar, barras, popovers que se salen de la ventana.
- Cambios que tocan datos o persistencia (formato, `useProjects`, `src/storage/**`, código nativo): Sonnet, y además revisalos vos con cuidado.
- El recorrido final de primer uso como estudiante nuevo, con almacenamiento limpio: es juicio de UX, no una checklist.
- No lo uses para textos ni cambios mecánicos: es mucho más caro que Haiku.

**Para todos:**
- Un **git worktree por agente** (`git worktree add <dir> -b lanzamiento/<tema>` desde tu rama, y `ln -s "$PWD/node_modules" <dir>/node_modules`). Nunca dos agentes sobre el mismo archivo a la vez; si se cruzan, secuencialos.
- Los agentes **no hacen commits**: vos revisás el diff en su worktree, commiteás ahí y mergeás a tu rama.
- Puertos de vite distintos por agente (5179, 5180, …; **nunca 5174**, es el de Alejo). El navegador de Playwright es compartido: dos agentes a la vez pueden pisarse pestañas, mejor que no coincidan.
- Archivos enormes (`SequenceDiagramEditor.tsx` ~5k líneas, `UseCaseFlowEditor.tsx`, `DiagramEditor.tsx`, `App.tsx`): grep y rangos, nunca enteros.

## Reglas

- Textos en castellano rioplatense con voseo, cortos, sin nombres internos. Neutros en género («Te damos la bienvenida», no «Bienvenido»). Código al estilo del que lo rodea.
- Cada arreglo con su prueba cuando se pueda aislar. Antes de cada commit: `npx vitest run && npx tsc -b && npx eslint . && git commit …` (encadenado con `&&`: si algo falla, no se commitea).
- **No cambies el formato de datos** sin preguntarle a Alejo (salvo el `null` de «Desvincular», ya decidido). Los proyectos guardados de todos tienen que seguir abriendo igual.
- Compilar macOS solo con `SKIP_INSTALL=1 zsh scripts/build-macos-app.sh` (sin esa variable reemplaza la app instalada). No pisar archivos `build/*` de versiones publicadas.
- Commits chicos en castellano, mismo estilo que `git log origin/lanzamiento/tanda-2`.
- Al cerrar cada tanda: recorrido de primer uso en el navegador (proyecto nuevo, los cinco artefactos, el ejemplo, modo oscuro) y actualizar `docs/auditoria-lanzamiento.md` con qué quedó resuelto y qué no.

## Cada PR

Título «Lanzamiento al curso, tanda N: …». Descripción: qué cambia (agrupado por lo que nota el usuario), cómo se verificó, checklist de lo que Alejo tiene que probar a mano, y lo que no se pudo verificar. Honesto con lo que quedó sin hacer.
