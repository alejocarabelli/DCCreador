# Guía JSON para IA: todos los artefactos de DCCreador

Esta guía define cómo generar los cinco tipos de artefactos admitidos por el Modelador de Sistemas, con su estructura JSON real, reglas de presentación y ejemplos completos. Se descarga desde **Nuevo artefacto → Guía de artefactos para IA (.md)** o desde **Importar artefacto**.

## Instrucción para la IA

Analizá el dominio y los requisitos solicitados. Elegí el tipo de artefacto adecuado, usá exactamente las estructuras documentadas y entregá un JSON válido, en UTF-8, listo para importar. Incluí el contenido necesario para cumplir el alcance, con nombres claros y una presentación legible. No agregues comentarios, cercas Markdown, comas finales, funciones ni campos inventados al archivo JSON. Si falta un dato del negocio que determina el modelo, pedí esa información antes de entregar el archivo definitivo.

Cuando se pidan varios artefactos vinculados, entregá un proyecto completo con IDs coherentes. Conservá las convenciones y los datos del proyecto de partida. No inventes multiplicidades, condiciones, caminos alternativos, operaciones ni estereotipos como si fueran requisitos confirmados. Los ejemplos de esta guía ilustran el formato; sus reglas del negocio no se trasladan automáticamente a otro dominio.

## 1. Contrato común, importación e identificadores

| `type` del artefacto | Artefacto | Estructura principal de `content` |
| --- | --- | --- |
| `class-diagram` | Diagrama de clases | `nodes`, `edges`. |
| `use-case-model` | Modelo de casos de uso | `nodes`, `edges`, con sus tipos propios. |
| `use-case-flow` | Flujo de sucesos | `description`, `basicFlow`, `alternativeFlows`. |
| `sequence-diagram` | Diagrama de secuencia | `version`, `participants`, `items`, `activations`, `notes`, `canvas` y opciones. |
| `class-sequence-diagram` | Clases de secuencias | `nodes`, `edges`, `version`, `linkedSequenceDiagramIds` y origen opcional. |

### 1.1. Envoltorio del archivo individual

| Campo raíz | Tipo | Uso |
| --- | --- | --- |
| `type` | string | Uno de los cinco valores de la tabla anterior. |
| `name` | string | Nombre descriptivo, no vacío; entre 1 y 120 caracteres. |
| `content` | object | La estructura del tipo elegido. Incluí sus arreglos, aunque estén vacíos. |
| `id` | string opcional | ID del artefacto. Requerido para referenciarlo desde otros artefactos de un proyecto. |
| `createdAt`, `updatedAt` | string opcional | Fechas ISO 8601; se completan al normalizar si faltan. |

Guardá el JSON en un archivo `.json`. En el destino, usá **Nuevo artefacto → Importar artefacto…** o **Opciones del proyecto → Importar artefacto…**. El archivo puede ser un artefacto individual o un proyecto exportado del que elegir un artefacto. Se agrega una copia con un ID nuevo; los existentes permanecen en el proyecto.

**La importación individual desvincula las referencias a otros artefactos**, aunque sus IDs coincidan con alguno del destino. Mantiene el contenido, los textos y las referencias internas del diagrama. Para conservar vínculos entre varios artefactos, importá el proyecto completo desde **Inicio → Importar…**. No uses un artefacto individual como si fuera un proyecto.

### 1.2. IDs y coordenadas

- Usá IDs no vacíos, sin espacios iniciales/finales y únicos dentro de cada dominio de referencias. Preferí IDs únicos en todo el proyecto para artefactos, clases, métodos, pasos, participantes, mensajes, fragmentos, operandos y notas. Las copias sincronizadas de un modelo de clases conservan intencionalmente los IDs internos del modelo fuente. Los IDs distinguen mayúsculas y minúsculas.
- Una referencia apunta a un `id`, no a un nombre ni a la posición en un arreglo. Diferenciá el ID de un artefacto, el de un nodo de clase, el de una operación y el de un participante: representan objetos diferentes.
- Los números de coordenadas y tamaños son números JSON finitos, no strings. No generes `NaN`, `Infinity`, `undefined` ni valores de JavaScript.
- En clases y casos de uso, `position.x/y` es la esquina superior izquierda del nodo. En secuencias, `participant.x` es el centro horizontal de su línea de vida. La posición de una nota es su esquina superior izquierda.
- En clases y casos de uso, planificá las posiciones: importar no aplica una distribución global. En secuencias, el orden temporal y la mayor parte del espaciado vertical se calculan desde `items`. En flujos, el orden está en los arreglos y en los números escritos en sus celdas.
- No escribas callbacks `on…`, estado de selección, `dragging`, mediciones temporales, SVG, obstáculos calculados o estado de cámara. Las opciones de tema y del editor no son campos del artefacto.

## 2. Diagrama de clases (`class-diagram`)

`content` contiene `nodes` y `edges`. Identificá clases, responsabilidades, atributos, operaciones y relaciones antes de decidir las coordenadas. La aplicación mide los nodos y enruta las líneas, pero no corrige automáticamente una disposición ilegible al importar.

### 2.1. Clases: `content.nodes`

Cada nodo necesita:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | string | No vacío, único entre los nodos; por ejemplo `"clase-pedido"`. |
| `type` | string | Siempre `"classNode"`. |
| `position` | object | `{ "x": número, "y": número }`; coordenadas finitas del extremo superior izquierdo, en unidades del lienzo. X crece hacia la derecha; Y hacia abajo. |
| `data.name` | string | Nombre de clase en singular, normalmente PascalCase. |
| `data.description` | string opcional | Responsabilidad o aclaración breve; se consulta en el inspector. |
| `data.attributes` | array | Atributos; usar `[]` cuando no corresponda incluirlos. |
| `data.methods` | array | Operaciones; usar `[]` cuando no corresponda incluirlas. |

Un atributo tiene `id`, `name` y `type`, todos strings. Por ejemplo: `{ "id": "pedido-fecha", "name": "fecha", "type": "Date" }`. La aplicación muestra los atributos con `+`; no hay un campo de visibilidad de atributos. No incluyas el signo en `name`.

Un método tiene `id`, `visibility`, `name`, `parameters` y `returnType`, todos strings. `visibility` admite `"+"` (público), `"-"` (privado), `"#"` (protegido) o `""` (sin signo). `name` es solo el nombre; `parameters` es el texto dentro de los paréntesis, por ejemplo `"producto: Producto, cantidad: Integer"`; `returnType` es el tipo devuelto, por ejemplo `"Pedido"` o `"void"`. No escribas la firma completa en `name` ni repitas los paréntesis en `parameters`.

Los identificadores de atributos y métodos deben ser únicos dentro de cada lista; preferí identificadores únicos en todo el diagrama para evitar ambigüedades futuras. No agregues espacios al inicio o al final de ningún ID. Las clases se referencian desde las relaciones por `id`, nunca por su nombre.

#### Opciones de presentación y notas

