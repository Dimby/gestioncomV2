const {
  buildBootstrap,
  buildSellerBootstrap,
  addProduct,
  addService,
  receiveStock,
  createSale,
  createExpense,
  updateSale,
  deleteSale
} = require("../domain/storeModel");
const { processAssistantQuery } = require("../domain/assistant");
const {
  createSession,
  clearSession,
  isAdminAuthenticated,
  serializeSessionCookie,
  serializeExpiredSessionCookie
} = require("../services/auth");

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload trop volumineux."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("JSON invalide."));
      }
    });

    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

async function handleApi(request, response, url, storeAccess) {
  const {
    readStore,
    updateStore,
    dataFile,
    appSecret,
    adminPassword,
    adminSessionTtlMs
  } = storeAccess;
  const isAdmin = isAdminAuthenticated(request);
  const saleIdMatch = url.pathname.match(/^\/api\/sales\/([^/]+)$/);

  function requireAdmin() {
    if (!isAdmin) {
      sendJson(response, 401, { error: "Authentification admin requise." });
      return false;
    }

    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/auth/session") {
    sendJson(response, 200, {
      authenticated: isAdmin,
      role: isAdmin ? "admin" : "seller"
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await parseBody(request);
    const password = String(body.password || "");

    if (password !== adminPassword) {
      sendJson(response, 401, { error: "Mot de passe admin invalide." });
      return;
    }

    const session = createSession(adminSessionTtlMs);
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": serializeSessionCookie(session.token, adminSessionTtlMs)
    });
    response.end(JSON.stringify({ authenticated: true, role: "admin" }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    clearSession(request);
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": serializeExpiredSessionCookie()
    });
    response.end(JSON.stringify({ authenticated: false, role: "seller" }));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    const store = await readStore(dataFile, appSecret);
    const payload = isAdmin ? buildBootstrap(store) : buildSellerBootstrap(store);
    sendJson(response, 200, {
      ...payload,
      auth: {
        authenticated: isAdmin,
        role: isAdmin ? "admin" : "seller"
      }
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/products") {
    if (!requireAdmin()) {
      return;
    }

    const body = await parseBody(request);
    const updated = await updateStore(dataFile, appSecret, async (store) =>
      addProduct(store, body)
    );
    sendJson(response, 201, buildBootstrap(updated));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/services") {
    if (!requireAdmin()) {
      return;
    }

    const body = await parseBody(request);
    const updated = await updateStore(dataFile, appSecret, async (store) =>
      addService(store, body)
    );
    sendJson(response, 201, buildBootstrap(updated));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/stock/receive") {
    if (!requireAdmin()) {
      return;
    }

    const body = await parseBody(request);
    const updated = await updateStore(dataFile, appSecret, async (store) =>
      receiveStock(store, body)
    );
    sendJson(response, 201, buildBootstrap(updated));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/sales") {
    const body = await parseBody(request);
    const updated = await updateStore(dataFile, appSecret, async (store) =>
      createSale(store, body)
    );
    const payload = isAdmin ? buildBootstrap(updated) : buildSellerBootstrap(updated);
    sendJson(response, 201, {
      ...payload,
      auth: {
        authenticated: isAdmin,
        role: isAdmin ? "admin" : "seller"
      }
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/expenses") {
    const body = await parseBody(request);
    const updated = await updateStore(dataFile, appSecret, async (store) =>
      createExpense(store, body)
    );
    const payload = isAdmin ? buildBootstrap(updated) : buildSellerBootstrap(updated);
    sendJson(response, 201, {
      ...payload,
      auth: {
        authenticated: isAdmin,
        role: isAdmin ? "admin" : "seller"
      }
    });
    return;
  }

  if (request.method === "PUT" && saleIdMatch) {
    const body = await parseBody(request);
    const updated = await updateStore(dataFile, appSecret, async (store) =>
      updateSale(store, saleIdMatch[1], body)
    );
    const payload = isAdmin ? buildBootstrap(updated) : buildSellerBootstrap(updated);
    sendJson(response, 200, {
      ...payload,
      auth: {
        authenticated: isAdmin,
        role: isAdmin ? "admin" : "seller"
      }
    });
    return;
  }

  if (request.method === "DELETE" && saleIdMatch) {
    const updated = await updateStore(dataFile, appSecret, async (store) =>
      deleteSale(store, saleIdMatch[1])
    );
    const payload = isAdmin ? buildBootstrap(updated) : buildSellerBootstrap(updated);
    sendJson(response, 200, {
      ...payload,
      auth: {
        authenticated: isAdmin,
        role: isAdmin ? "admin" : "seller"
      }
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/assistant/query") {
    if (!requireAdmin()) {
      return;
    }

    const body = await parseBody(request);
    const store = await readStore(dataFile, appSecret);
    sendJson(response, 200, {
      question: String(body.question || "").trim(),
      ...processAssistantQuery(store, body.question)
    });
    return;
  }

  sendJson(response, 404, { error: "Route API introuvable." });
}

module.exports = {
  handleApi,
  sendJson
};
