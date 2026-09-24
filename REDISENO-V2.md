# Modelador de Sistemas 2.0 — registro del rediseño

Rama `rediseno-v2`, creada desde `main` (1fd1d30). Nada de esto llega a `main`
sin aprobación explícita.

> Nota: la etiqueta `v1.0.0` apunta a 6185434, anterior al modo oscuro, al
> arreglo de notas de secuencia, a la propagación de renombres y a la limpieza
> de etiquetas de asociaciones. `main` ya los incluye, y la beta parte de ahí.

## 1. Preparación: la beta convive con la v1

| | v1 (actual) | 2.0 Beta |
|---|---|---|
| Nombre | Modelador de Sistemas | Modelador de Sistemas 2.0 Beta |
| Bundle id | `com.alejocarabelli.disenosistemas` | `com.alejocarabelli.disenosistemas.beta2` |
| Ejecutable | `DisenoDeSistemas` | `ModeladorBeta` |
| Instalación | `/Applications/Modelador de Sistemas.app` | `/Applications/Modelador de Sistemas 2.0 Beta.app` |
| Esquema web (origen del almacenamiento) | `disenosistemas://app` | `modeladorbeta://app` |
| Respaldos | `~/Documents/Modelador de Sistemas/Respaldos` | `~/Documents/Modelador de Sistemas 2.0 Beta/Respaldos` |
| Carpeta de compilación | `/private/tmp/diseno-sistemas-macos-build` | `/private/tmp/modelador-sistemas-v2-beta-build` |

**Por qué la beta no ve tus proyectos:** WebKit guarda el almacenamiento local
por aplicación (bundle id) y, dentro de ella, por origen (esquema). La beta
cambia las dos cosas. Las claves y el formato del almacenamiento son los mismos
que en la v1, así que un JSON exportado de una se importa en la otra.

**El script nunca toca la v1:** solo borra y reemplaza
`/Applications/Modelador de Sistemas 2.0 Beta.app`. Con `SKIP_INSTALL=1`
compila sin instalar.

**Etiqueta Beta:** el nombre de la ventana y el menú dicen "2.0 Beta", y la
barra lateral muestra una etiqueta "Beta" junto al nombre.

**Compilación en GitHub:** `.github/workflows/beta-macos.yml` compila en un Mac
de GitHub Actions en cada push a `rediseno-v2` (el `.dmg` y el `.zip` quedan como
artefacto de la ejecución). Al subir una etiqueta `v2.*-beta.*` además los
publica como pre-release.

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