- `data.groupColor`: `"blue"`, `"teal"`, `"green"`, `"amber"`, `"violet"` o `"rose"`. Usá un mismo color para un mismo grupo lógico y conservá el significado UML de las relaciones.
- `data.hideAttributes` y `data.hideMethods`: booleanos; omitilos o usá `false` para un diagrama completo. Ocultan compartimentos, sin borrar su contenido.
- `data.hasParametricValuesNote`: booleano para mostrar una nota de valores paramétricos. No es una marca de clase genérica o abstracta.
- `data.parametricValues`: arreglo de objetos `{ "id": "valor-estado", "value": "PENDIENTE | CONFIRMADO | CANCELADO" }`.
- `data.parametricValuesNoteConnectionMode`: `"automatic"` o `"manual"`. Para una ubicación precisa, usá `"manual"`, `data.parametricValuesNotePosition: { "x": ..., "y": ... }`, y los campos `parametricValuesNoteHandle` / `parametricValuesNoteTargetHandle` con `"top"`, `"right"`, `"bottom"` o `"left"`. Reservá también espacio para la nota.

No hay campos específicos de clase abstracta, interfaz, enumeración, paquete, atributo estático ni restricciones UML arbitrarias. Podés describir esos conceptos en `description`; un campo inventado no agrega su representación visual. No generes callbacks `on…`, estados de selección, `dragging`, dimensiones medidas, `positionAbsolute` ni datos internos de React Flow.

### 2.2. Relaciones: `content.edges`

Cada relación tiene `id` único, `type: "association"`, `source` y `target` con IDs de clases existentes, y un objeto `data`. El campo externo `type` es siempre `"association"`, también para herencia, composición o dependencia; el significado UML se define con `data.relationType`.

| Campo de `data` | Valores / significado |
| --- | --- |
| `relationType` | `"association"`, `"generalization"`, `"aggregation"`, `"composition"`, `"dependency"` o `"realization"`. |
| `name` | Nombre breve de la relación, o `""`. |
| `sourceMultiplicity` | Multiplicidad junto a la clase `source`, como `"1"`, `"0..1"`, `"*"`, `"0..*"` o `"1..*"`. Es un string. |
| `targetMultiplicity` | Multiplicidad junto a la clase `target`. En Cliente → Pedido: `sourceMultiplicity: "1"` y `targetMultiplicity: "0..*"` significa que cada pedido tiene un cliente y cada cliente puede tener varios pedidos. |
| `sourceRole`, `targetRole` | Roles de los extremos correspondientes, o `""`; por ejemplo `"cliente"` y `"pedidos"`. |
| `navigability` | `"source-to-target"`, `"target-to-source"`, `"bidirectional"` o `"none"`. |
| `diamondEnd` | `"source"` o `"target"`; extremo del rombo para agregación/composición. |
| `triangleEnd` | `"source"` o `"target"`; extremo del triángulo (la superclase) en una generalización. Si falta, vale `"target"`. |
| `lineStyle` | `"automatic"`, `"straight"` u `"orthogonal"`. |
| `sourceSide`, `targetSide` | `"automatic"`, `"top"`, `"right"`, `"bottom"` o `"left"`. |
| `labelOffset` | Opcional: `{ "x": número, "y": número }`; desplazamiento de la etiqueta central respecto del recorrido. |

Escribí explícitamente `navigability: "source-to-target"` para asociaciones navegables de origen a destino. Esa es la opción inicial al dibujar una asociación nueva en la aplicación, pero **en un JSON importado la omisión de `navigability` se normaliza a `"none"`**. El inspector permite cambiarla después.

#### Convenciones UML que debe respetar la IA

- **Asociación:** usá el origen como el objeto que conoce al destino. Multiplicidades y roles deben expresar reglas del dominio, sin deducirlas de dónde está dibujada la clase.
- **Generalización:** usá `source` como subclase, `target` como superclase y `triangleEnd: "target"` para colocar el triángulo en la superclase. Es el valor predeterminado, pero conviene escribirlo explícitamente. Normalmente dejá nombre, roles y multiplicidades vacíos.
- **Composición / agregación:** usá `source` como el todo, `target` como la parte y `diamondEnd: "source"`. La composición requiere una relación de pertenencia y ciclo de vida que justifique el rombo lleno; no la uses solo para expresar que una clase utiliza otra.
- **Dependencia:** `source` depende de `target`; la flecha discontinua apunta al destino.
- **Realización:** `source` implementa lo especificado por `target`; el triángulo discontinuo apunta al destino.

La navegabilidad configurable se dibuja para `relationType: "association"`. Para las otras relaciones, la representación depende de su tipo y de `diamondEnd` o `triangleEnd` cuando corresponda. No agregues multiplicidades a herencia, dependencia o realización para intentar mostrarlas como una asociación.

#### Puntos de conexión y recorrido

`sourceHandle` y `targetHandle` son campos de la relación, fuera de `data`. Admiten `"top"`, `"right"`, `"bottom"`, `"left"` y sus variantes `"-start"` / `"-end"`. Son puertos al 20 %, 50 % y 80 % del lado correspondiente; por ejemplo `"right-start"` se ubica en la parte superior del lado derecho.

- Para un recorrido automático, usá ambos lados de `data` como `"automatic"` y omití los handles. El editor elige los lados y puertos según las posiciones.
- Para conservar puertos concretos, escribí handles válidos y mantené `sourceSide` / `targetSide` en `"automatic"`. El editor conserva esos handles.
- Para fijar el centro de un lado, escribí ese lado en `sourceSide` / `targetSide` y el handle central correspondiente. Un lado explícito normaliza el handle al centro: no lo combines esperando que conserve un sufijo `-start` / `-end`.
- `lineStyle: "automatic"` usa líneas rectas cuando los extremos están alineados y ortogonales en otros casos. `"orthogonal"` permite rodear clases; el enrutado no garantiza que todas las relaciones queden libres de cruces.
- Usá `waypoints: []` u omití ese campo. No bases la disposición en puntos intermedios manuales: el renderizado actual calcula el recorrido.
- No escribas `markerStart`, `markerEnd`, SVG, `routingObstacles` ni estilos internos para forzar símbolos UML. Los símbolos se obtienen de `data`.

### 2.3. Orden, tamaño y espaciado

1. Definí primero el modelo y luego la disposición. Ordená clases por grupos del dominio y operaciones por responsabilidad. Evitá duplicar una misma relación con nombres distintos sin una justificación del modelo.
2. Organizá grupos en columnas o filas estables. Colocá las superclases encima de sus subclases. Para colaboraciones o pertenencia, seguí un sentido predominante de izquierda a derecha. Mantené las clases que más se relacionan próximas, con corredores para las líneas.
3. Calculá espacio según el contenido. Las clases no tienen una medida fija: su nombre, atributos y firmas pueden ensancharlas o aumentar su altura. No uses un salto fijo de coordenadas sin revisar los textos.
4. Como **estimación conservadora**, reservá una altura `H = 140 + 32 × (cantidad de atributos + cantidad de métodos)`. Reservá una anchura `W = max(300, 40 + 10 × longitud de la firma más larga, 40 + 20 × longitud del mayor nombre o tipo de atributo, 40 + 10 × longitud del nombre de clase)`. Estas fórmulas son una ayuda para planificar; el tamaño real depende de la fuente y de la presentación.
5. Dejá al menos **160 unidades libres entre los rectángulos reservados** de clases vecinas en horizontal y **140 en vertical**. Si hay muchos roles, multiplicidades o relaciones, ampliá el corredor a 220–300. La distancia es entre bordes estimados, no entre coordenadas superiores izquierdas.
6. Para cada fila, calculá `xSiguiente = xActual + WActual + separación`. Para la siguiente fila, calculá `ySiguiente = yFila + max(H de esa fila) + separación`. Un origen como `(100, 100)` y una cuadrícula de 20 unidades facilitan la alineación. Distribuí horizontalmente cada nivel de herencia según su ancho total.
7. Separá los puertos de relaciones que salen de una misma clase usando `-start`, centro y `-end`. Evitá líneas que atraviesen clases, etiquetas que se superpongan y rombos o triángulos sobre otras relaciones. Usá nombres breves y roles claros; si desplazás una etiqueta mediante `labelOffset`, reservá su espacio.
8. No escales todo para meterlo en una pantalla: un diagrama grande se recorre con zoom y desplazamiento. Priorizá la legibilidad a escala normal. Para dominios muy grandes, acordá una división lógica en varios artefactos antes de generar archivos independientes.
9. Revisá todos los pares de rectángulos reservados: no deben intersectarse. Revisá los corredores de cada relación y el área de notas. La aplicación importa las coordenadas tal como están; confirmar el resultado visual es parte de la entrega.

