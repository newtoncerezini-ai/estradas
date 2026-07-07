const http = require("http");
const fs = require("fs");
const { spawn } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.ESTRADAS_REFRESH_PORT || process.env.CRECHES_REFRESH_PORT || 3025);
const generatedDataPath = path.join(root, "public", "data", "estradas-dashboard.json");
const publishedDataPath = process.env.ESTRADAS_PUBLISHED_DATA_PATH
  ? path.resolve(process.env.ESTRADAS_PUBLISHED_DATA_PATH)
  : path.join(root, "dist", "data", "estradas-dashboard.json");
let isRunning = false;

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": process.env.ESTRADAS_REFRESH_CORS_ORIGIN || process.env.CRECHES_REFRESH_CORS_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function publishUpdatedData() {
  if (!fs.existsSync(generatedDataPath)) {
    return "Arquivo gerado nao encontrado.";
  }

  fs.mkdirSync(path.dirname(publishedDataPath), { recursive: true });
  fs.copyFileSync(generatedDataPath, publishedDataPath);
  return `Base publicada em ${publishedDataPath}`;
}

function runUpdate(response) {
  if (isRunning) {
    sendJson(response, 409, { ok: false, message: "Atualizacao ja em andamento." });
    return;
  }

  isRunning = true;
  const startedAt = new Date();
  const child = spawn("npm", ["run", "data:update"], {
    cwd: root,
    shell: process.platform === "win32",
    env: process.env
  });
  let output = "";

  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.on("close", (code) => {
    isRunning = false;
    let finalCode = code;
    let publishMessage = "";

    if (code === 0) {
      try {
        publishMessage = publishUpdatedData();
        output += `\n${publishMessage}\n`;
      } catch (error) {
        finalCode = 1;
        publishMessage = error.message;
        output += `\nFalha ao publicar base atualizada: ${error.message}\n`;
      }
    }

    sendJson(response, finalCode === 0 ? 200 : 500, {
      ok: finalCode === 0,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      publishedDataPath,
      publishMessage,
      output: output.slice(-4000)
    });
  });
}

const server = http.createServer((request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "POST" && ["/api/estradas/refresh", "/api/creches/refresh"].includes(request.url)) {
    runUpdate(response);
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true, isRunning });
    return;
  }

  sendJson(response, 404, { ok: false, message: "Rota nao encontrada." });
});

server.listen(port, () => {
  console.log(`Estradas refresh server listening on port ${port}`);
});
