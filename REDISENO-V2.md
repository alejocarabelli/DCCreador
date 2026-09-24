# Modelador de Sistemas 2.0 — registro del rediseño

Rama `rediseno-v2`, creada desde `main` (1fd1d30). Nada de esto llega a `main`
sin aprobación explícita.

> Nota: la etiqueta `v1.0.0` apunta a 6185434, anterior al modo oscuro, al
> arreglo de notas de secuencia, a la propagación de renombres y a la limpieza
> de etiquetas de asociaciones. `main` ya los incluye, y la 2.0 parte de ahí.

## 1. Preparación: la 2.0 convive con la v1

| | v1 (actual) | 2.0 |
|---|---|---|
| Nombre | Modelador de Sistemas | Modelador de Sistemas 2.0 |
| Bundle id | `com.alejocarabelli.disenosistemas` | `com.alejocarabelli.disenosistemas.v2` |
| Ejecutable | `DisenoDeSistemas` | `ModeladorV2` |
| Instalación | `/Applications/Modelador de Sistemas.app` | `/Applications/Modelador de Sistemas 2.0.app` |
| Esquema web (origen del almacenamiento) | `disenosistemas://app` | `modeladorv2://app` |
| Respaldos | `~/Documents/Modelador de Sistemas/Respaldos` | `~/Documents/Modelador de Sistemas 2.0/Respaldos` |
| Carpeta de compilación | `/private/tmp/diseno-sistemas-macos-build` | `/private/tmp/modelador-sistemas-v2-build` |

**Por qué la 2.0 no ve tus proyectos:** WebKit guarda el almacenamiento local
por aplicación (bundle id) y, dentro de ella, por origen (esquema). La 2.0
cambia las dos cosas. Las claves y el formato del almacenamiento son los mismos
que en la v1, así que un JSON exportado de una se importa en la otra.

**El script nunca toca la v1:** solo borra y reemplaza
`/Applications/Modelador de Sistemas 2.0.app`. Con `SKIP_INSTALL=1`
compila sin instalar.

**Sin etiqueta Beta:** a pedido, la 2.0 se trabaja como producto final. El
nombre visible es "Modelador de Sistemas 2.0" (app, ventana, menú, respaldos) y
la interfaz no muestra ninguna etiqueta de versión preliminar.

**Compilación en GitHub:** `.github/workflows/macos-v2.yml` compila en un Mac
de GitHub Actions en cada push a `rediseno-v2` (el `.dmg` y el `.zip` quedan como
artefacto de la ejecución). Al subir una etiqueta `v2.*` además los publica en
una release (pre-release si la etiqueta lleva sufijo, como `v2.0.0-rc.1`).

## 2. Diagnóstico de la v1

Recorrido completo en el navegador (capturas en `docs/rediseno-v2/v1-*.png`) y
en el código. Lo que encontré:

**Cada editor arma su barra a su manera.** La acción principal es un botón en
clases ("Crear clase") y secuencia ("Mensaje"), un menú en casos de uso
("Agregar elemento") y no existe en el flujo. "Revisar" es un botón resaltado
en clases, un icono con texto en secuencia, una acción secundaria en el flujo y
no está en casos de uso. El menú de vista se llama "Vista" en tres editores y
"Opciones de vista y referencias" en secuencia, donde además mezcla vista con
referencias a otros artefactos.

**Controles duplicados:**
- Zoom y encuadre en la barra ("Centrar vista", "Ver todo") y otra vez en el
  lienzo ("Acercar", "Alejar", "Ajustar a la vista"). "Ver todo" y "Ajustar a
  la vista" hacen lo mismo.
- Secuencia: "Insertar mensaje" en la barra y un "+" con la misma acción en el
  panel de estructura. "Ocultar panel de estructura" en la barra y "Ocultar
  estructura" en el propio panel.
- "Exportar JSON" e "Importar JSON" en el menú Archivo de los cinco editores,
  aunque exportan e importan el **proyecto entero**, no el diagrama. Importar
  también está en el inicio.
- Clases de secuencias: una segunda fila de barra con cuatro controles de
  sincronización (contador, fuente del modelo, importar, actualizar vínculos,
  abrir secuencia) debajo de la barra normal.

**Tipografía sin escala.** En la misma tarjeta o diálogo conviven 11, 13 y 17 px
(los botones heredan 16-17 px, las etiquetas usan 11 px). El nombre de la app
ocupa tres líneas en la barra lateral.

**Detalles:** el minimapa se muestra como un recuadro vacío en un diagrama sin
elementos; "Desplegar" aparece deshabilitado todo el tiempo en el flujo; los
atajos del flujo viven en un menú propio y los de secuencia solo se descubren
por el título de un botón.