### 2.4. Ejemplo completo e importable

Este ejemplo incluye cinco clases, herencia, asociaciones navegables y composición. Las coordenadas dejan dos filas y tres columnas con corredores amplios.

```json
{
  "type": "class-diagram",
  "name": "Pedidos y productos",
  "content": {
    "nodes": [
      {
        "id": "clase-entidad",
        "type": "classNode",
        "position": {
          "x": 100,
          "y": 100
        },
        "data": {
          "name": "EntidadComercial",
          "description": "Identidad común de las entidades comerciales.",
          "groupColor": "blue",
          "attributes": [
            {
              "id": "entidad-id",
              "name": "id",
              "type": "UUID"
            }
          ],
          "methods": [
            {
              "id": "entidad-get-id",
              "visibility": "+",
              "name": "getId",
              "parameters": "",
              "returnType": "UUID"
            }
          ]
        }
      },
      {
        "id": "clase-cliente",
        "type": "classNode",
        "position": {
          "x": 100,
          "y": 540
        },
        "data": {
          "name": "Cliente",
          "description": "Cliente que realiza pedidos.",
          "groupColor": "blue",
          "attributes": [
            {
              "id": "cliente-nombre",
              "name": "nombre",
              "type": "String"
            },
            {
              "id": "cliente-email",
              "name": "email",
              "type": "String"
            }
          ],
          "methods": [
            {
              "id": "cliente-crear-pedido",
              "visibility": "+",
              "name": "crearPedido",
              "parameters": "",
              "returnType": "Pedido"
            }
          ]
        }
      },
      {
        "id": "clase-pedido",
        "type": "classNode",
        "position": {
          "x": 700,
          "y": 540
        },
        "data": {
          "name": "Pedido",
          "description": "Pedido con al menos una línea de producto.",
          "groupColor": "teal",
          "attributes": [
            {
              "id": "pedido-numero",
              "name": "numero",
              "type": "String"
            },
            {
              "id": "pedido-fecha",
              "name": "fecha",
              "type": "Date"
            },
            {
              "id": "pedido-estado",
              "name": "estado",
              "type": "String"
            }
          ],
          "methods": [
            {
              "id": "pedido-confirmar",
              "visibility": "+",
              "name": "confirmar",
              "parameters": "",
              "returnType": "void"
            },
            {
              "id": "pedido-cancelar",
              "visibility": "+",
              "name": "cancelar",
              "parameters": "",
              "returnType": "void"
            }
          ]
        }
      },
      {
        "id": "clase-linea-pedido",
        "type": "classNode",
        "position": {
          "x": 1320,
          "y": 540
        },
        "data": {
          "name": "LineaPedido",
          "description": "Parte del pedido: cantidad y precio acordado de un producto.",
          "groupColor": "teal",
          "attributes": [
            {
              "id": "linea-cantidad",
              "name": "cantidad",
              "type": "Integer"
            },
            {
              "id": "linea-precio",
              "name": "precioUnitario",
              "type": "Decimal"
            }
          ],
          "methods": [
            {
              "id": "linea-subtotal",
              "visibility": "+",
              "name": "subtotal",
              "parameters": "",
              "returnType": "Decimal"
            }
          ]
        }
      },
      {
        "id": "clase-producto",
        "type": "classNode",
        "position": {
          "x": 1320,
          "y": 100
        },
        "data": {
          "name": "Producto",
          "description": "Producto del catálogo; puede aparecer en muchas líneas de pedido.",
          "groupColor": "green",
          "attributes": [
            {
              "id": "producto-nombre",
              "name": "nombre",
              "type": "String"
            },
            {
              "id": "producto-precio",
              "name": "precio",
              "type": "Decimal"
            }
          ],
          "methods": [
            {
              "id": "producto-precio-actual",
              "visibility": "+",
              "name": "precioActual",
              "parameters": "",
              "returnType": "Decimal"
            }
          ]
        }
      }
    ],
    "edges": [
      {
        "id": "rel-cliente-entidad",
        "type": "association",
        "source": "clase-cliente",
        "target": "clase-entidad",
        "sourceHandle": "top",
        "targetHandle": "bottom",
        "data": {
          "relationType": "generalization",
          "triangleEnd": "target",
          "navigability": "none",
          "name": "",
          "sourceMultiplicity": "",
          "targetMultiplicity": "",
          "sourceRole": "",
          "targetRole": "",
          "sourceSide": "automatic",
          "targetSide": "automatic",
          "lineStyle": "automatic"
        }
      },
      {
        "id": "rel-cliente-pedido",
        "type": "association",
        "source": "clase-cliente",
        "target": "clase-pedido",
        "sourceHandle": "right",
        "targetHandle": "left",
        "data": {
          "relationType": "association",
          "navigability": "source-to-target",
          "name": "realiza",
          "sourceMultiplicity": "1",
          "targetMultiplicity": "0..*",
          "sourceRole": "cliente",
          "targetRole": "pedidos",
          "sourceSide": "automatic",
          "targetSide": "automatic",
          "lineStyle": "automatic"
        }
      },
      {
        "id": "rel-pedido-linea",
        "type": "association",
        "source": "clase-pedido",
        "target": "clase-linea-pedido",
        "sourceHandle": "right",
        "targetHandle": "left",
        "data": {
          "relationType": "composition",
          "diamondEnd": "source",
          "navigability": "none",
          "name": "contiene",
          "sourceMultiplicity": "1",
          "targetMultiplicity": "1..*",
          "sourceRole": "pedido",
          "targetRole": "lineas",
          "sourceSide": "automatic",
          "targetSide": "automatic",
          "lineStyle": "automatic"
        }
      },
      {
        "id": "rel-linea-producto",
        "type": "association",
        "source": "clase-linea-pedido",
        "target": "clase-producto",
        "sourceHandle": "top",
        "targetHandle": "bottom",
        "data": {
          "relationType": "association",
          "navigability": "source-to-target",
          "name": "corresponde a",
          "sourceMultiplicity": "0..*",
          "targetMultiplicity": "1",
          "sourceRole": "lineas",
          "targetRole": "producto",
          "sourceSide": "automatic",
          "targetSide": "automatic",
          "lineStyle": "automatic"
        }
      }
    ]
  },
  "id": "artefacto-clases"
}
```

