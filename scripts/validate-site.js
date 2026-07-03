const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const definitionPath = path.join(repoRoot, "site.definition.json");
const definition = JSON.parse(fs.readFileSync(definitionPath, "utf8"));
const publicRoot = path.join(repoRoot, definition.site.publicRoot);
const hostingSites = definition.hostingSites || [
  {
    target: "main",
    publicRoot: definition.site.publicRoot
  }
];
const failures = [];
const warnings = [];

const requiredSecurityHeaders = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' mailto:"
};

const largeHtmlAllowlist = new Set([
  "public/pages/spl_art_cave.html",
  "public/pages/spl_forms_list.html",
  "public/pages/spl_product_iceberg.html",
  "public/pages/tos.html"
]);

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function publicPath(routePath, root = publicRoot) {
  const cleanPath = routePath.split("#")[0].split("?")[0];
  if (cleanPath === "/") return path.join(root, "index.html");
  if (cleanPath.endsWith(".html")) return path.join(root, cleanPath.slice(1));
  return path.join(root, cleanPath.slice(1), "index.html");
}

function existsPublic(routePath, root = publicRoot) {
  return fs.existsSync(publicPath(routePath, root));
}

function walkFiles(dir, extensions, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, extensions, files);
      continue;
    }
    if (extensions.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

function relativePath(file) {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}

function isLocalReference(value) {
  return value.startsWith("/") && !value.startsWith("//");
}

function isRoutableReference(value) {
  const clean = value.split("#")[0].split("?")[0];
  return clean === "/" || clean.endsWith("/") || clean.endsWith(".html");
}

function parseCloudflareHeaders(file) {
  const rules = [];
  let currentRule = null;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (/^\s/.test(line)) {
      if (!currentRule) {
        fail(`Cloudflare Pages headers file has a header before any path rule: ${relativePath(file)}:${index + 1}`);
        continue;
      }
      const separatorIndex = trimmed.indexOf(":");
      if (separatorIndex === -1) {
        fail(`Cloudflare Pages headers file has an invalid header line: ${relativePath(file)}:${index + 1}`);
        continue;
      }
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      currentRule.headers[key] = value;
      continue;
    }

    currentRule = {
      path: trimmed,
      headers: {}
    };
    rules.push(currentRule);
  }

  return rules;
}

function parseCloudflareRedirects(file) {
  const redirects = [];
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) {
      fail(`Cloudflare Pages redirects file has an invalid redirect line: ${relativePath(file)}:${index + 1}`);
      continue;
    }

    redirects.push({
      source: parts[0],
      destination: parts[1],
      status: parts[2] || "302"
    });
  }

  return redirects;
}

function hasRedirect(redirects, source, destination, status = "301") {
  return redirects.some((entry) => entry.source === source && entry.destination === destination && entry.status === status);
}