**Lo que funciona y se conserva:** el lienzo y el render UML, el inspector
contextual, los estados vacíos con acción directa, el modo teclado de
secuencia, la revisión semántica, los respaldos y el modo oscuro.

### Decisiones

1. **Una sola barra de editor, con zonas fijas** en los cinco editores:
   `Proyecto › Artefacto · estado de guardado` · `Deshacer Rehacer` ·
   `acción principal + herramientas de inserción` · `Revisar` · `Vista ▾` ·
   `Exportar ▾`. Mismo componente, mismo orden, mismos iconos.
2. **"Archivo" pasa a llamarse "Exportar"** y solo contiene los formatos del
   artefacto (PNG, PDF, Word). Exportar/Importar proyecto van al menú del
   proyecto y al inicio.
3. **Zoom y encuadre solo en el lienzo**, con el mismo control flotante en
   clases, casos de uso, clases de secuencias y secuencia.
4. **"Vista" reúne todo lo que cambia cómo se ve** (grilla, minimapa, atributos,
   activaciones, numeración, plegar pasos). Las referencias de secuencia se
   separan en su propia sección.
5. **Un solo panel de atajos** para toda la app (tecla `?` o botón en la barra
   lateral) en lugar del menú "Atajos" del flujo.
6. **Clases de secuencias integra la sincronización en un menú** "Sincronizar"
   dentro de la barra única.
7. **Escala tipográfica cerrada** y tipografías empaquetadas en la app.

## 3. Dirección visual

Exploré tres direcciones sobre la misma pantalla real (modelo de dominio del
proyecto de ejemplo, con una clase seleccionada y el inspector abierto):

| | |
|---|---|
| **A · Grafito** — monocroma, Geist, acento índigo, botón principal negro. | ![A](docs/rediseno-v2/direccion-a.png) |
| **B · Cuaderno técnico** — papel, tinta y petróleo; IBM Plex Sans y Plex Mono. | ![B](docs/rediseno-v2/direccion-b.png) |
| **C · Nativo macOS** — barra lateral traslúcida, azul del sistema, radios grandes. | ![C](docs/rediseno-v2/direccion-c.png) |

**Elegida: B, Cuaderno técnico**, con la limpieza de chrome de A.

- **Es la única con identidad propia.** A y C se ven bien pero podrían ser
  cualquier herramienta. B se parece a lo que la app produce: UML en papel.
- **Las clases con borde de tinta se leen como UML impreso**, y así se ven igual
  en pantalla y en el PDF que se entrega.
- **Plex Mono alinea atributos y métodos**: `+ fechaRecepcion : Date` se lee como
  código, que es lo que es.
- **El petróleo es calmo para sesiones largas** y no compite con los colores de
  grupo de las clases ni con los de los participantes de secuencia.
- **Tiene un modo oscuro natural**: pizarra con tinta clara, no un gris
  invertido.

Plex Sans y Plex Mono se empaquetan con la app (funciona sin conexión), así que
se ven igual en todas las Mac y en las exportaciones.

## 4. Sistema

Definido en `DESIGN.md` (tokens, componentes y contratos). Los componentes
compartidos viven en `src/components/ui/` y sus estilos en `src/design/`.

## 5. Cambios por pantalla

Cada fila dice dónde estaba el control en la v1, qué pasó y por qué.

### 5.1 Inicio y barra lateral