## 3. Modelo de casos de uso (`use-case-model`)

`content` contiene `nodes` y `edges`, pero sus tipos y datos son distintos de los de clases. Representá objetivos observables del actor con nombres como «Registrar pedido». Un actor es un rol externo; no es una pantalla, una tabla ni un componente interno del sistema.

### 3.1. Nodos y límite del sistema

Cada nodo tiene `id`, `type`, `position: { "x": ..., "y": ... }` y `data: { "kind": ..., "name": ... }`.

| Elemento | `type` | `data.kind` | Presentación |
| --- | --- | --- | --- |
| Actor | `useCaseActor` | `actor` | Figura de actor y nombre. |
| Caso de uso | `useCaseOval` | `use-case` | Óvalo con nombre. |
| Límite del sistema | `systemBoundary` | `system-boundary` | Rectángulo con título. Usá `style: { "width": ..., "height": ... }`. |

Mantené `type` y `kind` coherentes. El límite del sistema se coloca **antes** de los demás nodos en el arreglo para que sea fácil inspeccionar el JSON; el editor lo dibuja detrás de ellos. Sus mínimos visuales son aproximadamente 260 × 180; usá medidas mayores según el contenido.

Los casos de uso se colocan visualmente dentro del límite; los actores, afuera. El contenedor no requiere `parentId`, `parentNode` ni coordenadas relativas: todos los nodos del ejemplo tienen coordenadas absolutas en el lienzo. El límite no recibe relaciones.

### 3.2. Relaciones y dirección UML

Cada edge tiene `id`, `type: "useCaseRelation"`, `source`, `target` y `data`. `data.relationType` admite solo `association`, `include`, `extend` y `generalization`; `data.label` es texto opcional.

| Relación | Origen → destino |
| --- | --- |
| `association` | Actor → caso de uso. Se dibuja una línea sin flecha. |
| `include` | Caso base → caso que se ejecuta obligatoriamente como parte de él. |
| `extend` | Caso que agrega comportamiento opcional/condicional → caso base extendido. |
| `generalization` | Actor especializado → actor general, o caso especializado → caso general. |

Include, extend y generalización apuntan al destino. Las etiquetas «include» y «extend» se generan por el tipo: no escribas esos textos como si definieran el comportamiento de `label`. `sourceHandle` / `targetHandle` pueden ser `top`, `right`, `bottom` o `left`; las líneas actuales se dibujan entre los contornos de las figuras y no necesitan rutas manuales.

No uses `navigability`, `diamondEnd`, `triangleEnd`, multiplicidades ni roles de asociaciones de clases en este artefacto. Evitá duplicar relaciones entre el mismo par de nodos y no conectes un elemento consigo mismo.

### 3.3. Orden y espaciado

- Reservá unos 130 × 150 para un actor y al menos 226 × 112 para un óvalo; nombres largos o de varias líneas necesitan margen adicional.
- Dejá 100–160 unidades libres entre figuras. Colocá los actores a los lados y agrupá objetivos relacionados dentro del sistema, con el caso principal próximo al actor.
- Reservá al menos 60 unidades de margen dentro del contenedor, y una franja superior para su título. Dimensioná el límite después de posicionar los casos de uso.
- Distribuí include/extend en corredores distintos y revisá las etiquetas centrales. Los cruces de líneas no se eliminan solos.
- Verificá que todos los óvalos queden dentro del límite y que todos los actores queden fuera. La contención visual es intencional; no debe contarse como una superposición accidental entre nodos.

### 3.4. Ejemplo completo e importable

La cancelación condicional del ejemplo es un requisito ilustrativo de este dominio. No agregues esa extensión en un sistema que no la necesite.

```json
{
  "id": "artefacto-casos-uso",
  "type": "use-case-model",
  "name": "Casos de uso de pedidos",
  "content": {
    "nodes": [
      {
        "id": "limite-pedidos",
        "type": "systemBoundary",
        "position": {
          "x": 350,
          "y": 100
        },
        "style": {
          "width": 960,
          "height": 620
        },
        "data": {
          "kind": "system-boundary",
          "name": "Sistema de pedidos"
        }
      },
      {
        "id": "actor-comprador",
        "type": "useCaseActor",
        "position": {
          "x": 100,
          "y": 350
        },
        "data": {
          "kind": "actor",
          "name": "Comprador"
        }
      },
      {
        "id": "cu-registrar",
        "type": "useCaseOval",
        "position": {
          "x": 460,
          "y": 350
        },
        "data": {
          "kind": "use-case",
          "name": "Registrar pedido"
        }
      },
      {
        "id": "cu-validar",
        "type": "useCaseOval",
        "position": {
          "x": 1000,
          "y": 210
        },
        "data": {
          "kind": "use-case",
          "name": "Validar pedido"
        }
      },
      {
        "id": "cu-cancelar",
        "type": "useCaseOval",
        "position": {
          "x": 1000,
          "y": 520
        },
        "data": {
          "kind": "use-case",
          "name": "Cancelar pedido"
        }
      }
    ],
    "edges": [
      {
        "id": "rel-comprador-registrar",
        "type": "useCaseRelation",
        "source": "actor-comprador",
        "target": "cu-registrar",
        "sourceHandle": "right",
        "targetHandle": "left",
        "data": {
          "relationType": "association",
          "label": ""
        }
      },
      {
        "id": "rel-registrar-validar",
        "type": "useCaseRelation",
        "source": "cu-registrar",
        "target": "cu-validar",
        "sourceHandle": "right",
        "targetHandle": "left",
        "data": {
          "relationType": "include",
          "label": ""
        }
      },
      {
        "id": "rel-cancelar-registrar",
        "type": "useCaseRelation",
        "source": "cu-cancelar",
        "target": "cu-registrar",
        "sourceHandle": "left",
        "targetHandle": "right",
        "data": {
          "relationType": "extend",
          "label": ""
        }
      }
    ]
  }
}
```

## 4. Flujo de sucesos (`use-case-flow`)

Este artefacto es una especificación textual con camino básico y caminos alternativos. **No tiene `nodes`, `edges`, coordenadas ni carriles de secuencia.**

### 4.1. Descripción y estado

`content.description` incluye todos estos campos string:

| Campo | Significado |
| --- | --- |
| `useCaseNumber` | Identificador legible del caso, por ejemplo `CU 1`; no es un ID de artefacto. |
| `useCaseName` | Objetivo del actor, coherente con el modelo de casos de uso. |
| `actor` | Rol principal que inicia o participa del flujo. |
| `description` | Resumen del objetivo y del resultado. |
| `priority` | Uno de `A`, `B`, `C`, según la prioridad acordada. |
| `inputParameters` | Datos necesarios como texto, no como un arreglo JSON. |
| `precondition`, `postcondition` | Condiciones anteriores y posteriores. |
| `initialState`, `finalState` | Estados del dominio como texto; admiten saltos de línea `\n` y viñetas. |

La vinculación opcional con el modelo de clases es `content.classDiagramArtifactId`, con el ID de un artefacto `class-diagram` del mismo proyecto. Se usa para consultar clases, atributos y operaciones al escribir. El editor utiliza el único diagrama de clases del proyecto si no se especifica otro; para un proyecto generado por IA, escribí el vínculo explícito.

