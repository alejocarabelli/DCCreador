import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buscar, leerUltimoRespaldo, loQueEstaAbierto } from '../server/respaldos.js';
import { resumirArtefacto } from '../server/resumen.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const demo = JSON.parse(await readFile(join(aqui, '../../fixtures/demo-gestion-tramites.json'), 'utf8'));

const clase = (id, name, extra = {}) => ({ id, type: 'classNode', position: { x: 0, y: 0 }, data: { name, attributes: [], methods: [], ...extra } });
const relacion = (source, target, data) => ({ id: `${source}-${target}`, source, target, data: { name: '', sourceMultiplicity: '', targetMultiplicity: '', sourceRole: '', targetRole: '', navigability: 'none', ...data } });

test('las relaciones de clases dicen quién es el padre y quién es el todo', () => {
  const texto = resumirArtefacto({
    type: 'class-diagram',
    name: 'Clases',
    content: {
      nodes: [clase('a', 'Persona'), clase('b', 'Alumno', { attributes: [{ id: 'x', name: 'total', type: 'int', isStatic: true }] }), clase('c', 'Curso'), clase('d', 'Clase')],
      edges: [
        relacion('b', 'a', { relationType: 'generalization' }),
        relacion('a', 'b', { relationType: 'generalization', triangleEnd: 'source' }),
        relacion('c', 'd', { relationType: 'composition', diamondEnd: 'source', targetMultiplicity: '1..*' }),
        relacion('c', 'a', { navigability: 'target-to-source', sourceRole: 'cursos' }),
      ],
    },
  });
  assert.match(texto, /- Alumno hereda de \(generalización\) Persona\n- Alumno hereda de \(generalización\) Persona/);
  assert.match(texto, /composición: el todo es Curso; la parte es Clase \[1\.\.\*\]/);
  assert.match(texto, /asociación Curso rol "cursos" — Persona, navegable de Persona a Curso/);
  assert.match(texto, /atributo total: int {estático}/);
  assert.doesNotMatch(texto, /position|"x"/);
});

test('la secuencia conserva el orden, los fragmentos, los retornos y los avisos de la app', () => {
  const mensaje = (id, sourceId, targetId, name, extra = {}) => ({ id, kind: 'message', type: 'synchronous', sourceId, targetId, name, arguments: '', parameterValues: '', returnType: '', flowReference: '', ...extra });
  const texto = resumirArtefacto({
    type: 'sequence-diagram',
    name: 'Seq',
    content: {
      numbering: 'hierarchical',
      participants: [
        { id: 'g', kind: 'control', name: '', classifierName: 'Gestor', x: 200 },
        { id: 'p', kind: 'boundary', name: '', classifierName: 'Pantalla', x: 100 },
      ],
      items: [
        mensaje('m1', 'p', 'g', 'buscar', { arguments: 'dni' }),
        {
          id: 'f', kind: 'fragment', operator: 'alt', name: '',
          operands: [
            { id: 'o1', guard: 'existe', items: [mensaje('m2', 'g', 'p', 'mostrar')] },
            { id: 'o2', guard: '', items: [mensaje('m3', 'g', 'g', 'crear', { type: 'create' })] },
          ],
        },
        mensaje('m4', 'g', 'p', '', { type: 'return', replyToMessageId: 'm1', returnType: 'Persona' }),
      ],
      notes: [{ id: 'n', text: 'Revisar', anchorKind: 'message', anchorId: 'm2' }],
      problems: [{ id: 'e', code: 'unnamed-message', severity: 'warning', message: 'Hay un mensaje sin nombre.' }],
    },
  });
  assert.match(texto, /- :Pantalla \(interfaz\)\n- :Gestor \(control\)/);
  assert.match(texto, /1\. :Pantalla → :Gestor: buscar\(dni\)/);
  assert.match(texto, /fragmento alt \(alternativa\)\n {2}operando \[existe\]\n {4}2\. :Gestor → :Pantalla: mostrar\(\)\n {2}else \(sin guarda\)\n {4}3\. :Gestor → :Gestor: «create» crear\(\)\nfin alt/);
  assert.match(texto, /4\. :Gestor --> :Pantalla: retorno Persona \(responde al 1\)/);
  assert.match(texto, /- Revisar \(sobre el mensaje 2\)/);
  assert.match(texto, /Advertencia: Hay un mensaje sin nombre\./);
  assert.match(texto, /Numeración en el dibujo: jerárquica/);
});