| Control (v1) | Dónde estaba | Ahora | Por qué |
|---|---|---|---|
| Barra lateral | Oculta en el inicio | Siempre visible, también en el inicio, con "Inicio" como primer ítem | La app se siente una sola: se navega igual desde cualquier pantalla |
| Contraer/expandir barra lateral | Botón en el encabezado de la barra | Botón en el pie de la barra + atajo **⌘\\** (nuevo) | El encabezado queda para el nombre, que ahora entra en una línea |
| Ir al inicio (icono casa) | Encabezado de la barra | Ítem "Inicio" arriba de la lista de proyectos | Es navegación, no una herramienta |
| Crear proyecto (+) | Encabezado de la barra | "+" junto al título "Proyectos" | Queda al lado de lo que crea |
| Contraer al abrir un artefacto | Automático | Se respeta lo que elegiste | La barra es la navegación entre artefactos; esconderla sola obligaba a volver a abrirla |
| "+ Nuevo" artefacto | Encabezado de la lista de artefactos | Última fila de la lista: "+ Nuevo artefacto" | Se lee en el lugar donde aparecerá el nuevo |
| Menú de proyecto | Renombrar, Eliminar | Renombrar…, **Exportar proyecto (JSON)**, separador, Eliminar proyecto… | Exportar el proyecto sale de los editores (ver 5.2–5.6) y llega a su lugar |
| Selector de tema | Pie de la barra y encabezado del inicio | Solo en el pie de la barra | Estaba duplicado |
| Atajos de teclado | Menú "Atajos" solo en el flujo | Panel único para toda la app: botón en el pie de la barra y tecla **?** (nueva) | Todos los atajos en un lugar, descubribles desde cualquier pantalla |
| Contador, búsqueda, Importar, Nuevo proyecto (inicio) | Encabezado del inicio | Igual, en una sola fila; la búsqueda también encuentra artefactos por nombre | — |
| "Ordenados por última edición" | Texto en el inicio | Quitado; el orden se anuncia al lector de pantalla en la lista | Era un rótulo sin acción |
| Lista de proyectos | Filas | Tarjetas tipo cuaderno con iniciales, tipos de artefacto y fecha | Más fácil de reconocer de un vistazo |
| Inicio sin proyectos | "Todavía no hay proyectos" + botón | Bienvenida con Nuevo proyecto, Importar proyecto… y los cinco tipos de artefacto | Es la primera pantalla que ve alguien nuevo |
| Resumen del proyecto | "1 clase" para un diagrama de clases | "1 diagrama de clases" | Era un error de texto |
| Iconos de tipo de artefacto | Distintos en inicio y barra lateral | Un solo juego para toda la app | Coherencia |

### 5.2 Diagrama de clases

| Control (v1) | Dónde estaba | Ahora | Por qué |
|---|---|---|---|
| Barra de herramientas | Propia del editor | `EditorToolbar` compartida: migas · guardado · deshacer/rehacer · **Clase** · Organizar · Revisar · Vista · Exportar | Mismo orden y mismos controles en todos los editores |
| "Crear clase" | Botón principal | Botón principal "**Clase**" (el título dice "Crear clase (o doble clic en el lienzo)") | La etiqueta corta entra siempre; el verbo lo da el botón |
| Centrar vista | Icono en la barra | **Quitado** | "Ajustar a la vista" hace lo mismo y además encuadra; tener los dos confundía |
| Ver todo | Icono en la barra | Quitado de la barra; es "Ajustar a la vista" (⤢) en el control de zoom del lienzo | Era un duplicado exacto |
| Acercar, alejar, ajustar | Columna de botones en el lienzo | Control de zoom compartido abajo a la izquierda: − **porcentaje** + · ⤢. Clic en el porcentaje vuelve al 100 % (nuevo) | Mismo control en todos los lienzos; ahora se ve el zoom actual |
| Organizar | Menú de texto | Menú con icono; los ítems de alinear/distribuir tienen iconos y se habilitan según la selección, con un rótulo que dice qué hace falta | Se entiende por qué un ítem está deshabilitado |
| Ayuda "Mayús + arrastrar…" | Texto dentro de Organizar | Panel de atajos (tecla ?) | Los atajos viven en un solo lugar |
| Vista → mostrar/ocultar atributos, métodos, colores de grupo | Botones que cambiaban de texto ("Ocultar…/Mostrar…") | Casillas con tilde (Atributos, Métodos, Colores de grupo) | Se ve el estado sin leer el verbo |
| Vista → grilla, ajustar a la grilla, minimapa | Botones con icono | Casillas con tilde en la sección "Lienzo" | Igual que arriba |
| Archivo → Exportar PNG / PDF | Menú "Archivo" | Menú "**Exportar**": Imagen PNG, Documento PDF | El menú solo exporta el diagrama |
| Archivo → Exportar JSON / Importar JSON | Menú "Archivo" | Menú del proyecto en la barra lateral (Exportar proyecto) e inicio (Importar) | Exportaban e importaban el proyecto entero, no este diagrama |
| Tipo de atributo (inspector) | Select con opción "custom" que abría un segundo campo | Un campo con sugerencias (`int`, `string`, `date`…) donde también se escribe cualquier tipo | Misma capacidad, un solo control, sin la palabra en inglés |
| Atributos y métodos (inspector) | Campos apilados | Filas tipo código: `⠿ nombre : tipo 🗑` y `+ nombre 🗑 / ( parámetros ) : retorno` | Se leen como la clase del lienzo |
| Miembros en las clases del lienzo | Plex Sans | Plex Mono | Nombres, `:` y tipos quedan en columnas; se lee como código |

### 5.3 Diagrama de secuencia

