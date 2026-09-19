# Línea base de estabilización del editor de secuencia

## Fixture manual

Importar `fixtures/sequence-stabilization-baseline.json` desde **Ajustes > Importar JSON**. El proyecto contiene un `alt` de dos ramas, llamadas y retornos en cada una, un `loop` anidado, `create`, `destroy`, textos extensos, una nota grande y tres participantes en posiciones conflictivas (API en `x=300` y Servicio en `x=440`). También contiene a propósito un mensaje anterior a `create` y otro posterior a `destroy`: el import es temporalmente inválido, pero se acepta hoy.

## Reproducciones verificadas

| Caso | Pasos | Resultado actual | Resultado esperado |
| --- | --- | --- | --- |
| Fragmento y contenido | Crear o seleccionar un fragmento con mensajes; arrastrar el borde del fragmento hacia abajo. | Sólo cambia la geometría del cuadro; las filas internas conservan su Y temporal original. | El contenido debe trasladarse con el fragmento o el movimiento debe preservar su relación geométrica. |
| Activaciones entre ramas de `alt` | Usar `call-in-first` en una rama y `call-in-second` en la otra. | La segunda rama hereda las pilas de activación de la primera y no obtiene su propia activación. | Cada rama alternativa debe calcular sus activaciones de forma independiente. |
| Mensajes antes de `create` / después de `destroy` | Importar el fixture. | Se conservan `before-create` y `after-destroy`; sus flechas quedan fuera del intervalo de vida de `temporal`. | El modelo debe rechazar, reubicar o señalar esas operaciones temporales inválidas. |
| Invertir mensaje existente | Doble clic en un mensaje existente; usar el botón `origen ↔ destino`; guardar. | Se guarda la operación, pero no los IDs de origen y destino intercambiados. | El mensaje editado debe conservar la ruta recién elegida. |
| Distancia entre participantes | Con centros en 120, 300 y 480, arrastrar el primero hacia x=400. | El algoritmo puede devolver x=300, coincidente con el segundo participante. | Todos los pares deben quedar separados al menos 180 px. |
| Texto largo | Importar el fixture y observar el nombre largo del participante y el mensaje largo. | El encabezado del participante usa dos líneas; textos posteriores se recortan. | Debe verse el texto íntegro o existir una indicación de desborde accesible. |
| Nota grande | Importar el fixture y observar `large-note` sin redimensionarla. | El renderizador limita el contenido a 12 líneas aunque el texto excede la altura y el límite. | Debe mostrarse el contenido íntegro, o indicarse claramente que hay desborde. |
| Navegación y Deshacer/Rehacer | Hacer una edición, desplazarse al borde derecho o inferior para ampliar el lienzo y usar Deshacer/Rehacer; repetir al cambiar de artefacto y volver. | La ampliación automática llama al mismo mecanismo de cambios de contenido y puede incorporarse al historial o agruparse con la edición. | Navegar o ampliar espacio de trabajo no debe alterar el historial semántico de edición. |

## Pruebas de caracterización

`src/utils/sequenceDiagram.characterization.test.ts` conserva los dos contratos visuales pendientes. Los casos temporales ya corregidos se transformaron en pruebas ordinarias y se amplían en `src/utils/sequenceDiagramTemporal.test.ts`, que cubre ramas `alt`, anidamiento, retornos incompatibles, ciclo de vida, mutaciones e importación.

## Estado tras la corrección semántica

El fixture sigue siendo temporalmente inválido a propósito, pero al importarlo se conservan sus mensajes y `content.problems` expone errores estructurados para `before-create` y `after-destroy`. Esos mensajes no participan en activaciones derivadas ni cambian el ciclo de vida válido del participante. Las mutaciones interactivas, en cambio, no aceptan un error temporal nuevo.

## Límite de esta línea base

Este documento no propone ni aplica correcciones. En particular, no cambia normalización, cálculo de activaciones, layout, renderizado, historial ni la aplicación instalada.
