# Auditoría antes del lanzamiento al curso — 8 de octubre de 2026

Base: `be9dfcf` (2.4.1). Objetivo: dejar la app lista para pasársela a todo el curso (usuarios sin explicación previa) con la menor cantidad de fallas posible.

Cómo se hizo: cuatro revisiones de código independientes con GPT-6.1 Sol (solo lectura, cada hallazgo verificado en el código por el revisor) y un recorrido de primer uso en navegador limpio. Los hallazgos más graves se volvieron a verificar a mano (ErrorBoundary inexistente, recorte de apuntes, texto de plantillas, mensaje de recuperación).

Estado de cada hallazgo: se marca en la tabla de seguimiento al final a medida que se resuelve.

## Verificaciones propias

- **Gatekeeper:** el zip de la 2.4.1 con atributo de cuarentena (como si se bajara de GitHub) queda `rejected` por `spctl` (firma ad-hoc, sin notarizar). Las notas de la release dicen «clic derecho → Abrir», paso que ya no existe desde macOS 15: el único camino es **Configuración del Sistema → Privacidad y seguridad → Abrir igualmente** después del primer intento.
- **Versión:** `src/constants/appInfo.ts` dice `2.0.0`; `macos/Info.plist` y `src-tauri/tauri.conf.json` dicen `2.4.1`; `scripts/build-macos-app.sh` repite `2.4.1` en los nombres de archivo. `APP_VERSION` no se muestra en ningún lado de la interfaz.
- **README:** el repositorio es público y no tiene README en la raíz.
- **Salud:** 774 tests pasan; lint y `tsc` limpios.

## A. Pérdida de datos y persistencia


1. **CRÍTICO — Los apuntes largos se recortan sin aviso.**  
   **Archivo:** [artifactNotebook.ts:147](<../src/utils/artifactNotebook.ts:147>), [notebookBlocks.ts:34](<../src/components/notebook/notebookBlocks.ts:34>).  
   **Reproducción:** pegar más de 20.000 caracteres en un bloque de apuntes, esperar el guardado y reabrir la app. Desaparece el excedente. También se pierden los bloques posteriores al número 500. La UI admite ambos excesos; la normalización los recorta al cargar y exportar. Comprobé en memoria que 20.003 caracteres quedan en 20.000, sin advertencia.  
   **Arreglo:** aplicar los límites durante la edición, con aviso visible, y preservar los datos existentes que los excedan.

2. **CRÍTICO — La corrupción parcial se normaliza y sobrescribe silenciosamente.**  
   **Archivo:** [diagramNormalization.ts:419](<../src/utils/diagramNormalization.ts:419>), [projectsStorage.ts:78](<../src/storage/projectsStorage.ts:78>).  
   **Reproducción:** abrir la app con un JSON sintácticamente válido que contenga un artefacto de tipo inválido o un diagrama cuyo `nodes` dejó de ser un array. El artefacto desaparece o el diagrama queda vacío; no aparece advertencia ni copia de recuperación. A los 250 ms se guarda el resultado reducido, incluso sin editar.  
   **Arreglo:** detectar normalizaciones que eliminan contenido, preservar primero el JSON original y suspender el guardado automático hasta resolver la recuperación.

3. **CRÍTICO — Si no cabe la recuperación, crear un proyecto destruye el original.**  
   **Archivo:** [projectsStorage.ts:45](<../src/storage/projectsStorage.ts:45>), [useProjects.ts:159](<../src/hooks/useProjects.ts:159>).  
   **Reproducción:** abrir con almacenamiento corrupto y sin espacio para duplicarlo. La app muestra cero proyectos y recomienda exportarlos, aunque no están disponibles. Crear un proyecto pequeño permite reemplazar el JSON corrupto: `skipInitialSave` protege únicamente el primer guardado. Comprobé ese recorrido en memoria.  
   **Arreglo:** mantener bloqueada la escritura sobre la clave original hasta preservar una copia descargable o en disco, o recibir una decisión explícita de descartarla.

4. **CRÍTICO — El cierre de Windows omite apuntes todavía pendientes.**  
   **Archivo:** [NotebookSheet.tsx:117](<../src/components/notebook/NotebookSheet.tsx:117>), [shim-main.js:37](<../src-tauri/src/shim-main.js:37>).  
   **Reproducción:** escribir en apuntes y cerrar con `Alt+F4` antes de los 400 ms, manteniendo el foco en el campo. El cierre dispara `pagehide` y guarda los proyectos, pero el borrador todavía vive dentro de `NotebookSheet`, que solo entrega cambios por temporizador, blur o desmontaje. La preparación del cierre no vacía ese borrador.  
   **Arreglo:** coordinar el cierre en este orden: entregar borradores, actualizar proyectos, guardar localmente, completar el respaldo y cerrar.

5. **CRÍTICO — En macOS, copias idénticas pueden eliminar la última versión recuperable.**  
   **Archivo:** [useProjects.ts:235](<../src/hooks/useProjects.ts:235>), [AppMain.m:275](<../macos/AppMain.m:275>).  
   **Reproducción:** tener un respaldo con un artefacto, eliminarlo dejando otro en el proyecto y abrir la app diez veces, separadas por más de diez minutos, sin editar. Cada apertura respalda otra vez el mismo estado; la rotación conserva solo diez archivos y elimina el que contenía el artefacto borrado. Windows sí compara contenido en su puente; macOS no.  
   **Arreglo:** evitar respaldos idénticos y preservar una copia anterior a eliminaciones, fuera de la rotación ordinaria.