| Control (v1) | Dónde estaba | Ahora | Por qué |
|---|---|---|---|
| Barra de herramientas | Propia, con grupos y reglas de ancho especiales | `EditorToolbar` compartida: **Mensaje** · Participante · Fragmento ▾ · Nota · Plantillas · Modo teclado · Revisar · Vista · Exportar | Misma forma que los otros editores |
| Plantillas educativas | Menú "Archivo" | Botón "Plantillas" en la zona de agregar | Cargar una plantilla es agregar contenido, no un archivo |
| Fragmento ▾ | Lista "alt · caminos alternativos" | Mismo contenido; el operador en mono y color de acento, alineado | Se leen como las palabras clave de UML que son |
| Modo teclado | Botón "Teclado" con tecla `M` visible | Botón con icono en la zona de agregar; el atajo `M` está en el título y en el panel de atajos | Menos texto en la barra; el atajo sigue a la vista |
| Ocultar/mostrar estructura | Icono en la barra **y** botón en el panel | Casilla "Estructura" en Vista ▸ Paneles y el botón del propio panel | Era un duplicado |
| "+" Agregar mensaje en el panel de estructura | Encabezado del panel | **Quitado** | Duplicaba "Mensaje" de la barra, que también inserta después del elemento seleccionado (además se crean mensajes arrastrando de una línea de vida a otra y con el modo teclado) |
| Opciones de vista y referencias | Menú "Vista" con casillas y selects mezclados | Vista ▾ con secciones: Paneles (Estructura), Diagrama (Activaciones, Colores de participantes, Numeración) y Referencias (Diagrama de clases, Flujo de sucesos) | Cada cosa en su sección; las referencias quedan separadas de lo visual |
| Colores de participantes | Select Automáticos/Desactivados | Casilla | Solo tenía dos estados |
| Numeración | Select "Correlativa / Jerárquica / Sin números" | Igual, con ejemplo: "Correlativa (1, 2, 3)", "Jerárquica (1, 1.1, 1.2)" | Se entiende sin probar |
| Exportar PNG o PDF… | Menú "Archivo" | Menú "Exportar" | Igual que en los otros editores |
| Exportar/Importar JSON | Menú "Archivo" | Proyecto (barra lateral) e inicio | Eran acciones del proyecto |
| Zoom | Barra propia abajo (− 100% + enfocar) | Control de zoom compartido, mismo lugar y mismos nombres que en los otros lienzos | Coherencia |
| Barra de selección múltiple | Flotando dentro de la barra | Franja contextual debajo de la barra, en color de selección | Aparece donde se lee y no desordena la barra |

### 5.4 Flujo de sucesos

| Control (v1) | Dónde estaba | Ahora | Por qué |
|---|---|---|---|
| Barra de herramientas | Propia, sin acción principal | `EditorToolbar`: **Camino alternativo** · Revisar · Vista · Exportar | Misma forma que el resto; la acción de documento más frecuente queda a la vista aunque se haya bajado por la página |
| "Agregar camino" | Encabezado de "Caminos alternativos" | Botón principal de la barra; si no hay caminos, también en el estado vacío de la sección | Evita el duplicado y el estado vacío dice qué hacer |
| "Agregar fila" / "Agregar primera fila" | Debajo de cada tabla | Igual | Agrega a esa tabla en particular (camino básico o un alternativo) |
| Plegar pasos largos / Desplegar | Dos botones en la barra; "Desplegar" siempre visible aunque no hubiera nada plegado | Menú Vista: "Plegar pasos largos", "Desplegar todos los pasos" (se habilita cuando hay algo plegado) | Cambian cómo se ve el documento; no son acciones frecuentes |
| Atajos | Menú "Atajos" propio | Panel de atajos de toda la app (tecla ? o barra lateral), sección "Flujo de sucesos" | Todos los atajos en un lugar |
| Revisar el flujo | Botón secundario | `ReviewButton`, igual que en los otros editores | Coherencia |
| Archivo → Exportar PDF / Word | Menú "Archivo" | Menú Exportar: Documento PDF, Documento Word (.docx). Mismos exportadores, mismo formato de tablas | Solo exporta este documento |
| Archivo → Exportar/Importar JSON | Menú "Archivo" | Proyecto (barra lateral) e inicio | Eran acciones del proyecto |
| Encabezados de tabla | Texto pequeño | Mono en mayúsculas, como los rótulos del resto de la app | Coherencia |

### 5.5 Modelo de casos de uso

