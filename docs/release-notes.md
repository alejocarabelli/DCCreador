Modelador de Sistemas para la materia Diseño de Sistemas: casos de uso, flujos de sucesos, diagramas de secuencia, clases de secuencias y diagramas de clases en un mismo proyecto, listos para entregar en PDF, imagen o Word. Funciona sin internet.

## Cómo instalarla

Más abajo, en **Assets**, bajá el archivo de tu sistema.

### Mac

1. Bajá el `.dmg` (el `.zip` es lo mismo; usá el `.dmg`).
2. Abrilo y arrastrá **Modelador de Sistemas** a la carpeta **Aplicaciones**.
3. Abrila desde Aplicaciones. La primera vez macOS la bloquea porque no está firmada por Apple: cerrá el aviso.
4. Andá a **Configuración del Sistema → Privacidad y seguridad**, bajá hasta el aviso de Modelador de Sistemas y tocá **Abrir igualmente**. Confirmá con tu contraseña.

Solo hace falta una vez. Si una versión nueva vuelve a bloquearse, repetí el paso 4.

### Windows

1. Bajá el `.exe` y ejecutalo.
2. Si aparece **«Windows protegió su PC»**, tocá **Más información** y después **Ejecutar de todas formas**.

Se instala solo para tu usuario, sin pedir permisos de administrador.

### Si ya la tenías

Instalá la versión nueva encima de la anterior: tus proyectos se conservan. Desde esta versión, la app te avisa cuando hay una nueva (si tenés internet) y muestra su número abajo en la barra lateral y en la ayuda (tecla **?**).

## Novedades de la 2.5.0

### Para empezar

- La pantalla de inicio te da la bienvenida y ofrece **Explorar un ejemplo**: un proyecto completo (Gestión de Trámites) con los cinco artefactos, para ver cómo se relacionan.
- Al crear un proyecto elegís con qué artefacto empezar, en lugar de que se abra siempre un diagrama de clases.
- Cada pantalla vacía te dice por dónde empezar, y el botón destacado de la barra coincide con lo que te pide.
- Los elementos nuevos aparecen a la vista, lejos del borde y sin taparse entre sí.

### Tus datos, más seguros

- Los apuntes largos ya no se recortan sin aviso, y lo que escribiste justo antes de cerrar se guarda.
- Si un archivo guardado viene dañado, la app no lo pisa: lo conserva y te avisa.
- Los respaldos automáticos tienen nombres legibles, no se pisan entre sí y no se pierde el último que tenía algo que borraste.
- Un error en un diagrama ya no deja toda la app en blanco: podés volver al proyecto.

### Revisar

- **Revisar** se ve igual en todos los editores: una ventana flotante que se cierra con Esc y no tapa lo que estás editando.
- Casos de uso ahora también tiene Revisar (nombres vacíos o repetidos y elementos sueltos).
- Se sacaron avisos falsos, por ejemplo con atributos heredados o con «Fin del caso de uso». Un diagrama vacío ya no aparece como «válido».

### Edición

- **Mayús+clic** suma elementos a la selección en clases y casos de uso. Con varios elementos seleccionados, el panel dice cuántos son y los podés borrar juntos.
- Deshacer en casos de uso: crear o borrar una relación es un paso propio, y seleccionar ya no borra lo que podías rehacer.
- Los tipos que escribís respetan tus mayúsculas (`String` sigue siendo `String`).
- Los argumentos de los mensajes se muestran siempre como `f(a, b)`.

### Flujo de sucesos

- Los textos de ayuda de las celdas ya no parecen valores cargados («ej. 3», «ej. CA 1») y aparecen solo en la primera fila.
- Si borrás el número de un paso, vuelve solo al salir de la celda.
- Tab desde la columna Ref. no cae en los botones de la fila, y escribir rápido ya no pierde letras.
- «Sin referencia» en el diagrama de clases se respeta, y si la referencia se borró, se avisa.

### Diagrama de secuencia

- El primer mensaje sale del actor, y cada mensaje nuevo arranca como llamada.
- La pantalla entra en la ventana, la barra del modo teclado no se corta y un diagrama grande se abre entero.
- **Vincular** y **Desvincular** con unas Clases de secuencias se llaman siempre igual, y si desvinculás una secuencia, queda desvinculada.
- Los atajos no actúan detrás de un diálogo abierto y la ayuda muestra todos los que existen.
- Se quitaron las plantillas de secuencia.

### Clases de secuencias

- La barra dice cuántas clases y operaciones hay **para traer** de las secuencias, o que ya está **todo traído**.
- Los métodos traídos conservan sus parámetros, por ejemplo `ingresarDni(dni)`.

### Windows

- Los atajos y textos de ayuda muestran **Ctrl** y **Mayús** en lugar de los símbolos de Mac.

## ¿Algo no anda?

Escribile a Alejo contando qué hiciste, qué esperabas que pasara y qué pasó, con el número de versión (abajo en la barra lateral).
