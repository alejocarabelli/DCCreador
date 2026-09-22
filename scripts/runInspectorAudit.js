import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { createServer as createViteServer } from "vite";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "fixtures", "inspector-audit");
fs.mkdirSync(outputDir, { recursive: true });

const windowSize = process.argv[2] || "1600,1000";

async function main() {
  console.log("--- Auditoría del Inspector de Secuencia ---");

  let doneResolver;
  const donePromise = new Promise((resolve) => {
    doneResolver = resolve;
  });

  const vitePort = 5187;
  const viteServer = await createViteServer({
    root: rootDir,
    server: { port: vitePort, strictPort: true },
    logLevel: "silent",
    plugins: [
      {
        name: "inspector-audit-api",
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

  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const targetUrl = `http://localhost:${vitePort}/scripts/inspectorAuditRunner.html`;
  const [width, height] = String(windowSize).split(",");

  const chromeProcess = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-extensions",
    `--window-size=${width},${height}`,
    targetUrl,
  ], { stdio: "ignore" });

  const timeout = setTimeout(() => {
    console.error("TIMEOUT en auditoría.");
    doneResolver({ error: "Timeout" });
  }, 90000);

  const report = await donePromise;
  clearTimeout(timeout);

  chromeProcess.kill();
  await viteServer.close();

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