function validateCloudflarePagesConfig() {
  for (const site of hostingSites) {
    const root = path.join(repoRoot, site.publicRoot);
    if (!fs.existsSync(root)) {
      fail(`Cloudflare Pages target ${site.target} public root is missing: ${site.publicRoot}`);
      continue;
    }

    const headersPath = path.join(root, "_headers");
    const redirectsPath = path.join(root, "_redirects");

    if (!fs.existsSync(headersPath)) {
      fail(`Cloudflare Pages target ${site.target} is missing _headers in ${site.publicRoot}`);
      continue;
    }

    if (!fs.existsSync(redirectsPath)) {
      fail(`Cloudflare Pages target ${site.target} is missing _redirects in ${site.publicRoot}`);
      continue;
    }

    const headers = parseCloudflareHeaders(headersPath);
    const globalHeaders = headers.find((entry) => entry.path === "/*");
    if (!globalHeaders) {
      fail(`Cloudflare Pages target ${site.target} headers must include a global /* policy`);
    } else {
      for (const [key, value] of Object.entries(requiredSecurityHeaders)) {
        if (globalHeaders.headers[key] !== value) {
          fail(`Cloudflare Pages target ${site.target} global security header is missing or changed: ${key}`);
        }
      }
    }

    const staticPolicy = headers.find((entry) => entry.path === "/static/*" && entry.headers["Cache-Control"] === "public, max-age=31536000, immutable");
    if (!staticPolicy) {
      fail(`Cloudflare Pages target ${site.target} static asset cache header is missing: public, max-age=31536000, immutable`);
    }

    const rootPolicy = headers.find((entry) => entry.path === "/" && entry.headers["Cache-Control"] === "no-cache");
    if (!rootPolicy) {
      fail(`Cloudflare Pages target ${site.target} root cache header is missing: no-cache`);
    }

    const htmlPolicy = headers.find((entry) => entry.path === "/*.html" && entry.headers["Cache-Control"] === "no-cache");
    if (!htmlPolicy) {
      fail(`Cloudflare Pages target ${site.target} HTML cache header is missing: no-cache`);
    }

    const cleanRoutePolicy = headers.find((entry) => entry.path === "/*/" && entry.headers["Cache-Control"] === "no-cache");
    if (!cleanRoutePolicy) {
      fail(`Cloudflare Pages target ${site.target} clean URL route cache header is missing: no-cache`);
    }

    const redirects = parseCloudflareRedirects(redirectsPath);
    if (site.target === "main") {
      if (!hasRedirect(redirects, "/shop", "https://shop.skypenguinlabs.com")) {
        fail("main Cloudflare Pages target is missing /shop redirect to shop subdomain");
      }
      if (!hasRedirect(redirects, "/shop/*", "https://shop.skypenguinlabs.com")) {
        fail("main Cloudflare Pages target is missing /shop/* redirect to shop subdomain");
      }
      if (!hasRedirect(redirects, "/projects/vibelang", "https://vibelang.skypenguinlabs.com/")) {
        fail("main Cloudflare Pages target is missing /projects/vibelang redirect to VibeLang subdomain");
      }
      if (!hasRedirect(redirects, "/projects/vibelang/*", "https://vibelang.skypenguinlabs.com/")) {
        fail("main Cloudflare Pages target is missing /projects/vibelang/* redirect to VibeLang subdomain");
      }
    }

    if (site.target === "vibelang") {
      for (const source of ["/docs", "/docs/*", "/documentation", "/showcase", "/quickstart"]) {
        if (!hasRedirect(redirects, source, "/")) {
          fail(`vibelang Cloudflare Pages target is missing obsolete-route redirect: ${source}`);
        }
      }
    }
  }
}

function validateDefinition() {
  for (const site of hostingSites) {
    if (!site.target || !site.publicRoot) {
      fail(`hosting site entry must include target and publicRoot: ${JSON.stringify(site)}`);
      continue;
    }
    if (!fs.existsSync(path.join(repoRoot, site.publicRoot))) {
      fail(`public root is missing: ${site.publicRoot}`);
    }
  }

  for (const asset of definition.assets || []) {
    if (!isLocalReference(asset)) {
      fail(`asset must be root-relative: ${asset}`);
      continue;
    }
    if (!fs.existsSync(path.join(publicRoot, asset.slice(1)))) {
      fail(`required asset is missing: ${asset}`);
    }
  }

  for (const route of definition.routes || []) {
    if (!route.path || !route.status) {
      fail(`route entry must include path and status: ${JSON.stringify(route)}`);
      continue;
    }
    if ((route.status === "live" || route.status === "legacy") && !existsPublic(route.path)) {
      fail(`${route.status} route has no file: ${route.path}`);
    }
  }

  for (const route of definition.subdomainRoutes || []) {
    const site = hostingSites.find((entry) => entry.target === route.target);
    if (!site) {
      fail(`subdomain route references unknown hosting target: ${JSON.stringify(route)}`);
      continue;
    }
    const root = path.join(repoRoot, site.publicRoot);
    if ((route.status === "live" || route.status === "legacy") && !existsPublic(route.path, root)) {
      fail(`${route.status} route has no file for ${site.target}: ${route.path}`);
    }
  }
}

function validateReferences() {
  const roots = hostingSites.map((site) => path.join(repoRoot, site.publicRoot));
  const attrPattern = /\b(?:href|src)=["'](\/[^"']+)["']/g;
  const cssPattern = /url\(["']?(\/[^"')]+)["']?\)/g;

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const files = walkFiles(root, new Set([".html", ".css", ".js"]));
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      const relative = path.relative(repoRoot, file);
      const matches = [
        ...source.matchAll(attrPattern),
        ...source.matchAll(cssPattern)
      ];

      for (const match of matches) {
        const reference = match[1];
        if (!isLocalReference(reference)) continue;

        const clean = reference.split("#")[0].split("?")[0];
        if (!clean) continue;

        const target = isRoutableReference(clean)
          ? publicPath(clean, root)
          : path.join(root, clean.slice(1));

        if (!fs.existsSync(target)) {
          fail(`broken local reference in ${relative}: ${reference}`);
        }
      }
    }
  }
}

