import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "4173", 10);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);
  const relativePath =
    requestUrl.pathname === "/"
      ? "examples/simple-html/index.html"
      : decodeURIComponent(requestUrl.pathname.slice(1));
  const filePath = path.resolve(repoRoot, relativePath);

  if (!filePath.startsWith(repoRoot)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  let resolvedPath = filePath;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    resolvedPath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const extension = path.extname(resolvedPath);
  response.writeHead(200, {
    "content-type": contentTypes.get(extension) ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  fs.createReadStream(resolvedPath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Demo server running at http://${host}:${port}/examples/simple-html/`);
});
