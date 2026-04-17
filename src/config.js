const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

module.exports = {
  rootDir: ROOT_DIR,
  publicDir: path.join(ROOT_DIR, "public"),
  dataFile: path.join(ROOT_DIR, "data", "store.enc"),
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3000),
  appSecret: process.env.APP_SECRET || "dev-secret-a-remplacer",
  adminPassword: process.env.ADMIN_PASSWORD || "admin1234",
  adminSessionTtlMs: Number(process.env.ADMIN_SESSION_TTL_MS || 1000 * 60 * 60 * 12)
};