| Control (v1) | Dónde estaba | Ahora | Por qué |
|---|---|---|---|
| Agregar elemento ▾ (Actor, Caso de uso, Límite del sistema) | Menú principal | Tres botones directos: **Caso de uso** (principal), Actor, Límite del sistema (icono) | Son tres acciones frecuentes; un menú agregaba un clic a cada una |
| Centrar vista, Ver todo | Iconos en la barra | Quitados de la barra; control de zoom del lienzo | Igual que en clases |
| Vista → Grilla, Ajustar a la grilla | Botones | Casillas con tilde | Se ve el estado |
| Minimapa | Siempre visible, también vacío | Casilla "Minimapa" en Vista (nueva; comparte la preferencia con clases) y solo aparece si hay elementos | El recuadro vacío no aportaba nada |
| Archivo → PNG / PDF | Menú "Archivo" | Menú Exportar: Imagen PNG, Documento PDF | Igual que en clases |
| Archivo → Exportar/Importar JSON | Menú "Archivo" | Proyecto (barra lateral) e inicio | Eran acciones del proyecto |

### 5.6 Clases de secuencias

Usa el mismo editor que el diagrama de clases (5.2), más lo propio:

| Control (v1) | Dónde estaba | Ahora | Por qué |
|---|---|---|---|
| Segunda fila de barra (contador, fuente del modelo, Importar ▾, Actualizar vínculos, Abrir secuencia) | Debajo de la barra normal | Un menú **Sincronizar** en la zona de agregar, con el número de secuencias vinculadas en el botón | Una fila de barra menos; todo lo de sincronizar en un lugar |
| "N secuencias vinculadas · Modelo compartido · …" | Texto en la segunda fila | Primera línea del menú Sincronizar y contador en el botón | Sigue a la vista sin ocupar una fila |
| Importar desde secuencia ▾ | Menú en la segunda fila | Sección "Importar clases y métodos": "Desde «Secuencia…»" y "Desde todas las secuencias (N)" | Mismo comportamiento |
| Actualizar vínculos | Botón | "Vincular todas las secuencias" dentro de Sincronizar | El nombre dice lo que hace: vincula todas las secuencias del proyecto |
| Abrir secuencia | Botón que abría solo la primera vinculada | Sección "Abrir secuencia vinculada" con **todas** las vinculadas | Antes no se podía llegar a la segunda o tercera desde acá |
| Resultado de la importación | Texto al lado de los botones | Aviso (toast) como el resto de los mensajes del editor | Coherencia |

### 5.7 Diálogos y exportaciones

| Control (v1) | Dónde estaba | Ahora | Por qué |
|---|---|---|---|
| Diálogos (crear/renombrar, confirmar, exportar secuencia, plantillas) | Estilos propios de cada uno | Tarjeta de papel con sombra de diálogo, título de 15 px y botón principal a la derecha; se abren con una animación corta | Todos iguales |
| Menús de la barra lateral y menú contextual del lienzo | Botones sueltos | Mismo panel y mismos ítems que los menús de la barra (icono, texto, acción peligrosa en rojo) | Coherencia |
| Panel de revisión de secuencia | Se agregaba como cuarta columna de la grilla y quedaba **fuera de la pantalla** (no se veía al tocar Revisar) | Tarjeta flotante arriba a la derecha del lienzo, como en clases | Era un error: el botón no mostraba nada |
| Botón de cerrar de los paneles de revisión | "×" de texto en un recuadro | Botón de herramienta con icono, igual que el resto | Coherencia |
| Franja de selección de secuencia | Aparecía con **un** elemento seleccionado | Aparece con dos o más | Con uno, el inspector ya ofrece envolver, mover y ubicar; la franja duplicaba |
| Botón de invertir origen/destino (nuevo mensaje) | Posición fija que tapaba el rótulo "Origen" con la tipografía nueva | Alineado con la primera fila de campos | Se superponía |

**Exportaciones verificadas** desde el modo oscuro (salen siempre en el tema claro): clases PNG y PDF, casos de uso PNG y PDF, flujo PDF y Word (3 tablas, 17 filas, mismo formato), secuencia PNG y PDF paginado. Ninguna pierde contenido; ahora usan Plex y la paleta Cuaderno.

### 5.8 Paneles y desplegables

Había tres inspectores distintos: el de clases con un botón de plegar suelto arriba a la izquierda, el de casos de uso sin forma de plegarse, y el de secuencia con una barra propia que solo decía "Propiedades" y repetía el nombre más abajo con una etiqueta de color. Ahora los tres son el mismo componente (`InspectorPanel`, en `src/components/ui/Panel.tsx`).