6. **ALTO — Importar un respaldo de varios proyectos no restaura los existentes.**  
   **Archivo:** [ProjectHome.tsx:105](<../src/components/ProjectHome.tsx:105>), [useProjects.ts:664](<../src/hooks/useProjects.ts:664>).  
   **Reproducción:** tener dos proyectos, borrar contenido de uno y elegir un respaldo anterior mediante **Importar…**. Los proyectos cuyos IDs siguen presentes se omiten; no se recupera el contenido. Un archivo con un solo proyecto, en cambio, se importa como copia.  
   **Arreglo:** ofrecer por proyecto «recuperar como copia», «reemplazar» u «omitir», conservando una copia antes de reemplazar.

7. **ALTO — El respaldo pendiente nunca se programa para después.**  
   **Archivo:** [useProjects.ts:213](<../src/hooks/useProjects.ts:213>).  
   **Reproducción:** obtener un respaldo, editar un minuto después y dejar la app abierta en primer plano durante quince minutos. La edición se guarda en localStorage, pero no llega al disco: el intento se descarta por el intervalo y no se programa otro. Hace falta otro cambio o una ocultación/cierre.  
   **Arreglo:** programar un respaldo pendiente al vencer el intervalo, usando el estado más reciente.

8. **ALTO — Los errores de respaldo quedan ocultos mientras se trabaja.**  
   **Archivo:** [App.tsx:798](<../src/App.tsx:798>), [ProjectHome.tsx:24](<../src/components/ProjectHome.tsx:24>).  
   **Reproducción:** trabajar dentro de un proyecto cuando falla la escritura del respaldo, por ejemplo por disco lleno. `backup.error` se conserva, pero solo se muestra al volver a **Proyectos**; el editor puede seguir indicando «Guardado» porque localStorage funcionó.  
   **Arreglo:** mostrar el fallo del respaldo también dentro del editor, con acceso a exportar y reintentar.

Comprobaciones que descartaron otras sospechas: **QuotaExceededError sí genera aviso global y estado de error**; los apuntes almacenan texto y trazos vectoriales, sin imágenes. Las ventanas auxiliares montan un visor que escucha `storage` y consulta periódicamente: no guardan el array de proyectos. **Importar un proyecto individual o un artefacto no reemplaza el existente por coincidencia de ID.** Eliminar proyecto o artefacto exige confirmación y avisa que no puede deshacerse. Para recuperar desde una app vacía existe **Importar proyecto…**, con instrucciones hacia la carpeta **Respaldos**.

**Sin confirmar:** la pérdida efectiva al cerrar macOS inmediatamente después de editar. El código guarda con debounce de 250 ms y escucha `pagehide`/`visibilitychange`, pero `Cmd+Q` llama directamente a `terminate:` y no existe una espera nativa del guardado o respaldo en [AppMain.m:593](<../macos/AppMain.m:593>). No verifiqué qué eventos alcanza a emitir WKWebView durante ese cierre.

## B. Crashes y estados inconsistentes


1. **CRÍTICO — Un JSON aceptado puede dejar toda la app en blanco.**  
   **Archivos:** [artifactFile.ts:46](../src/utils/artifactFile.ts:46), [diagramNormalization.ts:185](../src/utils/diagramNormalization.ts:185), [UseCaseModelEditor.tsx:736](../src/components/UseCaseModelEditor.tsx:736), [main.tsx:37](../src/main.tsx:37).  
   **Reproducción:** Exportar un modelo de casos de uso; cambiar el `data.name` de un actor por `123`; importarlo como artefacto; seleccionar ese actor. La validación acepta el número, pero el inspector ejecuta `.trim()` y falla. No hay ErrorBoundary en la aplicación ni en ArtifactViewer; Suspense tampoco captura esta excepción.  
   **Arreglo:** Validar y normalizar los campos de los nodos antes de importarlos. Añadir un ErrorBoundary que permita volver al proyecto sin desmontar toda la aplicación.

2. **ALTO — Seleccionar elementos borra Rehacer y consume Deshacer.**  
   **Archivos:** [UseCaseModelEditor.tsx:398](../src/components/UseCaseModelEditor.tsx:398), [diagramNormalization.ts:179](../src/utils/diagramNormalization.ts:179), [artifactHistory.ts:15](../src/utils/artifactHistory.ts:15).  
   **Reproducción:** En un modelo de casos de uso con varios nodos, mover uno; deshacer desde la barra; seleccionar otro nodo. Rehacer desaparece: los cambios de selección se guardan como contenido y vacían `future`. Seleccionar después de editar también agrega pasos de Deshacer que solamente revierten selecciones.  
   **Arreglo:** Mantener selección y mediciones fuera del contenido y del historial, como hace el editor de clases.

3. **ALTO — Deshacer en una secuencia restaura nombres desactualizados.**  
   **Archivos:** [App.tsx:537](../src/App.tsx:537), [useProjects.ts:597](../src/hooks/useProjects.ts:597), [sequenceClassImport.ts:150](../src/utils/sequenceClassImport.ts:150).  
   **Reproducción:** Vincular una secuencia con una clase `Cliente` y su método `buscar`; mover un participante; renombrar en “Clases de secuencias” a `Socio` y `consultar`; volver a la secuencia y deshacer el movimiento. Regresan los nombres `Cliente` y `buscar`, aunque los IDs siguen vinculados al modelo actualizado. La reconciliación conserva esos enlaces sin corregir los nombres.  
   **Arreglo:** Propagar los renombrados también a los snapshots de las secuencias, o reconciliar los nombres vinculados al restaurar el historial.

