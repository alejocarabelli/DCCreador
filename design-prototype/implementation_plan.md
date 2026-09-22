# Dirección visual final — Editor de diagramas de secuencia

## Alcance

Este artefacto es un prototipo visual aislado. No modifica componentes, estilos, modelo de datos, semántica, persistencia, historial, mutation gate ni layout de la aplicación productiva.

El prototipo se abre directamente desde `cuaderno_tecnico_mockup.html`. El selector inferior permite evaluar:

1. diagrama simple;
2. diagrama denso con `alt`, `opt`, self-message y activaciones anidadas;
3. participante seleccionado;
4. mensaje seleccionado;
5. fragmento seleccionado;
6. nota seleccionada;
7. creación de participante;
8. creación de mensaje;
9. modo teclado;
10. multiselección;
11. drag válido;
12. drag inválido.

El segundo selector aplica tres variantes cromáticas al mismo contenido. Esto permite comparar el tono sin confundirlo con cambios de layout o interacción.

Los paneles izquierdo y derecho se pueden contraer de manera independiente. La composición se adapta a 1440 × 900 y 1280 × 800 sin reducir el canvas a una columna residual.

## Diagnóstico del producto actual

- El canvas y el render UML son la parte más madura y deben conservar el protagonismo.
- La barra superior actual contiene demasiadas acciones con texto completo y compite con el nombre del artefacto en anchos normales.
- La guía permanente de conexión ocupa una franja completa incluso cuando el usuario ya conoce la interacción.
- El inspector evolucionó hacia una organización más clara, pero todavía mezcla edición frecuente, movimientos, semántica, referencias y compatibilidad técnica con un peso visual parecido.
- Los estados de selección múltiple y drag comunican mucha información mediante varias señales simultáneas. Conviene reservar el azul para selección/acción válida y el rojo sólo para bloqueo o error.
- Los participantes admiten una representación textual simple y potente. Los estereotipos internos no son necesarios para leer el diagrama ni para crear una línea de vida.

## Decisiones de la iteración

### Variantes cromáticas comparables

#### Slate + Sage — recomendada

- Canvas off-white apenas cálido.
- Secuencia en charcoal, estructura en slate y activaciones sage.
- Participantes en cinco pasteles minerales muy controlados.
- Fragmentos con superficies translúcidas sage y arena.
- Acento exterior petróleo/slate para acciones, estados activos y foco.
- Selección teal-azulada precisa, limitada a stroke y handles.

Es la variante más equilibrada para trabajar durante mucho tiempo: tiene personalidad sin teñir el documento ni reducir contraste. El petróleo funciona como puente entre el chrome del editor, el sage de las activaciones y los slate del diagrama; evita que la acción principal parezca pertenecer a otra paleta.

#### Graphite cálido

- Canvas marfil técnico.
- Mensajes graphite y estructura taupe.
- Activaciones arena y participantes tierra/sage.
- Guards ámbar más presentes.

Se siente más cercana a un cuaderno profesional impreso. Es agradable, aunque el contraste entre estructura y nota amarilla es ligeramente menor.

#### Tinta técnica

- Canvas gris frío muy claro.
- Charcoal más oscuro y lifelines más firmes.
- Teal frío para activaciones y guards.
- Participantes minerales algo más contrastados.

Es la más nítida en pantallas comunes y proyectores, pero también la más cercana a una herramienta técnica convencional.

### Tratamiento del documento UML

- El fondo deja de ser blanco clínico: usa un off-white técnico y puntos de bajo contraste separados 20 px.
- Las líneas principales usan charcoal en lugar de negro; lifelines y returns usan slate secundario.
- Los labels tienen un halo del color del canvas mediante `paint-order`, evitando cajas blancas visibles y manteniendo legibilidad al cruzar líneas.
- La numeración usa monoespaciada pequeña y un nivel de contraste inferior a la firma.
- Los participantes separan visualmente instancia y clase por peso y tono, sin agregar estereotipos.
- Las activaciones usan fill sage claro, stroke más oscuro y un nivel ligeramente más claro para activaciones anidadas.
- Los fragmentos usan superficies translúcidas y tabs compactos; el hijo cambia apenas de temperatura, no de color saturado.
- El escenario denso muestra ahora un `opt` realmente contenido dentro de una rama del `alt`: conserva margen interno, tab propio, guard independiente y un borde secundario más cálido para que el anidamiento se entienda sin duplicar peso visual.
- Los guards ganan peso, itálica y una superficie corta de ámbar/sage muy suave.
- Las notas conservan cuatro familias —ámbar, sage, azul y rosa— adaptadas a la misma saturación mineral.
- La selección no recolorea el elemento: modifica stroke, agrega handles y aplica como máximo un highlight local.
- El hover sólo refuerza levemente stroke o sombra durante 70 ms.
- Las puntas de flecha tienen tamaño estable en pantalla, unión redondeada y semántica diferenciada: sólida para síncronos, abierta para asíncronos y abierta sobre línea discontinua para returns textless. Los self-messages dejan un pequeño claro antes de volver a la activación para evitar el efecto de doble línea.