| Control (v1) | Dónde estaba | Ahora | Por qué |
|---|---|---|---|
| Encabezado del inspector | Tres formas: "Propiedades / nombre / Clase" (clases), "Propiedades / Relación" (casos de uso), barra "Propiedades" + insignia en mayúsculas (secuencia) | Una fila fija arriba del panel: **plegar · qué es · nombre · eliminar**. El tipo lleva un punto de color (clase y participante en petróleo, retorno neutro, asíncrono azul, creación verde, destrucción roja, fragmento violeta, nota ámbar) | El mismo lugar para lo mismo en todos los editores; el encabezado no se va con el scroll |
| Botón de plegar el inspector | Clases: arriba a la izquierda sobre el contenido. Secuencia: en su barra. Casos de uso: **no existía** | Siempre el primer botón del encabezado; plegado queda un riel de 44 px en todos los editores (antes 48 o 52 px según el editor) | Casos de uso ganó la opción; clases y casos de uso comparten la preferencia |
| Eliminar desde el inspector | Solo en secuencia (papelera en la insignia) | Papelera en el encabezado de los tres inspectores (clase, relación, actor, caso de uso, participante, mensaje, fragmento, nota) | Antes en clases y casos de uso solo se podía borrar con ⌫ o el menú contextual |
| Título de una relación de clases | "Relación" | El tipo ("Asociación", "Composición"…) como rótulo y los extremos como título: "Tramite — TipoTramite" | Se sabe qué relación se está editando |
| Inspector de casos de uso con nodo y relación seleccionados | Mostraba las dos secciones apiladas | Muestra la relación, que es lo que borra ⌫ | El panel y el atajo apuntan a lo mismo |
| "Invertir dirección" (casos de uso) | Botón de texto sin estilo | Botón secundario a lo ancho | Coherencia |
| Rótulos del inspector de secuencia ("FIRMA DEL MENSAJE", "TIPO", "UBICACIÓN…", "ENVOLVER…", "RUTA") | Mayúsculas pequeñas con estilos escritos a mano en cada elemento | Rótulos en tipo oración como los de clases ("Firma del mensaje", "Tipo"); "Ruta" es un título de sección como "Atributos" | Un solo lenguaje de rótulos |
| Secciones plegables (Opciones técnicas, Activaciones manuales, Opciones avanzadas…) | Triángulo "▶" de texto; en una el título quedaba empujado a la derecha | Chevron fino, título a la izquierda, fila con estado hover y foco visible, separador arriba | Iguales en todo el inspector; `PanelSection` queda para las secciones nuevas |
| Casilla "Terminar línea de vida con cruz" | Se estiraba hasta ~35 px | 16 px con el color de acento | Error visual |
| Selects nativos (todos los paneles y menús) | Flecha del sistema, gruesa y negra también en modo oscuro | Siguen siendo selects nativos (teclado, VoiceOver y menú de macOS intactos) con un chevron fino en el gris del tema, claro y oscuro | En Pizarra la flecha negra casi no se veía |
| Panel de estructura (secuencia) | — | Sin cambios de lugar: sigue a la izquierda del lienzo, con el mismo botón de plegar que ya tenía | Ya compartía la lógica de la barra lateral; moverlo no aportaba |
| Paneles de revisión | Clases y secuencia flotando sobre el lienzo; flujo acoplado al documento | Se mantiene | En el flujo la revisión señala renglones del documento y necesita estar al lado; en los lienzos flotar no le quita espacio al diagrama |

No se quitó ninguna función: todo lo que hacían los encabezados viejos (plegar, eliminar, ver el tipo y el nombre) sigue en el encabezado nuevo, y ahora también en los editores que no lo tenían.

## 6. Verificación

| Qué | Cómo | Resultado |
|---|---|---|
| Compatibilidad v2 → v1 | La v2 importa el proyecto de demostración (los 5 tipos de artefacto) y lo exporta desde la barra lateral; la v1 de `main`, corriendo aparte, importa ese archivo | La v1 guarda exactamente el mismo proyecto (nombre, artefactos y contenido idénticos) |
| Compatibilidad v1 → v2 | La v1 lo exporta desde su menú Archivo → Exportar JSON; una v2 limpia lo importa | Idéntico al original. El archivo que exporta la v1 es igual al que exporta la v2 |
| Formato | `normalizeDiagramProject`, los tipos, el importador y el almacenamiento no cambiaron respecto de `main`; `projectFile.test.ts` fija que `serializeProject` escribe lo mismo que escribía la v1 y que el ida y vuelta es estable | 5 pruebas nuevas |
| Accesibilidad: nombres | Recorrido automático de inicio y los 5 editores buscando botones, menús, campos y selects visibles sin nombre accesible | 0 en todas las pantallas |
| Accesibilidad: foco | 30 paradas de Tab en el editor de clases | Todas con anillo de foco visible |
| Contraste | `themes.test.ts` (claro y oscuro) | Pasa |
| Ventana angosta (900 px) | Capturas de las 6 pantallas en claro y oscuro | Encontré dos fallas y las corregí (abajo) |
| Exportaciones | Ver 5.7 | Completas, siempre en tema claro |
| Recorrido desde cero | Proyecto nuevo, un artefacto de cada tipo desde "Nuevo artefacto", la acción principal de cada uno y su primera exportación | Los 5 se crean y exportan (PNG, PDF) sin errores en la página |