4. **ALTO — Enter en una confirmación actúa sobre el editor de secuencias.**  
   **Archivos:** [SequenceDiagramEditor.tsx:323](../src/components/SequenceDiagramEditor.tsx:323), [SequenceDiagramEditor.tsx:1202](../src/components/SequenceDiagramEditor.tsx:1202), [ConfirmDialog.tsx:39](../src/components/ConfirmDialog.tsx:39).  
   **Reproducción:** Seleccionar un participante; activar el modo mensajes con `M`; pulsar Suprimir; con “Cancelar” enfocado en la confirmación, pulsar Enter. El compositor intercepta Enter y cambia de etapa, impidiendo activar el botón. Su guarda reconoce `<dialog>`, pero la confirmación usa un `<div role="dialog">`.  
   **Arreglo:** Suspender los atajos del editor mientras haya cualquier diálogo modal abierto y respetar `event.defaultPrevented`.

5. **MEDIO — Copiar o duplicar también cambia el modo de mensajes.**  
   **Archivo:** [SequenceDiagramEditor.tsx:1207](../src/components/SequenceDiagramEditor.tsx:1207).  
   **Reproducción:** Seleccionar un mensaje; activar `M`; pulsar ⌘/Ctrl+C o ⌘/Ctrl+D. Además del manejador de copiar/duplicar, el compositor interpreta `c` como creación y `d` como destrucción: esas ramas no comprueban los modificadores.  
   **Arreglo:** Exigir ausencia de Ctrl, Meta y Alt para los comandos de una sola letra.

6. **MEDIO — “Sin referencia” no funciona y una referencia borrada cambia silenciosamente.**  
   **Archivo:** [UseCaseFlowEditor.tsx:280](../src/components/UseCaseFlowEditor.tsx:280).  
   **Reproducción:** Con un único diagrama de clases, abrir un flujo y elegir “Sin referencia”: vuelve a aparecer el diagrama. También ocurre si el flujo apunta a A y se borra A dejando solamente B: el editor pasa a usar B para vocabulario y revisión, sin mostrar que la referencia guardada desapareció.  
   **Arreglo:** Aplicar la elección automática solamente al crear el flujo; después respetar la desvinculación y mostrar las referencias inexistentes.

7. **MEDIO — Una secuencia vacía se exporta como dos páginas sin diagrama.**  
   **Archivos:** [SequenceDiagramEditor.tsx:3321](../src/components/SequenceDiagramEditor.tsx:3321), [sequenceDiagramExport.ts:171](../src/utils/sequenceDiagramExport.ts:171).  
   **Reproducción:** Crear una secuencia; no agregar participantes, mensajes ni notas; exportar PDF con las opciones predeterminadas. Se informa éxito y se generan dos páginas sin contenido del diagrama. PNG también permite exportar el fondo vacío.  
   **Arreglo:** Detectar la ausencia de contenido antes de exportar y mostrar “No hay diagrama para exportar”, como hacen los editores que usan ReactFlow.

## C. Textos, terminología y atajos


1. **CRÍTICO — Una plantilla reemplaza trabajo pese a prometer que no lo altera.**  
   **Archivos:** [SequenceDiagramEditor.tsx:5377](<../src/components/SequenceDiagramEditor.tsx:5377>), [SequenceDiagramEditor.tsx:1735](<../src/components/SequenceDiagramEditor.tsx:1735>), [App.tsx:144](<../src/App.tsx:144>).  
   **Reproducción:** Abrir una secuencia con trabajo → Plantillas → leer “sin alterar proyectos existentes” → “Cargar en este diagrama”. Reemplaza el contenido sin confirmación. Deshacer permite recuperarlo durante la sesión; cerrar y reabrir pierde ese historial.  
   **Arreglo:** Cambiar el botón a “Reemplazar este diagrama…” y confirmar explícitamente la sustitución. Reservar la promesa de conservación para “Crear como nuevo diagrama”.

2. **ALTO — Los apuntes se exportan aunque se anuncien como privados.**  
   **Archivos:** [NotebookSheet.tsx:406](<../src/components/notebook/NotebookSheet.tsx:406>), [diagramNormalization.ts:272](<../src/utils/diagramNormalization.ts:272>), [artifactFile.ts:71](<../src/utils/artifactFile.ts:71>), [projectFile.ts:10](<../src/utils/projectFile.ts:10>).  
   **Reproducción:** Escribir una duda en Apuntes → leer “Solo para vos: no se exporta” → exportar el artefacto o proyecto como JSON. El archivo incluye `notebook` y sus textos.  
   **Arreglo:** Aclarar “No aparece en PDF ni Word; sí se incluye en los archivos JSON”, o excluirlo de las exportaciones destinadas a compartir.

3. **ALTO — Enter no edita la nota cuando tiene el foco.**  
   **Archivos:** [ShortcutsDialog.tsx:62](<../src/components/ShortcutsDialog.tsx:62>), [SequenceDiagramCanvas.tsx:222](<../src/components/SequenceDiagramCanvas.tsx:222>), [SequenceDiagramCanvas.tsx:1512](<../src/components/SequenceDiagramCanvas.tsx:1512>).  
   **Reproducción:** Crear una nota → enfocarla con Tab → pulsar Enter. Solo se selecciona: su manejador detiene la propagación y no recibe la función de edición, impidiendo que actúe el atajo global.  
   **Arreglo:** Pasar `onEditNote` al manejador de Enter de la nota, como ya se hace con los mensajes.

