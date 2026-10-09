#!/usr/bin/env node
// Servidor MCP (stdio) para que Claude Desktop lea lo que estás haciendo en el
// Modelador de Sistemas. Solo lectura y sin dependencias: habla JSON-RPC por
// stdin/stdout, un mensaje por línea, como pide el transporte stdio de MCP.

import { createInterface } from 'node:readline';
import { leerDatosEnVivo } from './enVivo.js';
import { antiguedad, buscar, leerUltimoRespaldo, loQueEstaAbierto, proyectosDe } from './respaldos.js';
import { nombreDeTipo, resumirApuntes, resumirArtefacto } from './resumen.js';

const VERSION = '0.1.1';

const ARGUMENTOS_DE_ARTEFACTO = {
  type: 'object',
  properties: {
    artefacto: { type: 'string', description: 'Nombre (o parte del nombre) o ID del artefacto.' },
    proyecto: { type: 'string', description: 'Nombre o ID del proyecto. Si falta, el último proyecto en el que trabajó.' },
  },
  required: ['artefacto'],
};

const HERRAMIENTAS = [
  {
    name: 'ver_lo_que_estoy_haciendo',
    description:
      'Muestra el artefacto que el estudiante tiene abierto ahora en el Modelador de Sistemas (diagrama de clases, casos de uso, flujo de sucesos, secuencia o clases de secuencias), resumido en texto, con sus apuntes y dudas. Usala primero cuando pregunte por "esto", "mi diagrama" o lo que está haciendo.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'listar_proyectos',
    description: 'Lista los proyectos del Modelador de Sistemas con sus artefactos (tipo, nombre y última modificación).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'leer_artefacto',
    description:
      'Lee otro artefacto del proyecto, resumido en texto. Sirve para comparar, por ejemplo, una secuencia con su flujo de sucesos o con el diagrama de clases.',
    inputSchema: ARGUMENTOS_DE_ARTEFACTO,
  },
  {
    name: 'leer_mis_dudas',
    description: 'Junta las dudas y apuntes que el estudiante escribió en todos los artefactos de un proyecto.',
    inputSchema: {
      type: 'object',
      properties: { proyecto: ARGUMENTOS_DE_ARTEFACTO.properties.proyecto },
    },
  },
  {
    name: 'leer_artefacto_json',
    description:
      'Devuelve el JSON completo de un artefacto, con posiciones y datos de dibujo. Es mucho más largo: usala solo si el resumen no alcanza para responder.',
    inputSchema: ARGUMENTOS_DE_ARTEFACTO,
  },
].map((herramienta) => ({ ...herramienta, annotations: { readOnlyHint: true, openWorldHint: false } }));

// Primero lo que la app está guardando ahora; si no se encuentra (otra versión
// de macOS, la app nunca abierta), el último respaldo de Documentos.
async function leerDatos() {
  let enVivo = null;
  try {
    enVivo = await leerDatosEnVivo();
  } catch {
    // Datos en vivo ilegibles: se sigue con los respaldos.
  }
  if (enVivo) return { enVivo: true, modificado: enVivo.modificado, proyectos: proyectosDe(enVivo.datos) };
  const respaldo = await leerUltimoRespaldo();
  return { enVivo: false, modificado: respaldo.modificado, proyectos: respaldo.proyectos };
}

function encabezado(datos) {
  const hora = datos.modificado.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  if (datos.enVivo) return `(Datos en vivo de la app, guardados por última vez a las ${hora}, ${antiguedad(datos.modificado)}.)`;
  return [
    `(No se encontraron los datos en vivo de la app; esto es el último respaldo automático, de las ${hora}, ${antiguedad(datos.modificado)}.`,
    ' Puede no incluir los últimos minutos de trabajo.)',
  ].join('');
}

function elegirProyecto(proyectos, consulta) {
  if (!consulta) return loQueEstaAbierto(proyectos)?.proyecto ?? null;
  const proyecto = buscar(proyectos, consulta);
  if (!proyecto) throw new Error(`No hay un proyecto "${consulta}". Proyectos: ${proyectos.map((p) => p.name).join(', ')}.`);
  return proyecto;
}

function elegirArtefacto(proyecto, consulta) {
  const artefactos = proyecto.artifacts ?? [];
  const artefacto = buscar(artefactos, consulta);
  if (!artefacto) {
    throw new Error(`En "${proyecto.name}" no hay un artefacto "${consulta}". Artefactos: ${artefactos.map((a) => a.name).join(', ')}.`);
  }
  return artefacto;
}