function validateTargetBlankRel() {
  const files = walkFiles(publicRoot, new Set([".html", ".js"]));
  const blankTargetPattern = /<a\b[^>]*\btarget=["']_blank["'][^>]*>/gi;
  const relPattern = /\brel=["']([^"']*)["']/i;

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const relative = relativePath(file);
    for (const match of source.matchAll(blankTargetPattern)) {
      const tag = match[0];
      const rel = tag.match(relPattern)?.[1] || "";
      const tokens = rel.split(/\s+/).filter(Boolean);
      if (!tokens.includes("noopener") && !tokens.includes("noreferrer")) {
        fail(`target="_blank" link lacks noopener/noreferrer in ${relative}`);
      }
    }
  }
}

function validateNoRemoteAvatar() {
  const files = walkFiles(publicRoot, new Set([".html", ".js"]));
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    if (source.includes("avatars.githubusercontent.com")) {
      fail(`remote GitHub avatar reference remains in ${relativePath(file)}`);
    }
  }
}

function validateProjectBriefFallbacks() {
  const files = walkFiles(path.join(publicRoot, "projects"), new Set([".html"]));
  const briefPattern = /<main\b[^>]*\bdata-project-brief=["'][^"']+["'][^>]*>([\s\S]*?)<\/main>/i;

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const match = source.match(briefPattern);
    if (!match) continue;
    if (!/<h1\b/i.test(match[1])) {
      fail(`project brief page needs a static h1 fallback: ${relativePath(file)}`);
    }
  }
}

function validateDuplicateStaticAssets() {
  let trackedFiles = [];
  try {
    trackedFiles = childProcess.execFileSync("git", ["ls-files", "static", "public/static"], {
      cwd: repoRoot,
      encoding: "utf8"
    }).trim().split(/\n/).filter(Boolean);
  } catch (error) {
    warn(`could not inspect tracked static assets: ${error.message}`);
    return;
  }

  const seen = new Map();
  for (const file of trackedFiles) {
    if (!fs.existsSync(path.join(repoRoot, file))) continue;
    const key = file.startsWith("public/static/") ? file.slice("public/static/".length) : file.replace(/^static\//, "");
    const prior = seen.get(key);
    if (prior) fail(`duplicate tracked static asset: ${prior} and ${file}`);
    seen.set(key, file);
  }
}

function validatePublicHtmlSize() {
  const files = walkFiles(publicRoot, new Set([".html"]));
  for (const file of files) {
    const relative = relativePath(file);
    const size = fs.statSync(file).size;
    if (size <= 100 * 1024) continue;
    if (largeHtmlAllowlist.has(relative)) {
      warn(`TODO: split legacy oversized HTML page (${Math.round(size / 1024)} KB): ${relative}`);
      continue;
    }
    fail(`public HTML file exceeds 100 KB: ${relative}`);
  }
}

function reportLegacyInnerHtmlLeads() {
  const legacyFile = path.join(publicRoot, "rsrc", "spl-web-logic.js");
  if (!fs.existsSync(legacyFile)) return;
  const source = fs.readFileSync(legacyFile, "utf8");
  const count = (source.match(/\binnerHTML\b/g) || []).length;
  if (count > 0) {
    warn(`audit lead: public/rsrc/spl-web-logic.js contains ${count} innerHTML uses; non-blocking for this targeted pass`);
  }
}

validateCloudflarePagesConfig();
validateDefinition();
validateReferences();
validateTargetBlankRel();
validateNoRemoteAvatar();
validateProjectBriefFallbacks();
validateDuplicateStaticAssets();
validatePublicHtmlSize();
reportLegacyInnerHtmlLeads();

if (failures.length) {
  console.error("Site validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

for (const warning of warnings) console.warn(`Site validation warning: ${warning}`);
console.log("Site validation passed.");