test('los apuntes se separan del modelo y marcan las dudas pendientes', () => {
  const texto = resumirArtefacto({
    type: 'use-case-model',
    name: 'CU',
    content: { nodes: [], edges: [] },
    notebook: {
      version: 1,
      blocks: [
        { id: '1', kind: 'question', text: '¿Include o extend?', resolved: false },
        { id: '2', kind: 'question', text: '¿Actor secundario?', resolved: true },
        { id: '3', kind: 'sketch', height: 100, shapes: [{ id: 's', kind: 'text', color: 'ink', x: 0, y: 0, text: 'Cajero' }] },
      ],
    },
  });
  assert.match(texto, /## Apuntes del estudiante \(no son parte del modelo\)/);
  assert.match(texto, /Duda \(pendiente\): ¿Include o extend\?/);
  assert.match(texto, /Duda \(resuelta\): ¿Actor secundario\?/);
  assert.match(texto, /Boceto a mano con los textos: Cajero/);
});

test('el resumen de cada diagrama de ejemplo ocupa bastante menos que su JSON', () => {
  // El flujo de sucesos ya es casi todo texto: ahí el resumen ahorra poco.
  for (const artefacto of demo.artifacts.filter((a) => a.type !== 'use-case-flow')) {
    const resumen = resumirArtefacto(artefacto, demo);
    assert.ok(resumen.length < JSON.stringify(artefacto).length * 0.6, `${artefacto.type}: ${resumen.length} vs ${JSON.stringify(artefacto).length}`);
  }
});

test('elige el respaldo más nuevo y el artefacto abierto del último proyecto', async () => {
  const carpeta = await mkdtemp(join(tmpdir(), 'respaldos-'));
  const viejo = { ...demo, id: 'viejo', name: 'Viejo', updatedAt: '2020-01-01T00:00:00.000Z' };
  await writeFile(join(carpeta, 'respaldo-a.json'), JSON.stringify({ version: 2, projects: [viejo] }));
  await writeFile(join(carpeta, 'respaldo-b.json'), JSON.stringify({ version: 2, projects: [viejo, demo] }));
  await writeFile(join(carpeta, 'recuperacion-c.json'), '{}');
  await utimes(join(carpeta, 'respaldo-a.json'), new Date(1000), new Date(1000));

  const respaldo = await leerUltimoRespaldo(carpeta);
  assert.equal(respaldo.proyectos.length, 2);
  const abierto = loQueEstaAbierto(respaldo.proyectos);
  assert.equal(abierto.proyecto.name, 'Gestión de trámites');
  assert.equal(abierto.artefacto.id, demo.activeArtifactId);
  assert.equal(buscar(demo.artifacts, 'cambio de ESTADO').type, 'use-case-flow');
  assert.equal(buscar(demo.artifacts, 'tramites'), null);

  await assert.rejects(leerUltimoRespaldo(join(carpeta, 'no-existe')), /No encontré la carpeta/);
});

test('responde el protocolo MCP por stdio', async () => {
  const carpeta = await mkdtemp(join(tmpdir(), 'respaldos-'));
  await writeFile(join(carpeta, 'respaldo-1.json'), JSON.stringify({ version: 2, projects: [demo] }));
  const servidor = spawn(process.execPath, [join(aqui, '../server/index.js')], { env: { ...process.env, MODELADOR_RESPALDOS: carpeta } });

  const pedidos = [
    { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } } },
    { method: 'notifications/initialized' },
    { id: 2, method: 'tools/list' },
    { id: 3, method: 'tools/call', params: { name: 'ver_lo_que_estoy_haciendo', arguments: {} } },
    { id: 4, method: 'tools/call', params: { name: 'leer_artefacto', arguments: { artefacto: 'no existe' } } },
    { id: 5, method: 'algo/raro' },
  ];
  const respuestas = await new Promise((resolver, rechazar) => {
    let salida = '';
    servidor.stdout.on('data', (parte) => {
      salida += parte;
      const lineas = salida.trim().split('\n');
      if (lineas.length === 5) {
        servidor.kill();
        resolver(lineas.map((linea) => JSON.parse(linea)));
      }
    });
    servidor.on('error', rechazar);
    for (const pedido of pedidos) servidor.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...pedido })}\n`);
  });
  const porId = new Map(respuestas.map((r) => [r.id, r]));

  assert.equal(porId.get(1).result.serverInfo.name, 'modelador-de-sistemas');
  assert.deepEqual(porId.get(2).result.tools.map((t) => t.name), ['ver_lo_que_estoy_haciendo', 'listar_proyectos', 'leer_artefacto', 'leer_mis_dudas', 'leer_artefacto_json']);
  assert.match(porId.get(3).result.content[0].text, /Proyecto: Gestión de trámites/);
  assert.equal(porId.get(4).result.isError, true);
  assert.match(porId.get(4).result.content[0].text, /no hay un artefacto "no existe"/);
  assert.equal(porId.get(5).error.code, -32601);
});