async function ejecutar(nombre, argumentos = {}) {
  const datos = await leerDatos();
  const { proyectos } = datos;
  if (proyectos.length === 0) return 'No hay proyectos en el Modelador de Sistemas.';

  switch (nombre) {
    case 'ver_lo_que_estoy_haciendo': {
      const abierto = loQueEstaAbierto(proyectos);
      if (!abierto?.artefacto) return `${encabezado(datos)}\n\nEl proyecto "${abierto?.proyecto?.name}" no tiene artefactos todavía.`;
      const otros = abierto.proyecto.artifacts
        .filter((a) => a.id !== abierto.artefacto.id)
        .map((a) => `${nombreDeTipo(a.type)} "${a.name}"`);
      return [
        encabezado(datos),
        '',
        `Proyecto: ${abierto.proyecto.name}`,
        otros.length > 0 ? `Otros artefactos del proyecto (se leen con leer_artefacto): ${otros.join('; ')}` : '',
        '',
        resumirArtefacto(abierto.artefacto, abierto.proyecto),
      ].join('\n');
    }
    case 'listar_proyectos': {
      const abierto = loQueEstaAbierto(proyectos);
      const lineas = [encabezado(datos)];
      for (const proyecto of proyectos) {
        lineas.push('', `## ${proyecto.name}${proyecto === abierto?.proyecto ? ' (el último en que trabajó)' : ''}`);
        for (const artefacto of proyecto.artifacts ?? []) {
          const marca = proyecto === abierto?.proyecto && artefacto === abierto.artefacto ? ' ← abierto' : '';
          lineas.push(`- ${nombreDeTipo(artefacto.type)}: ${artefacto.name} (modificado ${artefacto.updatedAt ?? '¿?'})${marca}`);
        }
      }
      return lineas.join('\n');
    }
    case 'leer_artefacto': {
      const proyecto = elegirProyecto(proyectos, argumentos.proyecto);
      return `${encabezado(datos)}\n\n${resumirArtefacto(elegirArtefacto(proyecto, argumentos.artefacto), proyecto)}`;
    }
    case 'leer_artefacto_json': {
      const proyecto = elegirProyecto(proyectos, argumentos.proyecto);
      return `${encabezado(datos)}\n\n${JSON.stringify(elegirArtefacto(proyecto, argumentos.artefacto))}`;
    }
    case 'leer_mis_dudas': {
      const proyecto = elegirProyecto(proyectos, argumentos.proyecto);
      const lineas = [encabezado(datos), '', `Apuntes y dudas del proyecto "${proyecto.name}":`];
      let hay = false;
      for (const artefacto of proyecto.artifacts ?? []) {
        const apuntes = resumirApuntes(artefacto.notebook);
        if (apuntes.length === 0) continue;
        hay = true;
        lineas.push('', `## ${nombreDeTipo(artefacto.type)}: ${artefacto.name}`, ...apuntes);
      }
      if (!hay) lineas.push('', '(No escribió apuntes ni dudas en este proyecto.)');
      return lineas.join('\n');
    }
    default:
      throw new Error(`Herramienta desconocida: ${nombre}`);
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC por stdio

const responder = (mensaje) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...mensaje })}\n`);

async function atender(pedido) {
  const { id, method, params } = pedido;
  const esNotificacion = id === undefined || id === null;

  switch (method) {
    case 'initialize':
      return responder({
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'modelador-de-sistemas', version: VERSION },
          instructions:
            'Herramientas para ver el trabajo del estudiante en el Modelador de Sistemas (materia Diseño de Sistemas). Leen lo que la app tiene guardado en este Mac; no pueden modificar nada. Al hablar de un mensaje de una secuencia, nombralo por su texto, sus participantes y el fragmento donde está; no le pongas números, porque el estudiante no los usa.',
        },
      });
    case 'ping':
      return responder({ id, result: {} });
    case 'tools/list':
      return responder({ id, result: { tools: HERRAMIENTAS } });
    case 'tools/call':
      try {
        const texto = await ejecutar(params?.name, params?.arguments);
        return responder({ id, result: { content: [{ type: 'text', text: texto }] } });
      } catch (error) {
        return responder({ id, result: { content: [{ type: 'text', text: error.message }], isError: true } });
      }
    default:
      if (!esNotificacion) responder({ id, error: { code: -32601, message: `Método no soportado: ${method}` } });
  }
}

createInterface({ input: process.stdin }).on('line', (linea) => {
  if (!linea.trim()) return;
  let pedido;
  try {
    pedido = JSON.parse(linea);
  } catch {
    responder({ id: null, error: { code: -32700, message: 'JSON inválido' } });
    return;
  }
  atender(pedido).catch((error) => process.stderr.write(`${error.stack ?? error}\n`));
});