No hay un campo que vincule el flujo a un nodo del modelo de casos de uso: la coherencia del caso se establece mediante `useCaseNumber` y `useCaseName`. No inventes `useCaseModelArtifactId`, `useCaseNodeId` ni referencias semejantes.

### 4.2. Camino básico, pasos y alternativas

`content.basicFlow` es un arreglo ordenado de filas. Cada fila tiene cuatro strings: `id`, `actor`, `system` y `ref`.

- `actor` describe la acción del actor; `system`, la respuesta o acción del sistema. Se puede dejar una celda vacía con `""`.
- **La numeración visible está escrita dentro de las celdas**: `"1. El comprador solicita…"`. El ID de fila no la reemplaza y no hay un campo `number` para eso.
- Usá números consecutivos para acciones principales. Para subpasos, escribí `"    2.1. Validar los datos."`: la sangría recomendada es de cuatro espacios por nivel.
- Una fila puede contener varias líneas separadas por `\n`, pero no mezcles varios turnos de actor/sistema en una misma celda. Priorizá una acción clara por paso y viñetas para detalles.
- `ref` es un código de camino alternativo, por ejemplo `"CA 1"`, o `""`. No es una referencia al paso anterior ni un ID de artefacto.
- También podés derivar a una alternativa con `[CA 1]` al final de la línea correspondiente. El código debe coincidir con una alternativa existente. No agregues un camino sin identificar su condición de entrada y su punto de derivación.

`content.alternativeFlows` es un arreglo de objetos con `id`, `code`, `name` y `steps` (filas con el mismo formato). `code` identifica el camino, por ejemplo `"CA 1"`, y debe ser único. `firstStepNumber` es opcional y debe ser un entero positivo: controla el inicio de numeración al editar; los números visibles ya escritos en el JSON deben ser coherentes con él. Si se omite, el editor toma el número principal del punto de derivación y comienza en el siguiente.

### 4.3. Claridad y consistencia

Describí pasos en presente, con sujetos claros, acciones verificables y resultado observable. Diferenciá precondiciones de validaciones realizadas durante el flujo. Cada alternativa debe aclarar si vuelve a un paso existente o si termina el caso. Si mencionás «volver al paso 2», ese paso debe existir en la tabla correspondiente.

No agregues espacios para simular columnas: el editor y la exportación forman las tablas. Usá saltos de línea solo para estructurar el contenido; las celdas se ajustan al texto. Mantené numeración, referencias, nombres de clases y operaciones consistentes con los artefactos vinculados.

### 4.4. Ejemplo completo e importable

```json
{
  "id": "artefacto-flujo",
  "type": "use-case-flow",
  "name": "CU 1 · Registrar pedido",
  "content": {
    "description": {
      "useCaseNumber": "CU 1",
      "useCaseName": "Registrar pedido",
      "actor": "Comprador",
      "description": "El comprador registra un pedido; se confirma si sus datos son válidos o se cancela si son inválidos.",
      "priority": "A",
      "inputParameters": "Datos del cliente y líneas del pedido.",
      "precondition": "El cliente está identificado.",
      "postcondition": "El pedido queda confirmado o cancelado.",
      "initialState": "• Cliente identificado\n• Datos del pedido disponibles",
      "finalState": "• Pedido confirmado, o pedido cancelado con errores informados"
    },
    "basicFlow": [
      {
        "id": "paso-1",
        "actor": "1. El Comprador solicita registrar un pedido.",
        "system": "",
        "ref": ""
      },
      {
        "id": "paso-2",
        "actor": "",
        "system": "2. El sistema crea una instancia de Pedido y valida sus datos. [CA 1]",
        "ref": ""
      },
      {
        "id": "paso-3",
        "actor": "3. El Comprador confirma el pedido.",
        "system": "",
        "ref": ""
      },
      {
        "id": "paso-4",
        "actor": "",
        "system": "4. El sistema confirma el pedido y presenta su número.",
        "ref": ""
      }
    ],
    "alternativeFlows": [
      {
        "id": "alternativo-1",
        "code": "CA 1",
        "name": "Datos del pedido inválidos",
        "firstStepNumber": 3,
        "steps": [
          {
            "id": "ca1-paso-3",
            "actor": "",
            "system": "3. El sistema cancela el pedido, comunica los errores y termina el caso de uso.",
            "ref": ""
          }
        ]
      }
    ]
  }
}
```

## 5. Diagrama de secuencia (`sequence-diagram`)

Una secuencia representa interacciones ordenadas en el tiempo. No usa nodos ni edges de React Flow. Los participantes se identifican por sus propios IDs, distintos de los IDs de clases.

### 5.1. Contenido, opciones y participantes

| Campo de `content` | Tipo / uso |
| --- | --- |
| `version` | Número `1`. |
| `numbering` | `sequential`, `hierarchical` o `none`. La numeración se calcula; no la escribas dentro del nombre del mensaje. |
| `showActivations` | Booleano para mostrar barras de activación. |
| `participantColors` | `automatic` o `disabled`; no admite colores hexadecimales por participante. |
| `participants` | Arreglo de participantes. Planificá sus X y ordenalos de izquierda a derecha. |
| `items` | Arreglo temporal de mensajes y fragmentos. Su orden determina el orden vertical. |
| `activations` | Arreglo de activaciones manuales o guardadas; usá `[]` para inferencia automática. |
| `problems` | Usá `[]`. Los problemas de normalización y semántica los calcula la aplicación; no inventes diagnósticos guardados. |
| `notes` | Arreglo de notas; usá `[]` si no se necesitan. |
| `canvas` | `{ "width": número, "height": número }`; mínimo normalizado 1200 × 900, normalmente 2400 × 1800. El dibujo puede ampliar esos límites para abarcar el contenido. |

Cada participante tiene `id`, `kind`, `name`, `classifierName` y `x`. `kind` admite `actor`, `boundary`, `control`, `entity` u `object`. Para actores, el nombre identifica el rol. Para otros participantes, `name: "cliente"` y `classifierName: "Cliente"` producen el encabezado `cliente : Cliente`. No escribas los dos puntos dentro del nombre de instancia ni inventes un campo `stereotype`.

`x` es el centro de la línea de vida, no la esquina del encabezado. El normalizador acepta centros desde 90 hasta 100000. Un vínculo opcional de clase es `classifierNodeId`, con el ID del nodo dentro del modelo de clases asociado, **no el ID del artefacto de clases**.

`createdByMessageId` y `destroyedByMessageId` se recalculan desde los mensajes de creación/destrucción. Para expresar esos eventos, generá mensajes `create` / `destroy`. `terminateLifeline: true` permite terminar una línea de vida sin inventar un mensaje; usalo solo cuando corresponda al escenario.

### 5.2. Mensajes

Cada mensaje incluye `id`, `kind: "message"`, `type`, `sourceId`, `targetId`, `name`, `arguments`, `parameterValues`, `returnType` y `flowReference`. Los campos de texto son strings y pueden ser `""`.