### 1. Canvas sin ayuda permanente

En el estado normal no hay una banda de instrucciones. La ayuda reaparece de forma contextual al activar el modo teclado, al arrastrar o en un estado vacío. El acceso al outline permanece visible en la toolbar.

### 2. Participantes textuales

El canvas y el flujo de creación priorizan `instancia:Clase` y `:Clase`. El tipo interno queda dentro de “Opciones técnicas” en el inspector y no genera estereotipos visibles por defecto.

### 3. Inspector en cuatro niveles

1. Resumen de selección y acción destructiva.
2. Edición habitual del contenido principal.
3. Acciones contextuales y de orden.
4. Secciones plegables para vínculos, geometría y compatibilidad técnica.

La firma del mensaje se mantiene como el control principal. Los returns son deliberadamente textless en el canvas; el prototipo no les agrega label, valor ni firma visible.

### 4. Creación compacta y situada

Participantes y mensajes se crean en popovers compactos. La firma completa del mensaje es un único campo principal. Método vinculado, referencia al flujo y otras opciones quedan en una sección secundaria.

### 5. Responsive por prioridad, no por escala

- Amplio: outline de 252 px, inspector de 328 px, labels completos.
- 1440 px: outline de 238 px, inspector de 312 px; se ocultan labels terciarios.
- 1280 px: outline de 224 px, inspector de 296 px; las acciones secundarias conservan icono y tooltip.
- Menos de 1120 px: el outline se contrae automáticamente, salvo que el usuario lo fije.
- Ambos paneles se pueden contraer a 42 px por separado.
- El canvas conserva un mínimo funcional de 480 px y scroll interno para diagramas anchos.

### 6. Señales visuales acotadas

- Selección: borde azul y tiradores únicamente cuando hacen falta.
- Hover: cambio leve de fondo.
- Focus: contorno azul consistente de 2 px.
- Disabled: reducción de opacidad, sin color adicional.
- Drag válido: guía azul y una frase de destino.
- Drag inválido: guía roja discontinua y una causa concreta.
- Advertencias: ámbar, sin competir con el error.
- Feedback exitoso: texto breve en barra de estado; no se apilan badges y toasts.

## Principios definitivos del design system

1. **El diagrama es el documento.** El chrome lo acompaña y nunca lo decora por encima de su contenido.
2. **Precisión antes que ornamento.** Bordes, peso tipográfico y fondos leves preceden a sombras y animaciones.
3. **Color con significado estable.** Azul para acción/selección, verde para estado correcto, ámbar para advertencia y rojo para error o bloqueo.
4. **Densidad productiva legible.** Controles de 32–34 px, paneles compactos y separación basada en una escala corta de 4/8/12/16 px.
5. **Una acción, un patrón.** Botones, inputs, segmentados, popovers y secciones plegables comparten geometría y estados.
6. **Progresive disclosure real.** Lo frecuente aparece primero; lo técnico sigue disponible sin dominar.
7. **UML primero.** Participantes, lifelines, mensajes, activaciones, fragmentos, guards, notas, create/destroy y returns conservan su lectura inequívoca.
8. **Responsive por prioridad.** Primero se acortan labels y pasan acciones a overflow; luego se contraen paneles. El canvas no se escala como solución primaria.
9. **Ayuda contextual.** La interfaz enseña en el momento de la acción y se retira cuando ya no es necesaria.
10. **Sin estética de landing.** Superficies neutras, tipografía de sistema, sombras sólo en capas flotantes y ausencia de gradientes decorativos.

## Criterio de congelamiento

La dirección visual puede congelarse después de validar este prototipo en una revisión manual breve con tres tareas reales:

1. crear un participante y un mensaje;
2. editar un fragmento con dos ramas;
3. ejecutar una secuencia corta en modo teclado a 1280 × 800.

No se justifica otra iteración visual integral salvo que esa prueba revele pérdida de contexto, dificultad para descubrir la creación o un ancho insuficiente del inspector. La implementación productiva sí debería hacerse por etapas, manteniendo contratos funcionales y pruebas existentes.