4. **ALTO — “Eliminar la selección” elimina solo un elemento en casos de uso.**  
   **Archivos:** [ShortcutsDialog.tsx:51](<../src/components/ShortcutsDialog.tsx:51>), [UseCaseModelEditor.tsx:678](<../src/components/UseCaseModelEditor.tsx:678>), [UseCaseModelEditor.tsx:273](<../src/components/UseCaseModelEditor.tsx:273>).  
   **Reproducción:** Seleccionar varios actores/casos mediante Mayús+arrastrar → pulsar Retroceso. El editor guarda únicamente el primer nodo y la primera relación seleccionados; elimina uno, con prioridad para la relación.  
   **Arreglo:** Eliminar todos los elementos seleccionados y las relaciones afectadas, para cumplir la instrucción compartida con clases.

5. **MEDIO — “Salir … Esc” no equivale a pulsar Esc.**  
   **Archivos:** [SequenceDiagramEditor.tsx:4959](<../src/components/SequenceDiagramEditor.tsx:4959>), [sequenceKeyboardMode.ts:277](<../src/utils/sequenceKeyboardMode.ts:277>).  
   **Reproducción:** Activar M → Enter para elegir destino → pulsar Esc siguiendo “Salir del modo teclado (Esc)”. Vuelve a la navegación y mantiene el modo activo; hacer clic en Salir sí lo desactiva inmediatamente.  
   **Arreglo:** Mostrar “Esc: volver; M: salir”, o hacer que el atajo anunciado tenga el mismo resultado que el botón.

6. **MEDIO — Duplicar promete admitir cualquier elemento.**  
   **Archivos:** [ShortcutsDialog.tsx:63](<../src/components/ShortcutsDialog.tsx:63>), [SequenceDiagramEditor.tsx:2556](<../src/components/SequenceDiagramEditor.tsx:2556>).  
   **Reproducción:** Consultar “Duplicar el elemento seleccionado” → seleccionar una nota o participante → ⌘D/Ctrl+D. No hace nada: solo acepta mensajes y fragmentos.  
   **Arreglo:** Precisar “Duplicar el mensaje o fragmento seleccionado”, o implementar la duplicación de los otros elementos.

7. **MEDIO — La ayuda central omite atajos importantes que sí funcionan.**  
   **Archivos:** [ShortcutsDialog.tsx:71](<../src/components/ShortcutsDialog.tsx:71>), [SequenceDiagramEditor.tsx:1192](<../src/components/SequenceDiagramEditor.tsx:1192>), [SequenceDiagramEditor.tsx:1242](<../src/components/SequenceDiagramEditor.tsx:1242>), [SequenceDiagramEditor.tsx:2522](<../src/components/SequenceDiagramEditor.tsx:2522>), [SequenceKeyboardComposer.tsx:194](<../src/components/SequenceKeyboardComposer.tsx:194>).  
   **Reproducción:** Abrir Atajos y consultar secuencias: faltan ↑/↓ para elegir momento, Tab/Mayús+Tab para cambiar de rama, Alt+←/→ para mover participantes y Mayús+Enter para guardar una llamada con retorno automático. Sus manejadores existen.  
   **Arreglo:** Añadir esas combinaciones y sus condiciones de aplicación al diálogo.

8. **MEDIO — El contador de mensajes cuenta fragmentos como mensajes.**  
   **Archivos:** [SequenceDiagramEditor.tsx:3912](<../src/components/SequenceDiagramEditor.tsx:3912>), [SequenceDiagramEditor.tsx:4116](<../src/components/SequenceDiagramEditor.tsx:4116>).  
   **Reproducción:** Crear un fragmento → agregarle un “Subfragmento opt” vacío → seleccionar el fragmento exterior. “Ramas y Mensajes” indica “1 mensaje”, aunque contiene un fragmento y ningún mensaje. Usa `op.items.length`.  
   **Arreglo:** Contar mensajes recursivamente, o cambiar el rótulo a “elementos” si se quieren contar hijos directos.

9. **MEDIO — Un error recomienda un botón inexistente.**  
   **Archivos:** [SequenceDiagramEditor.tsx:1950](<../src/components/SequenceDiagramEditor.tsx:1950>), [SequenceMessageDialog.tsx:367](<../src/components/SequenceMessageDialog.tsx:367>).  
   **Reproducción:** Crear dos llamadas al mismo objeto → editar la segunda → cambiarla a Crear → guardar. El error indica “Usá el botón create() para crear un DTO nuevo”, pero la interfaz ofrece “Crear”, no un botón `create()`.  
   **Arreglo:** Referirse a “Mensaje → Crear → Objeto nuevo”, usando los nombres actuales y evitando introducir DTO como requisito.

10. **MEDIO — Códigos y nombres internos llegan al usuario.**  
    **Archivos:** [SequenceReviewPanel.tsx:101](<../src/components/SequenceReviewPanel.tsx:101>), [SequenceReviewPanel.tsx:137](<../src/components/SequenceReviewPanel.tsx:137>), [artifactFile.ts:80](<../src/utils/artifactFile.ts:80>).  
    **Reproducción:** Crear un fragmento vacío → Revisar: aparece `incomplete-fragment`. Importar un JSON válido sintácticamente pero sin artefacto válido, por ejemplo `{}`: pide `name`, `type`, `content`, IDs y posiciones numéricas.  
    **Arreglo:** Mostrar categorías españolas en Revisar y explicar que debe elegirse un archivo exportado por la aplicación; dejar los detalles técnicos fuera del mensaje principal.