| Campo / valor | Uso |
| --- | --- |
| `type: "synchronous"` | Llamada síncrona. |
| `type: "asynchronous"` | Envío asíncrono, sin tratarlo como una llamada que necesita retorno. |
| `type: "return"` | Respuesta a una llamada previa. Usá `replyToMessageId` con el ID de esa llamada y endpoints invertidos. |
| `type: "create"` | Creación del participante destino. Su encabezado y línea de vida comienzan allí. |
| `type: "destroy"` | Destrucción del destino y final de su línea de vida. |
| `sourceId`, `targetId` | IDs de participantes existentes. Una autollamada puede tener el mismo origen y destino. |
| `name` | Nombre de la operación, por ejemplo `crearPedido`; sin numeración ni firma completa. |
| `arguments` | Texto entre paréntesis, por ejemplo `producto, cantidad`; no agregues los paréntesis. |
| `parameterValues` | Anotación textual opcional de valores, distinta de la lista `arguments`. |
| `returnType` | Tipo devuelto por la llamada, por ejemplo `Pedido` o `void`. |
| `operationMethodId` | Opcional: ID de un método del clasificador del **destinatario**, en el modelo asociado. |
| `replyToMessageId` | Opcional para respuestas: ID de la llamada a la que responden. |
| `flowReference` | Referencia a una fila del flujo asociado, o `""`. Véase sección 7. |

**En mensajes `return`, usá `name`, `arguments`, `parameterValues` y `returnType` vacíos.** El normalizador los limpia; la respuesta se interpreta mediante `replyToMessageId`. No escribas el tipo de la respuesta en el retorno esperando que se conserve: indicá el tipo en la llamada original. Evitá `operationMethodId` en un retorno.

Toda respuesta debe corresponder a una llamada síncrona previa válida en su camino. En este modelador, los mensajes de creación y destrucción no abren llamadas retornables; no les agregues un mensaje `return`. No actives un participante antes de su creación ni lo uses después de destruirlo. En alternativas, una llamada de un operando no se responde desde otro operando. Preferí IDs de respuesta explícitos a depender de inferencia en secuencias anidadas.

### 5.3. Fragmentos combinados y anidamiento

Un fragmento tiene `id`, `kind: "fragment"`, `operator`, `name` y `operands`. Cada operando tiene `id`, `guard` e `items`; esos `items` admiten los mismos mensajes o fragmentos recursivamente.

| `operator` | Intención y operandos |
| --- | --- |
| `alt` | Alternativas; al menos dos operandos, con guardas claras y un `else` cuando corresponda. |
| `opt` | Una interacción opcional; al menos un operando. |
| `loop` | Repetición; al menos un operando, con condición de iteración en la guarda. |
| `par` | Caminos paralelos; al menos dos operandos. |
| `break` | Interrupción del resto de la interacción bajo una condición. |
| `critical` | Región crítica. |
| `ref` | Referencia a otra interacción; `interactionArtifactId` es el ID de otra secuencia del mismo proyecto. |

`guard` contiene solo el texto, por ejemplo `"pedido válido"` o `"else"`. El dibujo agrega los corchetes; no escribas `"[pedido válido]"` si no querés duplicarlos.

`startParticipantId` y `endParticipantId` son opcionales y delimitan el marco con IDs de participantes existentes, ordenados de izquierda a derecha. Omitilos si querés que el marco se calcule desde sus mensajes. Para un fragmento automático, omití `x`, `y`, `width` y `height`: un fragmento manual requiere reservar un área suficiente para todos sus operandos y contenido anidado (mínimos normalizados 140 × 60). No uses un marco manual chico para esconder mensajes o forzar superposiciones.

En un `ref`, conservá el nombre de la interacción referenciada y usá un `interactionArtifactId` válido. No generes referencias recursivas entre diagramas sin una intención del modelo. Un `ref` sin enlace solo es un rótulo pendiente de vincular, no una secuencia embebida automáticamente.

### 5.4. Activaciones y notas

Para activaciones automáticas, dejá `activations: []` y `showActivations: true`. Si necesitás una activación manual, sus campos son: `id`, `participantId`, `startMessageId`, `endMessageId` opcional, `level` (entero de 0 a 12) y `manual: true`. `endScope` opcional puede indicar `{ "fragmentId": ..., "operandId": ... }` para cerrar en el límite de un operando. Todas las referencias deben existir y pertenecer a un camino temporal válido; no uses un número de fila como ID de mensaje.

Una nota tiene `id`, `text`, `x`, `y`, `width`, `height`, `anchorKind` y, opcionalmente, `anchorId` y `color`.

- `anchorKind`: `free`, `message`, `fragment` o `participant`. Para una nota vinculada, `anchorId` debe ser el ID del elemento del tipo indicado. Para una nota libre, omití `anchorId`.
- `color`: `yellow`, `red`, `green` o `blue`. No se aceptan colores arbitrarios.
- `x/y` son la esquina de la nota en el lienzo, incluso cuando está anclada. Un ancla une la nota con el elemento; no convierte las coordenadas en un desplazamiento relativo.
- Mínimos normalizados: 120 de ancho y 70 de alto. Reservá una altura suficiente para todas las líneas del texto; una medida habitual es 220 × 110.

### 5.5. Orden y espaciado

1. Colocá el actor principal a la izquierda, interfaces/boundaries después, controles en el centro y entidades a la derecha cuando ese orden represente las responsabilidades del escenario. No agregues estereotipos que no estén justificados.
2. Una separación de centros de 320–440 suele ser legible con nombres cortos. El mínimo de interacción de 180 no garantiza espacio para encabezados largos o mensajes extensos.
3. Reservá el ancho de ambos encabezados: `xSiguiente >= xActual + WActual/2 + WSiguiente/2 + margen`, con al menos 100 de margen. El renderer estima el ancho con unas 6,3 unidades por carácter más 28 de borde, y tiene mínimos de 112 para actores y 160 para otros participantes. Es una estimación; revisá los nombres largos visualmente.
4. Aumentá la separación cuando las firmas no entren entre líneas de vida. No recortes ni abreviés el significado para esconder un error del modelo; sí evitá anotaciones redundantes.
5. Escribí el orden temporal en `items` y en los `items` de cada operando. No inventes `y` en mensajes: el layout deja espacio para etiquetas, retornos, autollamadas, activaciones y fragmentos.
6. Colocá notas fuera de los corredores de mensajes y encabezados. El lienzo debe incluir el extremo derecho de la última nota y el fondo del contenido.
7. Usá fragmentos automáticos como punto de partida. La geometría manual de un padre y un hijo no representa una relación de coordenadas relativas.
8. Verificá la creación/destrucción, las respuestas, los límites de fragmentos y las barras de activación; `problems: []` en el JSON no silencia los problemas que detecta la aplicación.

### 5.6. Ejemplo completo e importable

Incluye creación de Pedido, retornos explícitos, una alternativa con dos operandos y una nota. Los vínculos externos se configuran al reunir los ejemplos en un proyecto, como explica la sección 7.

