// Pasa un artefacto del Modelador a texto plano para que Claude lo lea.
// Deja afuera todo lo que es dibujo (posiciones, tamaños, colores, rutas) y
// conserva el modelo tal cual: no interpreta, no corrige, no completa.

const TIPOS = {
  'class-diagram': 'Diagrama de clases',
  'class-sequence-diagram': 'Clases de secuencias',
  'use-case-model': 'Modelo de casos de uso',
  'use-case-flow': 'Flujo de sucesos',
  'sequence-diagram': 'Diagrama de secuencia',
};

export const nombreDeTipo = (tipo) => TIPOS[tipo] ?? tipo;

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');
const lista = (valor) => (Array.isArray(valor) ? valor : []);

export function resumirArtefacto(artefacto, proyecto) {
  const contenido = artefacto?.content ?? {};
  const lineas = [`# ${nombreDeTipo(artefacto.type)}: ${texto(artefacto.name) || '(sin nombre)'}`];
  if (artefacto.updatedAt) lineas.push(`Última modificación: ${artefacto.updatedAt}`);
  lineas.push('');

  switch (artefacto.type) {
    case 'class-diagram':
      lineas.push(...resumirClases(contenido));
      break;
    case 'class-sequence-diagram':
      lineas.push(...resumirVinculos(contenido, proyecto));
      lineas.push(...resumirClases(contenido));
      break;
    case 'use-case-model':
      lineas.push(...resumirCasosDeUso(contenido));
      break;
    case 'use-case-flow':
      lineas.push(...resumirFlujo(contenido));
      break;
    case 'sequence-diagram':
      lineas.push(...resumirSecuencia(contenido, proyecto));
      break;
    default:
      lineas.push('Tipo de artefacto desconocido; pedí el JSON completo para verlo.');
  }

  const apuntes = resumirApuntes(artefacto.notebook);
  if (apuntes.length > 0) lineas.push('', '## Apuntes del estudiante (no son parte del modelo)', ...apuntes);

  return lineas.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------
// Diagrama de clases y clases de secuencias

function miembroEstatico(miembro, linea) {
  return miembro.isStatic ? `${linea} {estático}` : linea;
}

function resumirClases(contenido) {
  const nodos = lista(contenido.nodes);
  const nombres = new Map(nodos.map((nodo) => [nodo.id, texto(nodo.data?.name) || '(clase sin nombre)']));
  const lineas = [`## Clases (${nodos.length})`];

  for (const nodo of nodos) {
    const datos = nodo.data ?? {};
    lineas.push('', `### ${nombres.get(nodo.id)}`);
    if (texto(datos.description)) lineas.push(`Descripción: ${texto(datos.description)}`);
    const atributos = lista(datos.attributes);
    const metodos = lista(datos.methods);
    if (atributos.length === 0 && metodos.length === 0) lineas.push('(sin atributos ni métodos)');
    for (const atributo of atributos) {
      const tipo = texto(atributo.type);
      lineas.push(miembroEstatico(atributo, `- atributo ${texto(atributo.name)}${tipo ? `: ${tipo}` : ''}`));
    }
    for (const metodo of metodos) {
      const visibilidad = metodo.visibility ? `${metodo.visibility} ` : '';
      const retorno = texto(metodo.returnType);
      lineas.push(miembroEstatico(metodo, `- método ${visibilidad}${texto(metodo.name)}(${texto(metodo.parameters)})${retorno ? `: ${retorno}` : ''}`));
    }
    const valores = lista(datos.parametricValues).map((valor) => texto(valor.value)).filter(Boolean);
    if (datos.hasParametricValuesNote && valores.length > 0) lineas.push(`Nota de valores paramétricos: ${valores.join(', ')}`);
    if (datos.hideAttributes) lineas.push('(los atributos están ocultos en el dibujo)');
    if (datos.hideMethods) lineas.push('(los métodos están ocultos en el dibujo)');
  }

  const aristas = lista(contenido.edges);
  lineas.push('', `## Relaciones (${aristas.length})`);
  if (aristas.length === 0) lineas.push('(ninguna)');
  for (const arista of aristas) lineas.push(`- ${describirRelacionDeClases(arista, nombres)}`);
  return lineas;
}

function describirRelacionDeClases(arista, nombres) {
  const datos = arista.data ?? {};
  const origen = nombres.get(arista.source) ?? `(nodo ${arista.source} inexistente)`;
  const destino = nombres.get(arista.target) ?? `(nodo ${arista.target} inexistente)`;
  const tipo = datos.relationType ?? 'association';
  const nombre = texto(datos.name);
  const conNombre = (linea) => (nombre ? `${linea}, con nombre "${nombre}"` : linea);

  if (tipo === 'generalization' || tipo === 'realization') {
    const [hija, padre] = (datos.triangleEnd ?? 'target') === 'target' ? [origen, destino] : [destino, origen];
    const verbo = tipo === 'generalization' ? 'hereda de (generalización)' : 'realiza la interfaz';
    return conNombre(`${hija} ${verbo} ${padre}`);
  }
  if (tipo === 'dependency') return conNombre(`${origen} depende de ${destino} (dependencia)`);

  const extremo = (clase, multiplicidad, rol) => {
    const partes = [clase];
    if (texto(multiplicidad)) partes.push(`[${texto(multiplicidad)}]`);
    if (texto(rol)) partes.push(`rol "${texto(rol)}"`);
    return partes.join(' ');
  };
  const izquierda = extremo(origen, datos.sourceMultiplicity, datos.sourceRole);
  const derecha = extremo(destino, datos.targetMultiplicity, datos.targetRole);

  if (tipo === 'aggregation' || tipo === 'composition') {
    const [todo, parte] = (datos.diamondEnd ?? 'source') === 'source' ? [izquierda, derecha] : [derecha, izquierda];
    const palabra = tipo === 'composition' ? 'composición' : 'agregación';
    return conNombre(`${palabra}: el todo es ${todo}; la parte es ${parte}`);
  }

  const navegabilidad = {
    'source-to-target': `navegable de ${origen} a ${destino}`,
    'target-to-source': `navegable de ${destino} a ${origen}`,
    bidirectional: 'navegable en ambos sentidos',
    none: 'sin navegabilidad indicada',
  }[datos.navigability ?? 'none'] ?? 'sin navegabilidad indicada';
  return conNombre(`asociación ${izquierda} — ${derecha}, ${navegabilidad}`);
}

function resumirVinculos(contenido, proyecto) {
  const nombres = new Map(lista(proyecto?.artifacts).map((a) => [a.id, texto(a.name)]));
  const vinculadas = lista(contenido.linkedSequenceDiagramIds).map((id) => nombres.get(id) ?? `(secuencia ${id} inexistente)`);
  const lineas = [`Armado a partir de las secuencias: ${vinculadas.length > 0 ? vinculadas.join(', ') : '(ninguna vinculada)'}`];
  if (contenido.sourceClassDiagramArtifactId) {
    lineas.push(`Diagrama de clases de origen: ${nombres.get(contenido.sourceClassDiagramArtifactId) ?? '(inexistente)'}`);
  }
  lineas.push('');
  return lineas;
}

// ---------------------------------------------------------------------------
// Modelo de casos de uso

function resumirCasosDeUso(contenido) {
  const nodos = lista(contenido.nodes);
  const nombre = (nodo) => texto(nodo.data?.name) || '(sin nombre)';
  const nombres = new Map(nodos.map((nodo) => [nodo.id, nombre(nodo)]));
  const deTipo = (kind) => nodos.filter((nodo) => nodo.data?.kind === kind).map(nombre);

  const lineas = [];
  const limites = deTipo('system-boundary');
  if (limites.length > 0) lineas.push(`Límite del sistema: ${limites.join(', ')}`);
  lineas.push(`Actores: ${deTipo('actor').join(', ') || '(ninguno)'}`);
  lineas.push(`Casos de uso: ${deTipo('use-case').join(', ') || '(ninguno)'}`);

  const aristas = lista(contenido.edges);
  lineas.push('', `## Relaciones (${aristas.length})`);
  if (aristas.length === 0) lineas.push('(ninguna)');
  for (const arista of aristas) {
    const origen = nombres.get(arista.source) ?? `(nodo ${arista.source} inexistente)`;
    const destino = nombres.get(arista.target) ?? `(nodo ${arista.target} inexistente)`;
    const etiqueta = texto(arista.data?.label) ? ` (etiqueta "${texto(arista.data.label)}")` : '';
    const linea = {
      include: `${origen} «include» ${destino}`,
      extend: `${origen} «extend» ${destino}`,
      generalization: `${origen} es una especialización de ${destino} (generalización)`,
    }[arista.data?.relationType] ?? `${origen} — ${destino} (asociación)`;
    lineas.push(`- ${linea}${etiqueta}`);
  }
  return lineas;
}

// ---------------------------------------------------------------------------
// Flujo de sucesos

const CAMPOS_DEL_ENCABEZADO = [
  ['useCaseNumber', 'Número'],
  ['useCaseName', 'Caso de uso'],
  ['actor', 'Actor'],
  ['description', 'Descripción'],
  ['priority', 'Prioridad'],
  ['inputParameters', 'Parámetros de entrada'],
  ['precondition', 'Precondición'],
  ['postcondition', 'Poscondición'],
  ['initialState', 'Estado inicial'],
  ['finalState', 'Estado final'],
];

// Cada fila del flujo trae sus números escritos en el texto ("1. El actor…"),
// así que se transcribe tal cual, sin numerar de nuevo.
function filas(lineasDelFlujo) {
  if (lineasDelFlujo.length === 0) return ['(vacío)'];
  return lineasDelFlujo.map((fila) => {
    const partes = [];
    if (texto(fila.actor)) partes.push(`Actor: ${texto(fila.actor)}`);
    if (texto(fila.system)) partes.push(`Sistema: ${texto(fila.system)}`);
    if (texto(fila.ref)) partes.push(`deriva a ${texto(fila.ref)}`);
    return `- ${partes.join(' | ') || '(fila vacía)'}`;
  });
}

function resumirFlujo(contenido) {
  const descripcion = contenido.description ?? {};
  const lineas = CAMPOS_DEL_ENCABEZADO
    .filter(([campo]) => texto(descripcion[campo]))
    .map(([campo, rotulo]) => `${rotulo}: ${texto(descripcion[campo])}`);

  lineas.push('', '## Camino básico', ...filas(lista(contenido.basicFlow)));
  for (const alternativo of lista(contenido.alternativeFlows)) {
    const titulo = [texto(alternativo.code), texto(alternativo.name)].filter(Boolean).join(' · ') || '(camino sin nombre)';
    lineas.push('', `## Camino alternativo ${titulo}`, ...filas(lista(alternativo.steps)));
  }
  return lineas;
}

// ---------------------------------------------------------------------------
// Diagrama de secuencia

const TIPOS_DE_PARTICIPANTE = {
  actor: 'actor',
  boundary: 'interfaz',
  control: 'control',
  entity: 'entidad',
  object: 'objeto',
};

function resumirSecuencia(contenido, proyecto) {
  const artefactos = new Map(lista(proyecto?.artifacts).map((a) => [a.id, texto(a.name)]));
  const participantes = lista(contenido.participants);
  const rotulo = (participante) => {
    const nombre = texto(participante.name);
    const clase = texto(participante.classifierName);
    return clase ? `${nombre}:${clase}` : nombre || '(sin nombre)';
  };
  const nombres = new Map(participantes.map((p) => [p.id, rotulo(p)]));

  const lineas = [];
  if (contenido.flowArtifactId) lineas.push(`Flujo de sucesos asociado: ${artefactos.get(contenido.flowArtifactId) ?? '(inexistente)'}`);
  if (contenido.classDiagramArtifactId) lineas.push(`Diagrama de clases asociado: ${artefactos.get(contenido.classDiagramArtifactId) ?? '(inexistente)'}`);
  lineas.push(`Numeración en el dibujo: ${{ sequential: 'secuencial', hierarchical: 'jerárquica', none: 'sin números' }[contenido.numbering] ?? 'secuencial'}`);

  lineas.push('', `## Participantes (de izquierda a derecha, ${participantes.length})`);
  const ordenados = [...participantes].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  for (const participante of ordenados) {
    lineas.push(`- ${nombres.get(participante.id)} (${TIPOS_DE_PARTICIPANTE[participante.kind] ?? participante.kind})`);
  }

  lineas.push('', '## Mensajes en orden', '(los números son el orden de aparición; el dibujo puede numerarlos distinto)');
  const numeros = new Map();
  let contador = 0;
  const recorrer = (items, sangria) => {
    for (const item of lista(items)) {
      if (item.kind === 'fragment') {
        lineas.push(...describirFragmento(item, sangria, artefactos));
        lista(item.operands).forEach((operando, indice) => {
          if (item.operator !== 'ref') {
            const guarda = texto(operando.guard) ? `[${texto(operando.guard)}]` : '(sin guarda)';
            lineas.push(`${sangria}  ${indice === 0 ? 'operando' : 'else'} ${guarda}`);
          }
          recorrer(operando.items, `${sangria}    `);
        });
        lineas.push(`${sangria}fin ${item.operator}`);
        continue;
      }
      contador += 1;
      numeros.set(item.id, contador);
      lineas.push(`${sangria}${contador}. ${describirMensaje(item, nombres, numeros)}`);
    }
  };
  recorrer(contenido.items, '');
  if (contador === 0 && lista(contenido.items).length === 0) lineas.push('(sin mensajes)');

  const notas = lista(contenido.notes).filter((nota) => texto(nota.text));
  if (notas.length > 0) {
    lineas.push('', '## Notas en el diagrama');
    for (const nota of notas) {
      const ancla = nota.anchorKind === 'message' && numeros.has(nota.anchorId)
        ? ` (sobre el mensaje ${numeros.get(nota.anchorId)})`
        : nota.anchorKind === 'participant' && nombres.has(nota.anchorId)
          ? ` (sobre ${nombres.get(nota.anchorId)})`
          : '';
      lineas.push(`- ${texto(nota.text)}${ancla}`);
    }
  }

  const problemas = lista(contenido.problems);
  if (problemas.length > 0) {
    lineas.push('', '## Avisos que muestra la app');
    for (const problema of problemas) lineas.push(`- ${problema.severity === 'error' ? 'Error' : 'Advertencia'}: ${texto(problema.message)}`);
  }
  return lineas;
}

const OPERADORES = {
  alt: 'alternativa',
  loop: 'bucle',
  opt: 'opcional',
  par: 'paralelo',
  break: 'corte',
  critical: 'región crítica',
  ref: 'referencia a otra interacción',
};

function describirFragmento(fragmento, sangria, artefactos) {
  const nombre = texto(fragmento.name);
  if (fragmento.operator === 'ref') {
    const enlace = fragmento.interactionArtifactId
      ? ` → secuencia "${artefactos.get(fragmento.interactionArtifactId) ?? '(inexistente)'}"`
      : ' (sin vincular)';
    return [`${sangria}ref ${nombre || '(sin nombre)'}${enlace}`];
  }
  return [`${sangria}fragmento ${fragmento.operator} (${OPERADORES[fragmento.operator] ?? fragmento.operator})${nombre ? ` "${nombre}"` : ''}`];
}

function describirMensaje(mensaje, nombres, numeros) {
  const origen = nombres.get(mensaje.sourceId) ?? '(participante inexistente)';
  const destino = nombres.get(mensaje.targetId) ?? '(participante inexistente)';
  const nombre = texto(mensaje.name);
  const argumentos = texto(mensaje.parameterValues) || texto(mensaje.arguments);
  const retorno = texto(mensaje.returnType);
  const referencia = texto(mensaje.flowReference) ? `  [paso del flujo: ${texto(mensaje.flowReference)}]` : '';

  switch (mensaje.type) {
    case 'return': {
      const respuesta = numeros.has(mensaje.replyToMessageId) ? ` (responde al ${numeros.get(mensaje.replyToMessageId)})` : '';
      return `${origen} --> ${destino}: retorno ${nombre || retorno || '(sin valor)'}${respuesta}${referencia}`;
    }
    case 'create':
      return `${origen} → ${destino}: «create»${nombre || argumentos ? ` ${nombre}(${argumentos})` : ''}${referencia}`;
    case 'destroy':
      return `${origen} → ${destino}: «destroy»${referencia}`;
    default: {
      const firma = `${nombre || '(sin nombre)'}(${argumentos})${retorno ? `: ${retorno}` : ''}`;
      const tipo = mensaje.type === 'asynchronous' ? ' [asincrónico]' : '';
      const propio = mensaje.sourceId === mensaje.targetId ? ' [a sí mismo]' : '';
      return `${origen} → ${destino}: ${firma}${tipo}${propio}${referencia}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Apuntes (cuaderno privado del artefacto)

export function resumirApuntes(cuaderno) {
  const lineas = [];
  for (const bloque of lista(cuaderno?.blocks)) {
    if (bloque.kind === 'text' && texto(bloque.text)) lineas.push(`- Apunte: ${texto(bloque.text)}`);
    if (bloque.kind === 'question' && texto(bloque.text)) {
      lineas.push(`- Duda ${bloque.resolved ? '(resuelta)' : '(pendiente)'}: ${texto(bloque.text)}`);
    }
    if (bloque.kind === 'sketch') {
      const textos = lista(bloque.shapes).filter((forma) => forma.kind === 'text' && texto(forma.text)).map((forma) => texto(forma.text));
      lineas.push(`- Boceto a mano${textos.length > 0 ? ` con los textos: ${textos.join(' / ')}` : ' (sin texto legible)'}`);
    }
  }
  return lineas;
}
