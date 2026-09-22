# Original User Request

## 2026-09-15T15:51:03Z

Requested team: Equipo completo de agentes (arquitectura, implementación, revisión adversarial y verificación de interfaz visual simultánea)

Replantear y perfeccionar de forma integral la experiencia, robustez y manipulación de los fragmentos combinados (loop, alt, opt, par, critical, break, ref) en los diagramas de secuencia del Modelador de Sistemas.

Working directory: `/Users/alejocarabelli/Documents/Codex/2026-04-29/Modelador de Sistemas`
Integrity mode: development

## Requirements

### R1. Jerarquía y Selección Confiable de Fragmentos Anidados
- Garantizar que los fragmentos padres no bloqueen ni intercepten los eventos de puntero sobre fragmentos anidados (ej. un `opt` dentro de un `loop`).
- Los fragmentos anidados deben ser directamente seleccionables, editables, redimensionables y reordenables sin deselecciones accidentales o interferencias del contenedor exterior.

### R2. Desempaquetado Limpio (Unwrap) de Fragmentos
- Proporcionar una acción clara de "Desempaquetar" (Unwrap) tanto en el inspector de propiedades como mediante atajo de teclado cuando un fragmento esté seleccionado.
- Al desempaquetar, se debe remover el contenedor del fragmento y volcar todos los mensajes y elementos contenidos directamente en el contenedor padre, preservando su orden cronológico exacto y sin desconectar ni perder mensajes.

### R3. Creación Rápida y Envoltorio Intuitivo
- Permitir envolver de forma ágil una selección de mensajes contiguos en cualquier operador de fragmento (`loop`, `alt`, `opt`, `par`, etc.) desde el lienzo y desde el modo teclado.
- Permitir la inserción de fragmentos vacíos en cualquier ranura temporal válida del diagrama o dentro de un operando existente, con asignación inmediata de nombres y condiciones de guarda.

### R4. Reordenamiento Temporal y Fluidez de Arrastre
- El arrastre vertical de fragmentos y mensajes debe operar puramente por ranuras de inserción temporal sin fijar coordenadas verticales artificiales que provoquen saltos o desajustes espaciales.
- Impedir movimientos inválidos (por ejemplo, que un fragmento se inserte dentro de sí mismo o de sus propios hijos).

## Acceptance Criteria

### Selección y Anidamiento
- [ ] Al insertar un fragmento dentro de otro (ej. `opt` dentro de `loop`), hacer clic directamente sobre el fragmento interno lo selecciona a él y no al contenedor padre.
- [ ] El fragmento anidado puede redimensionarse y editarse independientemente de su padre.

### Desempaquetado (Unwrap)
- [ ] Al seleccionar un fragmento que contiene mensajes y ejecutar "Desempaquetar", el fragmento desaparece y todos sus mensajes quedan en la misma posición relativa dentro del flujo padre.
- [ ] Para fragmentos con múltiples operandos (`alt`, `par`), el contenido de todas las ramas se concatena en orden sin pérdida de mensajes.

### Calidad y Verificación Automatizada
- [ ] Toda la suite de pruebas unitarias (`npm test`) se ejecuta y pasa al 100%.
- [ ] El linter (`npm run lint`) pasa con 0 errores.
- [ ] La compilación de producción (`npm run build`) se completa exitosamente sin advertencias críticas de tipos.
- [ ] El runner automatizado de interfaz (`node scripts/runAdvancedSequenceReview.js`) verifica la interacción visual y funcionalidad sin regresiones.
- [ ] La aplicación para macOS se empaqueta e instala en `/Applications/Modelador de Sistemas.app`.

## 2026-09-17T22:33:23Z

# Teamwork Project Prompt — Final

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Equipo multidisciplinario completo (Arquitectura de software senior, QA engineer adversarial, especialista en UX de herramientas de modelado, UML, React/TypeScript, SVG y testing de aplicaciones de escritorio)

Auditoría integral, exhaustiva y profunda del editor de diagramas de secuencia de "Modelador de Sistemas" previa a release, analizando bugs funcionales/visuales/semánticos, UX, consistencia UML, estrés a gran escala, undo/redo, persistencia, exportación y arquitectura sin modificar código.

Working directory: `/Users/alejocarabelli/Documents/Codex/2026-04-29/Modelador de Sistemas`
Integrity mode: development

## Instructions and Guidelines

