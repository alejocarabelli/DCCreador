import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { createServer as createViteServer } from "vite";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "fixtures", "advanced-review");
fs.mkdirSync(outputDir, { recursive: true });

async function main() {
  console.log("--- Iniciando Runner de Verificación de Funciones Avanzadas de Secuencia ---");

  let doneResolver;
  const donePromise = new Promise((resolve) => {
    doneResolver = resolve;
  });

  const vitePort = 5184;
  const viteServer = await createViteServer({
    root: rootDir,
    server: { port: vitePort, strictPort: true },
    logLevel: "info",
    plugins: [
      {
        name: "advanced-review-api",
        configureServer(server) {
          server.middlewares.use("/api/upload", (req, res) => {
            if (req.method === "POST") {
              const url = new URL(req.url, `http://localhost:${vitePort}`);
              const fileName = url.searchParams.get("name") || "unknown.png";
              const targetPath = path.join(outputDir, fileName);
              const fileStream = fs.createWriteStream(targetPath);
              req.pipe(fileStream);
              req.on("end", () => {
                fileStream.close();
                console.log(`[Servidor] Captura guardada: ${fileName}`);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: true }));
              });
              return;
            }
            res.writeHead(405);
            res.end();
          });

          server.middlewares.use("/api/done", (req, res) => {
            if (req.method === "POST") {
              let body = "";
              req.on("data", (chunk) => { body += chunk; });
              req.on("end", () => {
                const report = JSON.parse(body);
                res.writeHead(200, { "Content-Type": "application/json" });
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

  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const targetUrl = `http://localhost:${vitePort}/scripts/advancedSequenceRunner.html`;

  console.log(`Lanzando Chrome headless contra: ${targetUrl}`);
  const chromeProcess = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-extensions",
    "--window-size=1600,1000",
    targetUrl,
  ], { stdio: "inherit" });

  const timeout = setTimeout(() => {
    console.error("TIMEOUT: La verificación en navegador tardó más de 45 segundos.");
    doneResolver({ error: "Timeout" });
  }, 45000);

  const report = await donePromise;
  clearTimeout(timeout);

  chromeProcess.kill();
  await viteServer.close();

  console.log("\n--- Reporte de Verificación Visual y Funcional ---");
  console.log(JSON.stringify(report, null, 2));

  if (report.error) {
    console.error("Error reportado:", report.error);
    process.exit(1);
  }

  console.log("\n--- Capturas de Pantalla Generadas en fixtures/advanced-review ---");
  for (const file of fs.readdirSync(outputDir)) {
    if (file.endsWith(".png")) {
      const fullPath = path.join(outputDir, file);
      const sipsOut = execSync(`sips -g pixelWidth -g pixelHeight "${fullPath}"`, { encoding: "utf-8" });
      console.log(`Captura [${file}]: ${sipsOut.trim()}`);
    }
  }

  console.log("\nTodas las comprobaciones de funciones avanzadas finalizaron exitosamente.");
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
