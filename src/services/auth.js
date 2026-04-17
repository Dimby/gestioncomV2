const crypto = require("crypto");

const SESSION_COOKIE = "gestioncom_admin_session";
const sessions = new Map();

function parseCookies(request) {
  const raw = String(request.headers.cookie || "");
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) {
        return cookies;
      }

      const key = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function createSession(ttlMs) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + ttlMs;
  sessions.set(token, { expiresAt });
  return { token, expiresAt };
}

function purgeExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

function getSessionToken(request) {
  const cookies = parseCookies(request);
  return cookies[SESSION_COOKIE] || null;
}

function isAdminAuthenticated(request) {
  purgeExpiredSessions();
  const token = getSessionToken(request);
  if (!token) {
    return false;
  }

  const session = sessions.get(token);
  if (!session) {
    return false;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }

  return true;
}

function clearSession(request) {
  const token = getSessionToken(request);
  if (token) {
    sessions.delete(token);
  }
}

function serializeSessionCookie(token, ttlMs) {
  const maxAge = Math.max(0, Math.floor(ttlMs / 1000));
  return `${SESSION_COOKIE}=${encodeURIComponent(
    token
  )}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}`;
}

function serializeExpiredSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`;
}

module.exports = {
  SESSION_COOKIE,
  createSession,
  clearSession,
  isAdminAuthenticated,
  serializeSessionCookie,
  serializeExpiredSessionCookie
};