### Regla Absoluta: No Modificar
- La tarea NO es implementar, corregir ni refactorizar nada.
- NO modifiques código, NO apliques fixes, NO refactorices, NO formatees archivos, NO cambies configuraciones persistentes del repositorio, NO actualices dependencias, NO crees migraciones, NO borres archivos, NO descartes cambios existentes, NO limpies archivos no registrados, NO hagas commits, NO instales una nueva versión de la aplicación, NO reemplaces la aplicación actualmente instalada en `/Applications`, NO publiques nada, NO implementes "mejoras rápidas".
- Si encontrás algo mal, registralo en el informe con evidencia y pasos de reproducción. Nada más.
- Se pueden crear artefactos temporales de testing en scratch/ o fuera del código fuente, pero no deben incorporarse al proyecto ni a git.

## Requirements

### R1. Inspección Inicial y Verificación de Entorno
- Inspeccionar el estado del working tree (`git status`), identificar cambios no commiteados existentes del usuario.
- Identificar la arquitectura real del editor de secuencia: modelo de datos, normalización, análisis semántico, layout, render SVG, interacción, historial, persistencia, exportación, tests existentes y herramientas de verificación visual.
- Determinar qué funcionalidades están realmente conectadas vs código incompleto, muerto o duplicado.
- Ejecutar suite de pruebas (`npm test`), lint (`npm run lint`), build (`npm run build` o `tsc -b && vite build`) y runners visuales existentes sin tocar archivos.

### R2. Auditoría Semántica UML y Ciclo de Vida Temporal
- **Participantes**: iniciales, dinámicos (`create`), destruidos (`destroy`), uso antes de creación, uso tras destrucción, creación duplicada, destrucción duplicada, creación tras destrucción, destrucción antes de creación. Validación, representación, persistencia, undo/redo, reordenamiento.
- **Llamadas y Mensajes**: síncronos, asíncronos, derecha→izquierda, izquierda→derecha, automensajes, múltiples llamadas anidadas, llamadas con/sin retorno, retornos explícitamente asociados, inferidos, ambiguos, retornos huérfanos sin llamada compatible.
- **Activaciones**: activaciones demasiado largas/cortas, que atraviesan ramas erróneamente, que permanecen tras destrucción, manuales vs derivadas, superposiciones ambiguas.
- **Fragmentos combinados**: `alt`, `loop`, `opt`, `par`, `break`, `critical`, `ref`. Vacíos, con un mensaje, con muchos mensajes, múltiples operandos, operandos vacíos, guardas largas/multilínea, anidamiento profundo, mover mensajes dentro/fuera, mover entre operandos, mover fragmentos, redimensionar, resetear geometría, cambiar tipo de fragmento, unwrap. Detectar pérdidas silenciosas de contenido.

### R3. Auditoría de Interacción, Selección, Drag & Drop e Inspector
- **Interacción y Vías Múltiples**: Comparar todas las vías para realizar cada acción (creación de mensajes por clic-clic, drag entre lifelines, atajos, etc.) contrastando defaults, posición temporal, validación, selección e historial.
- **Selección**: simple, múltiple (Shift, Cmd, Ctrl), elementos contiguos, elementos de diferentes contenedores, fragmentos, mensajes, participantes, notas. Estados visualmente seleccionados vs internamente no seleccionados.
- **Drag & Drop**: destinos inválidos/ambiguos, inserciones entre fragmentos, inserciones en operandos vacíos, bordes superior/inferior, movimientos rápidos/lentos/largos, dnd con zoom y scroll. Guía visual vs punto real de inserción.
- **Inspector y Controles**: detectar controles innecesarios, redundantes, con terminología confusa, con impacto nulo o excesivamente técnicos para estudiantes.

### R4. Pruebas de Estrés y Escalabilidad de Layout
- Someter el editor a cargas incrementales y medir fluidez y degradación:
  - **Caso A**: 10 participantes, 50 mensajes.
  - **Caso B**: 20 participantes, 150 mensajes.
  - **Caso C**: 30 participantes, 300 mensajes.
  - **Caso D**: 30+ participantes, 500+ mensajes, fragmentos anidados, notas y automensajes.
- Observar y medir: tiempo inicial de carga, fluidez de scroll/zoom, latencia tras edición, tiempos de cálculo de layout, autosave, undo/redo, ajuste al contenido, superposiciones de etiquetas/guardas, sticky headers y límites prácticos.

