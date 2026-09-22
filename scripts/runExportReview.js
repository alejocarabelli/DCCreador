import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { createServer as createViteServer } from 'vite';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'fixtures', 'export-review');
fs.mkdirSync(outputDir, { recursive: true });

async function main() {
  console.log('--- Iniciando Runner de Exportación Real en Navegador ---');

  let doneResolver;
  const donePromise = new Promise((resolve) => {
    doneResolver = resolve;
  });

  const vitePort = 5183;
  const viteServer = await createViteServer({
    root: rootDir,
    server: { port: vitePort, strictPort: true },
    logLevel: 'info',
    plugins: [
      {
        name: 'review-api',
        configureServer(server) {
          server.middlewares.use('/api/upload', (req, res) => {
            if (req.method === 'POST') {
              const url = new URL(req.url, `http://localhost:${vitePort}`);
              const fileName = url.searchParams.get('name') || 'unknown';
              const targetPath = path.join(outputDir, fileName);
              const fileStream = fs.createWriteStream(targetPath);
              req.pipe(fileStream);
              req.on('end', () => {
                fileStream.close();
                console.log(`[Servidor] Artefacto recibido y guardado: ${fileName}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
              });
              return;
            }
            res.writeHead(405);
            res.end();
          });

          server.middlewares.use('/api/done', (req, res) => {
            if (req.method === 'POST') {
              let body = '';
              req.on('data', (chunk) => { body += chunk; });
              req.on('end', () => {
                const report = JSON.parse(body);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                doneResolver(report);
              });
              return;
            }
            res.writeHead(405);
            res.end();
          });
        },
      },
    ],
  });

  await viteServer.listen();
  console.log(`Vite server escuchando en http://localhost:${vitePort}`);

  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const targetUrl = `http://localhost:${vitePort}/scripts/exportRunner.html`;

  console.log(`Lanzando Chrome headless contra: ${targetUrl}`);
  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    targetUrl,
  ], { stdio: 'inherit' });

  const timeout = setTimeout(() => {
    console.error('TIMEOUT: La exportación en navegador tardó más de 40 segundos.');
    doneResolver({ error: 'Timeout' });
  }, 40000);

  const report = await donePromise;
  clearTimeout(timeout);

  chromeProcess.kill();
  await viteServer.close();

  console.log('\n--- Reporte del Navegador ---');
  console.log(JSON.stringify(report, null, 2));

  if (report.error) {
    console.error('Error reportado por el navegador:', report.error);
    process.exit(1);
  }

  console.log('\n--- Inspección de Artefactos Generados ---');

  for (const file of fs.readdirSync(outputDir)) {
    const fullPath = path.join(outputDir, file);
    if (file.endsWith('.png') && !file.includes('-page')) {
      const sipsOut = execSync(`sips -g pixelWidth -g pixelHeight "${fullPath}"`, { encoding: 'utf-8' });
      console.log(`\nDimensiones PNG [${file}]:\n${sipsOut.trim()}`);
    } else if (file.endsWith('.pdf')) {
      const infoOut = execSync(`pdfinfo "${fullPath}"`, { encoding: 'utf-8' });
      console.log(`\nEstructura PDF [${file}]:\n${infoOut.trim()}`);

      const prefix = path.join(outputDir, `${path.basename(file, '.pdf')}-page`);
      execSync(`pdftoppm -png -r 150 "${fullPath}" "${prefix}"`);
      console.log(`Páginas del PDF renderizadas con pdftoppm en: ${prefix}`);
    }
  }

  console.log('\nTodos los artefactos se generaron y verificaron correctamente.');
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