**Arreglos de esta ronda**

| Problema | Arreglo |
|---|---|
| A 900 px la barra de secuencia se desbordaba: "Vista" quedaba cortada y "Exportar" fuera de la pantalla. El contrato de DESIGN.md decía que las etiquetas se pliegan, pero no estaba implementado | La fila de la barra es un contenedor: bajo 1040 px las herramientas secundarias y la zona final quedan solo con icono y el proyecto sale de la ruta; bajo 720 px también la acción principal. Todos los botones conservan su nombre en `aria-label` y en el tooltip |
| El inspector crecía hasta el 38 % de la ventana y dejaba el lienzo de clases en ~300 px, con el minimapa tapando el zoom | Bajo 1100 px el inspector mide 280 px y el minimapa se oculta (sigue en Vista para ventanas anchas) |
| Nombres de atributos y métodos cortados en el inspector angosto | Filas de miembros un punto más chicas y el nombre con más ancho que el tipo |
| En un diagrama de clases vacío, la primera clase abría con zoom al 200 % | El ajuste automático no pasa del 100 % (y el botón Ajustar, del 150 %) |

## 7. Después de la primera prueba en el Mac

| Qué se reportó | Qué pasaba | Arreglo |
|---|---|---|
| "No puedo crear un actor en secuencia" | Se podía, pero solo en Inspector → Opciones técnicas → Tipo interno (igual que en la v1) | El actor aparece donde se usa, sin un botón fijo en la barra (se crea una vez por diagrama): la tarjeta de inicio de una secuencia vacía ofrece **Agregar actor** primero; el cuadro de "Participante" tiene **Actor · Objeto** y arranca en Actor mientras el diagrama no tenga uno; el inspector muestra **Objeto · Actor** arriba para convertir un participante. Límite/Control/Entidad siguen en Opciones técnicas |
| (encontrado al revisarlo) Renombrar un actor mostraba "Actor" | El campo del inspector interpretaba el texto como `instancia:Clase` y lo guardaba como clase; el actor muestra su nombre | Para un actor el campo es "Nombre del actor" y edita el nombre |
| "Doble clic crea una clase" no funcionaba | Nunca estuvo programado (tampoco en la v1); el doble clic hacía zoom | Doble clic en el lienzo vacío crea una clase (clases, clases de secuencias) o un caso de uso donde se hizo clic. El doble clic ya no hace zoom |
| (encontrado al revisarlo) La primera clase de un diagrama vacío aparecía lejos del clic y medio tapada por el inspector | React Flow reencuadraba la vista al aparecer el primer nodo | Solo se encuadra un diagrama que se abre con contenido |
| El cartel del modo teclado se cortaba en el borde | Se centraba sobre el participante sin mirar el borde visible | Se corre para quedar dentro del lienzo y la flechita sigue apuntando al participante |
| "El botón de plegar la barra lateral está abajo y cuando se cierra sube arriba" | Abierta, el botón estaba en el pie; plegada, arriba. El riel plegado solo tenía Inicio | El botón está **siempre arriba a la izquierda, en el mismo píxel** abierta o plegada (como el de plegar del inspector, en el encabezado del panel). El riel plegado muestra Inicio y los artefactos del proyecto abierto como íconos (con su nombre al pasar el mouse) y "+ Nuevo artefacto": se cambia de diagrama sin desplegarla. ⌘\ sigue funcionando |
| El botón de tema "cambiaba solo" | Cada clic pasaba a la opción siguiente (automático → claro → oscuro) sin mostrar cuál venía | **Apariencia** es un menú como los demás: se abre hacia arriba desde el pie, con Automático (según macOS), Claro y Oscuro, y una tilde en el actual |
| "¿Puedo pasar todos mis proyectos de la app vieja?" | Solo se importaba un proyecto por archivo | **Importar…** acepta el respaldo automático de la v1 (`Documentos › Modelador de Sistemas › Respaldos › respaldo-….json`, que guarda todos los proyectos) y varios archivos a la vez. Los proyectos que ya están se saltean, así que importar el mismo respaldo dos veces no duplica nada. Un proyecto exportado suelto se importa como siempre. La pantalla de inicio vacía lo explica |