```json
{
  "id": "artefacto-secuencia",
  "type": "sequence-diagram",
  "name": "Secuencia CU 1 · Registrar pedido",
  "content": {
    "version": 1,
    "numbering": "sequential",
    "showActivations": true,
    "participantColors": "automatic",
    "participants": [
      {
        "id": "part-comprador",
        "kind": "actor",
        "name": "Comprador",
        "classifierName": "",
        "x": 140
      },
      {
        "id": "part-cliente",
        "kind": "entity",
        "name": "cliente",
        "classifierName": "Cliente",
        "x": 500
      },
      {
        "id": "part-pedido",
        "kind": "entity",
        "name": "pedido",
        "classifierName": "Pedido",
        "x": 900
      }
    ],
    "items": [
      {
        "id": "msg-crear-pedido",
        "kind": "message",
        "type": "synchronous",
        "sourceId": "part-comprador",
        "targetId": "part-cliente",
        "name": "crearPedido",
        "arguments": "",
        "parameterValues": "",
        "returnType": "Pedido",
        "flowReference": ""
      },
      {
        "id": "msg-construir-pedido",
        "kind": "message",
        "type": "create",
        "sourceId": "part-cliente",
        "targetId": "part-pedido",
        "name": "Pedido",
        "arguments": "",
        "parameterValues": "",
        "returnType": "",
        "flowReference": ""
      },
      {
        "id": "msg-retorno-pedido",
        "kind": "message",
        "type": "return",
        "sourceId": "part-cliente",
        "targetId": "part-comprador",
        "name": "",
        "arguments": "",
        "parameterValues": "",
        "returnType": "",
        "flowReference": "",
        "replyToMessageId": "msg-crear-pedido"
      },
      {
        "id": "frag-validacion",
        "kind": "fragment",
        "operator": "alt",
        "name": "Validación del pedido",
        "startParticipantId": "part-comprador",
        "endParticipantId": "part-pedido",
        "operands": [
          {
            "id": "operando-valido",
            "guard": "pedido válido",
            "items": [
              {
                "id": "msg-confirmar",
                "kind": "message",
                "type": "synchronous",
                "sourceId": "part-comprador",
                "targetId": "part-pedido",
                "name": "confirmar",
                "arguments": "",
                "parameterValues": "",
                "returnType": "void",
                "flowReference": ""
              },
              {
                "id": "msg-retorno-confirmar",
                "kind": "message",
                "type": "return",
                "sourceId": "part-pedido",
                "targetId": "part-comprador",
                "name": "",
                "arguments": "",
                "parameterValues": "",
                "returnType": "",
                "flowReference": "",
                "replyToMessageId": "msg-confirmar"
              }
            ]
          },
          {
            "id": "operando-invalido",
            "guard": "else",
            "items": [
              {
                "id": "msg-cancelar",
                "kind": "message",
                "type": "synchronous",
                "sourceId": "part-comprador",
                "targetId": "part-pedido",
                "name": "cancelar",
                "arguments": "",
                "parameterValues": "",
                "returnType": "void",
                "flowReference": ""
              },
              {
                "id": "msg-retorno-cancelar",
                "kind": "message",
                "type": "return",
                "sourceId": "part-pedido",
                "targetId": "part-comprador",
                "name": "",
                "arguments": "",
                "parameterValues": "",
                "returnType": "",
                "flowReference": "",
                "replyToMessageId": "msg-cancelar"
              }
            ]
          }
        ]
      }
    ],
    "activations": [],
    "problems": [],
    "notes": [
      {
        "id": "nota-crear",
        "text": "La operación crearPedido devuelve el pedido creado.",
        "x": 1250,
        "y": 190,
        "width": 260,
        "height": 110,
        "anchorKind": "message",
        "anchorId": "msg-crear-pedido",
        "color": "blue"
      }
    ],
    "canvas": {
      "width": 1800,
      "height": 1200
    }
  }
}
```

## 6. Clases de secuencias (`class-sequence-diagram`)

Este es el quinto tipo de artefacto, distinto de un `class-diagram` y de un `sequence-diagram`. Muestra un modelo de clases que se utiliza al trabajar con secuencias.

`content` incluye **todo el formato de clases de la sección 2**: `nodes`, `edges`, atributos, métodos, relaciones, navegabilidad, colores, notas de valores paramétricos y posiciones. Agrega estos campos:

| Campo | Uso |
| --- | --- |
| `version` | Número `1`. |
| `sourceClassDiagramArtifactId` | Opcional: ID de un `class-diagram` del mismo proyecto que actúa como modelo fuente. |
| `linkedSequenceDiagramIds` | Arreglo de IDs de secuencias vinculadas; `[]` para un artefacto independiente. |

Si lo generás como copia vinculada al modelo fuente, **copiá sus `nodes` y `edges` completos y conservá los IDs internos**. La aplicación sincroniza cambios de clases y métodos entre el modelo fuente y sus copias de clases de secuencias. No apuntes al modelo fuente con un contenido parcial o contradictorio si querés esa sincronización.

Para que una secuencia use este modelo, su `content.classDiagramArtifactId` debe apuntar al ID del artefacto `class-sequence-diagram`. Registrá también su ID en `linkedSequenceDiagramIds`. La lista de secuencias no reemplaza el vínculo desde la secuencia; son dos campos diferentes.

Si generás clases a partir de secuencias sin un modelo fuente, omití `sourceClassDiagramArtifactId`. Tomá los clasificadores y las operaciones que recibe cada participante; no deduzcas que todos los mensajes representan asociaciones persistentes, herencias o composiciones. Un actor externo no se convierte en una entidad del dominio solo por ser un participante.

Usá los mismos criterios de espaciado, puertos y símbolos UML que en la sección 2. No uses `participants` o `items` aquí ni un supuesto tipo de nodo «clase de secuencia».

### 6.1. Ejemplo completo e importable

Este ejemplo independiente contiene las clases relevantes de la interacción. La sección 7 explica cómo convertirlo en una copia sincronizada del modelo completo y vincularlo a la secuencia.

```json
{
  "id": "artefacto-clases-secuencias",
  "type": "class-sequence-diagram",
  "name": "Clases de la secuencia de pedidos",
  "content": {
    "version": 1,
    "linkedSequenceDiagramIds": [],
    "nodes": [
      {
        "id": "clase-cliente",
        "type": "classNode",
        "position": {
          "x": 100,
          "y": 100
        },
        "data": {
          "name": "Cliente",
          "description": "Cliente que realiza pedidos.",
          "groupColor": "blue",
          "attributes": [
            {
              "id": "cliente-nombre",
              "name": "nombre",
              "type": "String"
            },
            {
              "id": "cliente-email",
              "name": "email",
              "type": "String"
            }
          ],
          "methods": [
            {
              "id": "cliente-crear-pedido",
              "visibility": "+",
              "name": "crearPedido",
              "parameters": "",
              "returnType": "Pedido"
            }
          ]
        }
      },
      {
        "id": "clase-pedido",
        "type": "classNode",
        "position": {
          "x": 700,
          "y": 100
        },
        "data": {
          "name": "Pedido",
          "description": "Pedido con al menos una línea de producto.",
          "groupColor": "teal",
          "attributes": [
            {
              "id": "pedido-numero",
              "name": "numero",
              "type": "String"
            },
            {
              "id": "pedido-fecha",
              "name": "fecha",
              "type": "Date"
            },
            {
              "id": "pedido-estado",
              "name": "estado",
              "type": "String"
            }
          ],
          "methods": [
            {
              "id": "pedido-confirmar",
              "visibility": "+",
              "name": "confirmar",
              "parameters": "",
              "returnType": "void"
            },
            {
              "id": "pedido-cancelar",
              "visibility": "+",
              "name": "cancelar",
              "parameters": "",
              "returnType": "void"
            }
          ]
        }
      }
    ],
    "edges": [
      {
        "id": "rel-cliente-pedido",
        "type": "association",
        "source": "clase-cliente",
        "target": "clase-pedido",
        "sourceHandle": "right",
        "targetHandle": "left",
        "data": {
          "relationType": "association",
          "navigability": "source-to-target",
          "name": "realiza",
          "sourceMultiplicity": "1",
          "targetMultiplicity": "0..*",
          "sourceRole": "cliente",
          "targetRole": "pedidos",
          "sourceSide": "automatic",
          "targetSide": "automatic",
          "lineStyle": "automatic"
        }
      }
    ]
  }
}
```