11. **MEDIO — Una importación parcialmente fallida se presenta como éxito sin informar el fallo.**  
    **Archivo:** [ProjectHome.tsx:106](<../src/components/ProjectHome.tsx:106>).  
    **Reproducción:** Seleccionar juntos un proyecto ya importado y un JSON ilegible. Como no hay proyectos nuevos, muestra “Ese proyecto ya estaba; no se duplicó” y omite el archivo que no pudo leer.  
    **Arreglo:** Incluir `unreadable` también en esta salida y usar un aviso cuando haya archivos fallidos.

12. **MEDIO — Una misma herramienta cambia de nombre durante su uso.**  
    **Archivos:** [ShortcutsDialog.tsx:60](<../src/components/ShortcutsDialog.tsx:60>), [SequenceDiagramEditor.tsx:1181](<../src/components/SequenceDiagramEditor.tsx:1181>), [SequenceDiagramEditor.tsx:4948](<../src/components/SequenceDiagramEditor.tsx:4948>).  
    **Reproducción:** Consultar “modo teclado” → activarlo: aparece “MODO MENSAJES” → desactivarlo con M: anuncia “Modo mensajes desactivado”. Son nombres distintos para el mismo estado.  
    **Arreglo:** Usar “Modo teclado” en ayuda, barra y avisos.

13. **BAJO — Mensajes de resultado conservan plurales de borrador.**  
    **Archivos:** [DiagramEditor.tsx:955](<../src/components/DiagramEditor.tsx:955>), [SequenceDiagramEditor.tsx:3094](<../src/components/SequenceDiagramEditor.tsx:3094>).  
    **Reproducción:** Duplicar una clase: “1 clase(s) duplicada(s)”. Estirar un fragmento para incorporar mensajes: “mensaje(s) incorporado(s)”.  
    **Arreglo:** Resolver singular y plural según el número, como ya hacen otros avisos del editor.

14. **BAJO — Inglés incidental, tildes y mayúsculas inconsistentes.**  
    **Archivos:** [SequenceDiagramEditor.tsx:1524](<../src/components/SequenceDiagramEditor.tsx:1524>), [SequenceDiagramEditor.tsx:4115](<../src/components/SequenceDiagramEditor.tsx:4115>), [sequenceTemplates.ts:137](<../src/data/sequenceTemplates.ts:137>), [sequenceTemplates.ts:175](<../src/data/sequenceTemplates.ts:175>), [sequenceTemplates.ts:218](<../src/data/sequenceTemplates.ts:218>).  
    **Reproducción:** Seleccionar un bloque de secuencia: aviso con “Tip:”. Abrir el inspector: “Ramas y Mensajes”. Abrir Plantillas: “Procesamiento de Pedidos” y “Subproceso con Fragmento Ref”; cargar pedidos muestra “cada item en carrito”.  
    **Arreglo:** Usar “Consejo”, “Ramas y mensajes”, títulos con mayúscula inicial y “cada ítem en carrito”. Los operadores UML pueden conservar su notación.

La versión `2.0.0` de [appInfo.ts:3](<../src/constants/appInfo.ts:3>) **no se muestra**: `APP_VERSION` no tiene usos. “Acerca de…” utiliza el panel nativo de macOS, con `2.4.1` en [Info.plist:22](<../macos/Info.plist:22>). La ayuda convierte correctamente los atajos a Ctrl/Mayús en Windows. No confirmé mezcla de tratamientos ni botones de solo ícono sin ambos atributos `title`/`aria-label`. No modifiqué archivos.

## D. Primer uso y descubribilidad


Con localStorage vacío aparece **«Empezá un proyecto»**, con botones para crear o importar. Hay ayuda mediante `?` y el botón de teclado; Apuntes, Revisar y Exportar también tienen controles visibles. El Word está disponible para los flujos; los diagramas ofrecen PDF e imagen.

Estos hallazgos están verificados en el código. No modifiqué archivos ni probé una instalación descargada desde Releases.

1. **ALTO — La secuencia recibe atajos mientras está abierta la ayuda**
   - **Archivo:** `src/components/SequenceDiagramEditor.tsx:2500`, `:2556`; `src/components/ShortcutsDialog.tsx:103`.
   - **Reproducción:** seleccioná un mensaje, abrí los atajos con `?` y apretá Cmd/Ctrl+D mientras leés el diálogo. El mensaje se duplica detrás de la ayuda: el filtro reconoce `<dialog>`, pero la ayuda es un `<section role="dialog">`. Supr también puede abrir una confirmación de borrado encima.
   - **Arreglo:** suspender todos los atajos del editor cuando haya un modal abierto, usando el mismo filtro que el historial global.

2. **ALTO — Supr elimina solo parte de la selección en casos de uso**
   - **Archivo:** `src/components/UseCaseModelEditor.tsx:273`, `:678`.
   - **Reproducción:** creá dos actores, seleccioná ambos con Cmd/Ctrl+clic y presioná Supr/Backspace. React Flow permite seleccionarlos, pero el editor conserva únicamente `selectedNodes[0]` y borra ese elemento. Si hay una relación seleccionada, la prioriza y deja los nodos.
   - **Arreglo:** mantener los identificadores de toda la selección y borrar nodos y relaciones en una única operación.