### 7.1 Modelo de casos de uso, pulido de punta a punta

"Funcionan raro, en especial conectar el actor con sus casos de uso."

| Qué | Antes | Ahora | Por qué |
|---|---|---|---|
| Conectar | Había que acertarle a uno de 4 puntos de 6 px casi invisibles (20 % de opacidad al pasar el mouse) | Al pasar el mouse (o con el nodo seleccionado) aparece un círculo **→** claro; se arrastra y se suelta **en cualquier parte** del otro nodo | Era la queja principal: el punto de enganche no se veía y era diminuto |
| Mientras se arrastra | Sin indicación | Los destinos posibles se resaltan en petróleo y los imposibles se atenúan (el mismo nodo, uno ya relacionado, el límite del sistema) | Se ve antes de soltar si va a funcionar |
| Soltar donde no se puede | No pasaba nada | Un aviso dice por qué: "Esos dos ya están relacionados", "El límite del sistema no se relaciona: poné los casos de uso adentro" | Antes parecía que la app no respondía |
| Relaciones duplicadas | Se podía unir dos veces el mismo par | No se permite | Un modelo no tiene dos asociaciones iguales |
| Dirección de la asociación | Dependía de desde dónde se arrastraba | Siempre del actor al caso de uso, se arrastre desde donde se arrastre | Coherencia al exportar e invertir |
| Líneas | Salían de un punto fijo por lado: varias líneas de un actor salían del mismo píxel y se cruzaban | Van de centro a centro y se cortan en el contorno (el óvalo, o la figura del actor sin su nombre): se abren en abanico y siguen al mover | Así se dibujan en papel |
| Relación recién creada | Quedaba sin seleccionar | Queda seleccionada y el panel la muestra (ahí se pasa de «include» a «extend») | El siguiente paso natural está a la vista |
| Tipo de relación entre casos de uso | Select | **«include» · «extend» · Generalización** a la vista, con una línea que explica cada uno, y los nombres de los dos extremos arriba | Se elige sin abrir un desplegable y se entiende la diferencia |
| Conectar sin arrastrar | No existía | El panel del actor lista todos los casos de uso con una casilla ("Casos de uso en los que participa"); el de un caso de uso lista los actores y sus relaciones «include»/«extend» (clic para seleccionarlas) | La forma más directa de decir "este actor participa en estos casos" |
| Mover el límite del sistema | Se movía solo el rectángulo y los casos de uso quedaban afuera | Arrastra lo que tiene adentro | Como en papel |
| Nombre de un caso de uso nuevo | Lo que se escribía justo después de crearlo se perdía (el campo no tomaba el foco; pasaba también en la v1) | El campo toma el foco y se escribe directamente | Error |
| Clic en un nodo con una relación seleccionada | A veces no seleccionaba nada: el cambio de la relación pisaba el del nodo | Selecciona el nodo | Error |
| Selección | Sin marca visible en óvalos y actores | Anillo petróleo como en las clases | Coherencia |
| Rótulos «include»/«extend» | La línea punteada los atravesaba | Llevan fondo del lienzo y tipografía mono | Legibles |
| Óvalos en modo oscuro | Tenían un brillo blanco a la izquierda | Planos, del color de las clases; el límite del sistema con un fondo sutil | Se veía como una mancha |
| Avisos del editor | Arriba a la derecha, tapando el encabezado del inspector (todos los editores) | Abajo al centro, como dice DESIGN.md | Tapaban el panel |

Compatibilidad: los archivos no cambian. Las relaciones nuevas guardan el lado que mira al otro nodo (derecha, izquierda…) para que la versión anterior las siga dibujando bien.

## La 2.0 reemplaza a la v1

- La app instalada es una sola: `/Applications/Modelador de Sistemas.app`, con
  nombre "Modelador de Sistemas" (sin "2.0") y un ícono nuevo al estilo
  Cuaderno técnico (`macos/CreateIcon.m`).
- El bundle id (`com.alejocarabelli.disenosistemas.v2`) y el esquema
  (`modeladorv2://`) no cambian: ahí están guardados los proyectos.
- Los respaldos van a `~/Documents/Modelador de Sistemas/Respaldos`; el último
  respaldo de la v1 queda ahí como `v1-ultimo-respaldo-2026-09-23.json`.
- La v1 queda en la rama `version-1` y en la release `v1.1.0`.
