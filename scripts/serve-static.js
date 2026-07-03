const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const publicRoot = path.join(repoRoot, "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 5000);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

function resolveFile(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const relativePath = normalizedPath === "/" ? "index.html" : normalizedPath.replace(/^[/\\]/, "");
  const candidates = [
    path.join(publicRoot, relativePath),
    path.join(publicRoot, relativePath, "index.html")
  ];

  if (!path.extname(relativePath)) {
    candidates.push(path.join(publicRoot, `${relativePath}.html`));
  }

  for (const candidate of candidates) {
    if (!candidate.startsWith(publicRoot)) continue;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return { file: candidate, status: 200 };
  }

  return { file: path.join(publicRoot, "404.html"), status: 404 };
}

const server = http.createServer((request, response) => {
  const { file, status } = resolveFile(request.url || "/");
  const extension = path.extname(file);

  response.writeHead(status, {
    "Content-Type": mimeTypes.get(extension) || "application/octet-stream"
  });
  fs.createReadStream(file).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Serving ${publicRoot} at http://${host}:${port}`);
});