3. **ALTO — La distribución para macOS no explica cómo instalar y abrir**
   - **Archivo:** `scripts/build-macos-app.sh:50`; `.github/workflows/macos-v2.yml:48`; `REDISENO-V2.md:10`.
   - **Reproducción:** un compañero entra a la release buscando instrucciones. El pipeline entrega una app con firma ad-hoc, sin notarización, y usa como notas el registro histórico del rediseño. No hay README en la raíz ni instrucciones de apertura ante Gatekeeper. **El mensaje exacto de bloqueo no fue reproducido aquí.**
   - **Arreglo:** acompañar cada release con instrucciones breves: abrir el DMG, arrastrar a Aplicaciones y abrir la app; si macOS bloquea la apertura, explicar la ruta **Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente**, según [Apple](https://support.apple.com/es-lamr/102445). Publicarlas también en un README.

4. **MEDIO — El flujo denuncia como inexistentes los atributos heredados**
   - **Archivo:** `src/utils/projectSymbolIndex.ts:55`; `src/utils/useCaseFlowReview.ts:171`.
   - **Reproducción:** creá `Persona` con atributo `nombre`, y `Alumno` que hereda de Persona. Asociá un flujo y escribí «Buscar instancia de Alumno con:», seguido de una viñeta `nombre igual a Ana`. Revisar dice que `nombre` no es un atributo de Alumno. Lo comprobé ejecutando esas funciones en memoria.
   - **Arreglo:** construir el índice con los atributos heredados, recorriendo la generalización y evitando ciclos.

5. **MEDIO — Un cierre explícito del camino alternativo produce un falso aviso**
   - **Archivo:** `src/utils/useCaseFlowReview.ts:186`.
   - **Reproducción:** creá un camino alternativo referenciado, con nombre, y terminá su último paso con «Fin del caso de uso». Revisar afirma que no dice cómo termina. La expresión solo acepta ciertas fórmulas, entre ellas «Fin CU». También lo comprobé en memoria.
   - **Arreglo:** aceptar expresiones equivalentes como «Fin del caso de uso» y «Finalizar el caso de uso», o presentar la observación como una sugerencia de formato.

6. **MEDIO — El proyecto de ejemplo no llega al usuario**
   - **Archivo:** `src/components/ProjectHome.tsx:153`; `fixtures/demo-gestion-tramites.json:1`.
   - **Reproducción:** abrí la app por primera vez y buscá un ejemplo para entender cómo se relacionan los cinco artefactos. Inicio solo permite crear o importar; Gestión de Trámites está referenciado desde pruebas, sin una acción de UI que lo cargue.
   - **Arreglo:** agregar **«Explorar un ejemplo»**, que importe una copia independiente del fixture.

7. **MEDIO — Crear un proyecto decide por el usuario que debe empezar por clases**
   - **Archivo:** `src/hooks/useProjects.ts:91`, `:255`.
   - **Reproducción:** desde la bienvenida, creá un proyecto para comenzar con casos de uso. Se abre automáticamente un diagrama de clases vacío. El diálogo de creación solo pide el nombre; para hacer lo que pretendías debés descubrir Nuevo artefacto.
   - **Arreglo:** después del nombre, ofrecer elegir el primer artefacto, con una frase sobre cada opción.

8. **MEDIO — La primera asociación de clases requiere adivinar el gesto**
   - **Archivo:** `src/components/DiagramEditor.tsx:1685`; `src/components/ClassNode.tsx:704`; `src/styles.css:1686`.
   - **Reproducción:** creá dos clases y buscá cómo unirlas. La tarjeta inicial dice «uní sus asociaciones», pero no explica arrastrar los conectores. Los círculos aparecen al pasar el mouse o seleccionar, sin una explicación del gesto. Casos de uso sí lo explica explícitamente.
   - **Arreglo:** mostrar una indicación hasta crear la primera relación: **«Arrastrá un círculo del borde hacia otra clase; después seleccioná la línea para definir sus multiplicidades»**.

9. **MEDIO — El vacío de “Clases de secuencias” no explica su propósito**
   - **Archivo:** `src/components/ClassSequenceDiagramEditor.tsx:138`, `:174`; `src/components/DiagramEditor.tsx:1685`.
   - **Reproducción:** creá Clases de secuencias en un proyecto sin secuencias. Aparece la misma tarjeta «Empezá por una clase» del diagrama común y un menú «Sin secuencias vinculadas». No se explica el recorrido de vincular secuencias y traer sus clases y operaciones.
   - **Arreglo:** darle un estado vacío propio que explique esa relación y ofrezca crear o abrir una secuencia.

10. **MEDIO — Duplicar y editar no conservan el comportamiento entre diagramas**
    - **Archivo:** `src/components/SequenceDiagramEditor.tsx:2556`; `src/components/DiagramSelectionTools.tsx:45`; `src/components/SequenceDiagramCanvas.tsx:1439`; `src/components/ShortcutsDialog.tsx:63`.
    - **Reproducción:** usá Cmd/Ctrl+D en un mensaje y luego en una clase o caso de uso: solo funciona en la secuencia. Incluso allí, la ayuda dice «elemento seleccionado», pero no duplica participantes ni notas. Además, doble clic edita los nombres de clases y casos de uso, mientras que sobre un participante de secuencia solamente lo selecciona.
    - **Arreglo:** compartir el atajo de duplicación donde ya existe la acción y abrir la edición del participante con doble clic; precisar en la ayuda qué elementos admite cada operación.

11. **MEDIO — Una secuencia completamente vacía aparece como “Diagrama válido”**
    - **Archivo:** `src/components/SequenceReviewPanel.tsx:68`; `src/utils/sequenceDiagram.ts:1634`.
    - **Reproducción:** creá una secuencia y abrí Revisar sin agregar participantes ni mensajes. El listado de problemas queda vacío —comprobado en memoria— y el panel muestra «Diagrama válido». En clases, el texto es más acotado: «No se detectaron problemas en estas comprobaciones».
    - **Arreglo:** distinguir un diagrama vacío y reemplazar la certificación general por **«Sin problemas en las comprobaciones automáticas»**.

12. **MEDIO — No existe una vía para enterarse de nuevas versiones**
    - **Archivo:** `macos/AppMain.m:584`; `src/components/ProjectSidebar.tsx:466`; `src-tauri/Cargo.toml:16`.
    - **Reproducción:** después de instalar, buscá Buscar actualizaciones o un acceso a las releases. No existe en los menús nativos ni en la UI; tampoco hay una consulta de versiones o un updater integrado.
    - **Arreglo:** incorporar **«Buscar actualizaciones»** con versión instalada y enlace a la release correspondiente, conservando el uso sin conexión.

Las diferencias concretas de gestos quedan así:

| Gesto | Clases / clases de secuencias | Casos de uso | Secuencia | Flujo |
|---|---|---|---|---|
| Supr / Backspace | Borrado directo; varias clases | Borrado directo; solo primer nodo o relación | Pide confirmación para la selección | Edita texto; Backspace también cambia marcadores |
| Cmd/Ctrl+Z | Handler global común fuera de campos | Igual | Igual | Igual; dentro de campos se delega al editor de texto |
| Cmd/Ctrl+D | Sin atajo; duplicación desde menú | Sin atajo; duplicación contextual | Mensajes y fragmentos | Sin duplicación de filas mediante ese atajo |
| Escape | Cierra menús; cancela nombres en edición | Igual | Cancela borradores; retrocede en modo teclado | Cierra autocompletado y menús |
| Doble clic | Crea en lienzo; edita nombres y miembros | Crea en lienzo; edita nombres | Edita mensajes y notas; participante solo se selecciona | Edición directa en campos |
| Zoom | 50–200 % | 20–200 % | 30–180 %, con incrementos distintos | Sin control de zoom propio |

Los límites y la sensibilidad del zoom están en `src/hooks/useGentleWheelZoom.ts:14`, `UseCaseModelEditor.tsx:185` y `SequenceDiagramEditor.tsx:1415`.

Las **cinco mejoras de mayor impacto** para los compañeros serían:

1. **Una descarga que puedan instalar solos:** README y notas de release con pasos por plataforma; asegurar que cada versión incluya también el instalador de Windows, cuyo workflow hoy se ejecuta manualmente.
2. **Un ejemplo editable desde Inicio:** recorrer Gestión de Trámites y ver cómo terminan los cinco artefactos.
3. **Una primera tarea guiada:** elegir el artefacto inicial y explicar la primera conexión, las multiplicidades y el modo teclado de secuencia.
4. **Gestos previsibles:** selección múltiple completa, duplicación coherente, doble clic para editar y modales que suspendan los atajos del lienzo.
5. **Una revisión confiable antes de entregar:** corregir los falsos avisos del flujo y evitar presentar un diagrama vacío como válido.

## E. Recorrido de primer uso (navegador limpio, 1280×800, Chromium)

Hecho por un agente que no conocía la app, sin almacenamiento previo. Cubrió primer arranque, un artefacto de cada tipo, deshacer/rehacer, borrar, renombrar, pestañas, atajos, tema oscuro y exportar PDF. No cubrió importar/respaldos, mover artefactos, Apuntes, Revisar en secuencia/flujo, Word ni ventanas más angostas. Sin errores de JS ni excepciones no capturadas.

**Roto**
1. **Secuencia: la pantalla se pasa 36 px del alto de la ventana.** `.app-shell` mide 836 px en una ventana de 800; la barra de zoom queda cortada y, si algo provoca scroll (p. ej. entrar al modo teclado), sube todo y desaparece la barra de pestañas. En los otros editores entra justo.
2. **Mensaje de retorno: al elegir «Retorno» desaparece el campo de texto y se pierde lo escrito sin aviso.** Queda una flecha sin texto y en Estructura figura «Retorno / Retorno». (Los retornos sin texto pueden ser una decisión de diseño: hay que confirmarlo; aun así no debería perderse lo escrito en silencio.)

**Confuso**
3. Inicio vacío: el único texto de ayuda es para quien viene de la versión anterior («¿Venís de la versión anterior?…»). No hay ejemplo ni recorrido.
4. «Clases de secuencias» se ve idéntico a un diagrama de clases, no explica qué es y se vincula sola a la única secuencia sin avisar. La clave («N novedades» → «Traer seleccionadas») está escondida en un desplegable.
5. Con la barra lateral abierta (1280 px), las barras de herramientas quedan solo con íconos («Participante», «Fragmento», «Apuntes», «Revisar», «Vista», «Exportar»).
6. Casos de uso, relación Asociación: el placeholder del campo Etiqueta es literalmente `<i>` (`src/components/UseCaseModelEditor.tsx:782`).
7. Casos de uso: el caso nuevo aparece casi encima del anterior; al unirlos, «include» sale cortado y rotado.
8. Flujo: Enter / ⌘↵ no se infieren; con Ctrl+Enter la numeración se desordena entre columnas. «CA 1» aparece gris en la columna REF de todas las filas. Los placeholders se repiten en todas las filas.
9. Flujo: el botón «Camino alternativo» no explica que hay que estar parado en un paso; el placeholder del nombre («Datos inconsistentes») es de otro dominio.
10. Placeholders con ejemplos fijos de otro dominio («Consultor», «VcodConsultor», «TramiteActual:Tramite») que parecen texto real; no se sugieren los actores ya creados en el proyecto.
11. Los selectores de vínculo («Diagrama de clases / Sin referencia» en flujo, «Sin modelo» en secuencia) no explican para qué sirve vincular.
12. «Nuevo mensaje»: la dirección por defecto sale de la línea seleccionada (Sistema → actor) y el tipo elegido se recuerda entre diálogos (el segundo mensaje arrancó como Retorno).
13. Exportar secuencia: la vista previa muestra franjas y el texto «Página 1 / y -2–484» en vez del diagrama, y es vertical aunque diga Horizontal. El PDF final sale bien.
14. Clases, inspector de métodos: los campos «parámetros» y «retorno» se ven cortados; el botón «S» (estático) no se entiende.

**Incoherente**
15. «Traer seleccionadas» en Clases de secuencias pierde los parámetros de los mensajes (`ingresarDni(dni)` → `ingresarDni()`).
16. Un atributo `String` se guarda como `string`, pero un retorno `String` conserva la mayúscula.
17. Tarjeta del proyecto: «1 clases de secuencias».
18. Crear un proyecto crea y abre un diagrama de clases sin preguntar; «Nuevo artefacto» en cambio pide nombre. (Igual que D7.)
19. Selector de tema «Automático — según macOS» y atajos solo con glifos de Mac (a confirmar en Windows: C dice que la ayuda sí convierte a Ctrl).
20. En la tira de pestañas, el nombre del proyecto parece una pestaña pero no hace nada al hacer clic.
21. «Revisar» existe en clases y flujo pero no en casos de uso; fondo de puntos en casos de uso/secuencia y cuadrícula en clases.

**Detalle**
22. El minimapa tapa parte de una clase; los puntos de conexión de las clases miden 5 px.
23. Clases: «Restablecer recorrido y etiqueta» desalineado junto a Navegabilidad; con «Origen hacia destino» no se ve flecha en el lienzo.
24. El popover Revisar (clases) no se cierra con Esc.
25. Casos de uso: la línea actor–caso arranca flotando a la derecha del muñeco; una asociación ofrece «Invertir dirección» aunque no tiene dirección.
26. Flujo: los controles flotantes de fila (+, ↑, ↓, papelera) se cortan en el borde y tapan la columna REF.
27. El popover «N novedades» se corta en el borde derecho de la ventana.
28. Falta favicon (404 en consola, solo en navegador). Advertencia de React Flow por `nodeTypes`/`edgeTypes` recreados (16 veces).

**Lo que más gustó:** las pastillas de multiplicidad sobre la línea; el flujo con teclado (⇧⌘A crea el CA referenciado) y sus avisos; los fragmentos que envuelven lo seleccionado; el modo oscuro.

## Verificación de los hallazgos A–D

Seis verificadores independientes intentaron reproducir cada hallazgo. Las pruebas que reproducen bugs quedaron en `scratch/launch-audit/` (fuera de git; se corren con `npx vitest run --config scratch/launch-audit/vitest.config.ts`) y fallan mientras el bug exista: al arreglar cada uno se pasan a `src/` como prueba de regresión.

- **Confirmados con prueba:** A1, A2, A3, A6, A7, B1, B2, B3, B6, B7, C2, C5, C10, D4, D5, D11.
- **Confirmados leyendo el código (interfaz o nativo):** B4, B5, C1, C3, C4 (= D2), C8, C9, C11, C12, C13, C14, D1, D6, D7.
- **Sin verificar todavía:** A4 (cierre en Windows), A5 (rotación de respaldos en macOS), A8 (error de respaldo oculto), D8–D10, D12.
- **Ninguno resultó falso.**

Agravantes que aparecieron al verificar:
- A1: la interfaz no pone límite, y lo recortado al cargar se guarda encima en el siguiente guardado.
- A3: cualquier guardado posterior pisa el JSON corrupto, no solo crear un proyecto.
- B3: cualquier restauración del historial anterior a un renombre trae nombres viejos (deshacer o rehacer).
- B5: s/r/f/p/e también ignoran modificadores: en modo teclado, ⌘P/⌘F/⌘E/⌘S/⌘R cambian de modo.
- B6: `undefined` significa a la vez «nunca elegí» y «Sin referencia»; mover un flujo también lo vincula solo (`artifactTransfer.ts`). Hace falta un valor explícito de «ninguno».
- C2: los apuntes viajan en el JSON y se reimportan del otro lado.
- C4: el botón Eliminar del inspector tiene el mismo problema que Supr.
- C8: además de contar subfragmentos como mensajes, no cuenta los mensajes de adentro.
- D1: Esc en una confirmación también desactiva el modo teclado (`useFocusTrap` no corta la propagación).

## Decisiones de Alejo (8/10)

- **Windows:** la 2.5.0 sale también con instalador de Windows (hay compañeros que lo usan); los atajos y textos se revisan con Ctrl.
- **Gatekeeper:** sin notarizar. README y notas de la release con el camino real: abrir una vez → Configuración del Sistema → Privacidad y seguridad → **Abrir igualmente**.
- **Apuntes en JSON (C2):** siguen viajando en el JSON; se corrige el texto para aclarar que no salen en PDF ni Word pero sí en los archivos exportados.
- **Retornos (E2):** sin texto por diseño. Solo se evita perder en silencio lo escrito al cambiar a Retorno.