### R5. Auditoría de Historial, Persistencia, Exportación, Notas y Referencias
- **Historial (Undo/Redo)**: granularidad lógica, acciones agrupadas indebidamente, pasos inconsistentes, selección post-undo/redo.
- **Persistencia**: ciclo de autosave, cierre y reapertura, detección de pérdida silenciosa de geometrías, activaciones o referencias.
- **Exportación**: paridad visual estricta entre EDITOR vs PNG vs PDF (posiciones, textos, fragmentos, activaciones, notas, saltos de página, truncados).
- **Notas y Referencias**: notas libres y asociadas a elementos, redimensionamiento, movimiento del elemento anclado. Referencias a clases (vínculos válidos/rotos), pasos de flujo de eventos y fragmentos `ref` (destinos válidos, rotos, ciclos).

### R6. Estructura Obligatoria del Informe y Matriz de Hallazgos
- Formato de cada hallazgo:
  - ID: `SEQ-xxx`
  - Título
  - Tipo: Bug funcional | Bug semántico | Bug visual | UX | Rendimiento | Arquitectura | Persistencia | Exportación | Accesibilidad | Deuda técnica | Redundancia | Incongruencia | Riesgo futuro
  - Severidad: ÚNICAMENTE `CRÍTICA` | `ALTA` | `MEDIA` | `BAJA` (sin inflar)
  - Confianza: `Confirmado` | `Muy probable` | `Sospecha`
  - Área afectada
  - Descripción
  - Impacto para el usuario
  - Cómo reproducirlo
  - Resultado actual vs esperado
  - Evidencia concreta (archivo, test, captura, logs, medición)
  - Causa probable
  - Alcance
  - Recomendación conceptual (sin implementar)
- Agrupar causas raíz comunes para evitar reportar decenas de duplicados.
- Estructurar el informe final exactamente en las 30 secciones requeridas:
  1. Resumen ejecutivo
  2. Alcance realmente probado
  3. Entorno y estado inicial
  4. Matriz de pruebas realizadas
  5. Hallazgos críticos
  6. Hallazgos altos
  7. Hallazgos medios
  8. Hallazgos bajos
  9. Incongruencias de comportamiento
  10. Problemas de UX
  11. Cosas que sobran
  12. Cosas mal diseñadas o mal planteadas
  13. Diagramas extensos y escalabilidad
  14. Semántica UML y ciclo de vida
  15. Fragmentos y ramas
  16. Activaciones
  17. Historial
  18. Persistencia
  19. Exportación
  20. Accesibilidad y teclado
  21. Arquitectura y deuda técnica
  22. Código potencialmente muerto, redundante o incompleto
  23. Riesgos que todavía no son bugs
  24. Pruebas que faltan
  25. Top de áreas que requieren atención (ordenado por severidad/impacto/frecuencia)
  26. Dependencias entre problemas
  27. Preguntas o decisiones de producto pendientes
  28. Anexo de ejecución (Comandos, Tests ejecutados, aprobados, fallidos, Typecheck/lint, Build, Pruebas visuales, Diagramas de estrés, Exportaciones verificadas)
  29. Archivos modificados (DEBE DECIR: `Ninguno`)
  30. Conclusión y próximos pasos recomendados

## Acceptance Criteria

### Integridad del Código y Working Tree
- [ ] Ningún archivo del repositorio ha sido modificado, formateado, eliminado o commiteado (`git status` idéntico antes y después).
- [ ] La sección "Archivos modificados" del anexo indica exactamente: `Ninguno`.

### Rigor de Diagnóstico y Evidencia
- [ ] Cada hallazgo incluye evidencia concreta y reproducible respaldada por pruebas de código, tests o ejecución interactiva/visual.
- [ ] Los problemas derivados de una misma causa raíz están agrupados coherentemente bajo un identificador principal.
- [ ] Las severidades se adhieren estrictamente a las cuatro categorías autorizadas (CRÍTICA, ALTA, MEDIA, BAJA).

### Pruebas de Estrés
- [ ] Se evaluaron los cuatro escenarios A, B, C y D (hasta 500+ mensajes) con registro de fluidez, tiempos de render y comportamiento de layout.

### Validación de Exportación y Persistencia
- [ ] Se ejecutaron comparativas directas Editor vs PNG vs PDF para diagramas pequeños, medianos y grandes.
- [ ] Se verificó el ciclo de guardado/reapertura y su impacto sobre geometrías y referencias.

### Estructura del Entregable
- [ ] El informe final cumple fielmente con las 30 secciones solicitadas y su contenido diagnóstico exhaustivo.

