const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const {
  publicDir,
  dataFile,
  host,
  port,
  appSecret,
  adminPassword,
  adminSessionTtlMs
} = require("./config");
const { ensureStore, readStore, updateStore } = require("./services/encryptedStore");
const { handleApi, sendJson } = require("./routes/api");
const { isAdminAuthenticated } = require("./services/auth");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(message);
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function isClientError(error) {
  const message = String(error?.message || "");
  return [
    /^JSON invalide\.$/,
    /^Payload trop volumineux\.$/,
    /^Une vente doit contenir/,
    /^Type de ligne de vente invalide\.$/,
    /^La quantite/,
    /^Un produit/,
    /^Un service/,
    /^Produit utilise introuvable/,
    /^Stock insuffisant/,
    /^Le nom du produit/,
    /^Le nom du service/,
    /^Le libelle/,
    /^Le montant/,
    /^Produit introuvable\.$/,
    /^Service introuvable\.$/,
    /^Vente introuvable\.$/
  ].some((pattern) => pattern.test(message));
}

const PROTECTED_PAGES = new Set([
  "/index.html",
  "/produits.html",
  "/approvisionnement.html",
  "/services.html",
  "/activite.html",
  "/tresorerie.html",
  "/chat-ia.html"
]);

async function serveStatic(response, urlPathname) {
  const requestedPath = urlPathname === "/" ? "/ventes.html" : urlPathname;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  try {
    const content = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream"
    });
    response.end(content);
  } catch {
    sendText(response, 404, "Fichier introuvable.");
  }
}

async function requestListener(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url, {
        readStore,
        updateStore,
        dataFile,
        appSecret,
        adminPassword,
        adminSessionTtlMs
      });
      return;
    }

    if (PROTECTED_PAGES.has(url.pathname) && !isAdminAuthenticated(request)) {
      redirect(response, `/admin-login.html?next=${encodeURIComponent(url.pathname)}`);
      return;
    }

    await serveStatic(response, url.pathname);
  } catch (error) {
    if (url.pathname.startsWith("/api/") && isClientError(error)) {
      sendJson(response, 400, { error: error.message });
      return;
    }

    sendJson(response, 500, { error: "Erreur serveur." });
  }
}

async function start() {
  await ensureStore(dataFile, appSecret);

  const server = http.createServer(requestListener);
  server.listen(port, host, () => {
    console.log(`GestionComV2 disponible sur http://${host}:${port}`);
  });
}

start();