## 7. Proyecto completo y vínculos entre artefactos

### 7.1. Envoltorio de proyecto

Un proyecto tiene `id`, `name`, `artifacts` (arreglo de los objetos completos de las secciones anteriores), `activeArtifactId` opcional y fechas `createdAt` / `updatedAt` opcionales. El `activeArtifactId` debe ser el ID de uno de sus artefactos. **No metas `content` en la raíz de un proyecto con varios artefactos.**

Para generar un proyecto con los cinco ejemplos, reuní sus objetos en `artifacts`, usá `id: "proyecto-pedidos"`, `name: "Pedidos"` y `activeArtifactId: "artefacto-clases"`. Completá los vínculos según las tablas siguientes y guardá el objeto entero como JSON. Desde Inicio, importá ese archivo como proyecto para que los vínculos se conserven.

### 7.2. Referencias a artefactos

| Campo | ID que espera | Valor en el proyecto de ejemplo |
| --- | --- | --- |
| Flujo: `content.classDiagramArtifactId` | Artefacto `class-diagram`. | `artefacto-clases` |
| Secuencia: `content.classDiagramArtifactId` | Artefacto `class-diagram` o `class-sequence-diagram`. | `artefacto-clases-secuencias` |
| Secuencia: `content.flowArtifactId` | Artefacto `use-case-flow`. | `artefacto-flujo` |
| Clases de secuencias: `content.sourceClassDiagramArtifactId` | Artefacto `class-diagram`. | `artefacto-clases` |
| Clases de secuencias: `content.linkedSequenceDiagramIds` | Arreglo de IDs de `sequence-diagram`. | `["artefacto-secuencia"]` |
| Fragmento `ref`: `interactionArtifactId` | Otra secuencia del mismo proyecto. | Solo escribirlo si se agrega esa otra secuencia. |

En el proyecto vinculado, reemplazá `nodes` y `edges` del ejemplo de clases de secuencias por una copia completa de los del ejemplo de clases, conservando IDs. Esto produce una copia sincronizada consistente, con las cinco clases del modelo fuente. El ejemplo independiente de la sección 6 puede quedarse parcial porque no declara ese vínculo.

### 7.3. Referencias internas de la secuencia

En el ejemplo, agregá `classifierNodeId: "clase-cliente"` al participante `part-cliente` y `classifierNodeId: "clase-pedido"` a `part-pedido`. El actor `part-comprador` queda sin vínculo de clase.

| Mensaje | `operationMethodId` | `flowReference` |
| --- | --- | --- |
| `msg-crear-pedido` | `cliente-crear-pedido` | `paso-1` |
| `msg-construir-pedido` | Omitir: no se definió una operación de constructor en el modelo. | `paso-2` |
| `msg-confirmar` | `pedido-confirmar` | `paso-4` |
| `msg-cancelar` | `pedido-cancelar` | `ca1-paso-3` |
| Mensajes de retorno | Omitir. | `""` |

**`flowReference` no es necesariamente el número visible del paso.** La aplicación usa el valor no vacío de `ref` de la fila y, si está vacío, usa el `id` de la fila. En estos ejemplos todos los `ref` están vacíos y se usan IDs como `paso-1`. Si una fila tiene `ref: "CA 1"`, su opción de referencia en secuencias es `"CA 1"`. Verificá este detalle al generar un archivo desde un flujo existente.

Los mensajes dentro de un fragmento tienen el mismo formato de referencias; recorré recursivamente sus operandos. No apuntes una operación a un método de otra clase, ni confundas `replyToMessageId` con una referencia al flujo.

### 7.4. Coherencia del proyecto

- El nombre del caso de uso del modelo, `description.useCaseName` del flujo y el escenario de la secuencia deben describir el mismo objetivo cuando se pretende que se correspondan. No existe un vínculo JSON directo entre el óvalo de caso de uso y el flujo.
- Los clasificadores y métodos vinculados deben existir en el modelo asociado. Conservá sus IDs cuando generás una copia sincronizada.
- Todos los IDs de artefactos referidos deben existir en el mismo proyecto y ser del tipo correcto. No copies IDs externos esperando que se resuelvan por nombre.
- Al importar un artefacto individual, estos vínculos se quitan para evitar asociaciones accidentales con un proyecto diferente. Para trasladar un conjunto ya existente, usá **Mover a otro proyecto… → Incluir artefactos vinculados**.

## 8. Verificación antes de entregar

1. El archivo pasa `JSON.parse`; su raíz es un artefacto con `type`, `name` y `content`, o un proyecto con `name` y `artifacts` completos. No es texto Markdown ni un arreglo de ejemplos sin envoltorio.
2. Todos los IDs son válidos y únicos en sus dominios; no hay referencias a nombres, índices ni IDs inexistentes. Los datos de opciones usan exactamente los valores admitidos.
3. En clases, los endpoints, multiplicidades, roles, triángulos y rombos expresan el modelo, y las clases/etiquetas/notas tienen espacio suficiente.
4. En casos de uso, los actores quedan fuera del límite, los óvalos dentro, y include/extend/generalización apuntan al destino adecuado.
5. En flujos, la numeración está en el texto, las alternativas se derivan desde un paso real y las referencias a caminos y pasos existen.
6. En secuencias, los participantes no se superponen, los mensajes siguen el orden requerido, las respuestas se enlazan a llamadas previas y la creación/destrucción y los fragmentos son consistentes.
7. En clases de secuencias, la estructura de clases es válida, los enlaces a la fuente y a las secuencias apuntan a artefactos existentes, y las copias sincronizadas conservan el modelo completo.
8. Importá el resultado y verificá su presentación, nombres y referencias en el editor correspondiente. En editores que tienen **Revisar**, corregí los problemas reales detectados; la ausencia de avisos no demuestra que el negocio esté modelado correctamente.
9. Exportá un artefacto o el proyecto como JSON para contrastar el formato real. No presentes como editable un campo que el normalizador elimina o recalcula.

## 9. Exportar, importar y mover

**Opciones del artefacto → Exportar artefacto (JSON)** genera un archivo individual de cualquiera de los cinco tipos. **Opciones del proyecto → Exportar proyecto (JSON)** conserva el conjunto con sus vínculos.

**Importar artefacto…** agrega una copia al proyecto elegido y abre esa copia. **Inicio → Importar…** agrega proyectos completos. No confundas los dos caminos al entregar varios diagramas vinculados.

**Mover a otro proyecto…** permite elegir el destino e incluir los vinculados. Al moverlos juntos se conservan las referencias válidas y se remapean IDs si se repiten en el destino. Si movés uno solo, se quitan los vínculos que quedan fuera de su proyecto. Si se mueve el último artefacto del origen, allí se crea un diagrama de clases vacío para mantener el proyecto utilizable.
