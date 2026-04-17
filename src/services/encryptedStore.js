const fs = require("fs/promises");
const crypto = require("crypto");
const { createDefaultStore, normalizeStore } = require("../domain/storeModel");

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;

function defaultStore() {
  return createDefaultStore();
}

function deriveKey(secret, salt) {
  return crypto.scryptSync(secret, salt, KEY_LENGTH);
}

function encryptJson(payload, secret) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(secret, salt);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const content = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, authTag, encrypted]).toString("base64");
}

function decryptJson(rawValue, secret) {
  const buffer = Buffer.from(rawValue, "base64");
  const salt = buffer.subarray(0, SALT_LENGTH);
  const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = buffer.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + TAG_LENGTH
  );
  const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const key = deriveKey(secret, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return JSON.parse(decrypted.toString("utf8"));
}

async function ensureStore(filePath, secret) {
  try {
    await fs.access(filePath);
  } catch {
    await writeStore(filePath, secret, defaultStore());
  }
}

async function readStore(filePath, secret) {
  await ensureStore(filePath, secret);
  const rawValue = await fs.readFile(filePath, "utf8");
  return normalizeStore(decryptJson(rawValue, secret));
}

async function writeStore(filePath, secret, data) {
  const normalizedData = normalizeStore(data);
  const nextData = {
    ...normalizedData,
    meta: {
      ...(normalizedData.meta || {}),
      updatedAt: new Date().toISOString(),
      createdAt:
        normalizedData.meta?.createdAt || new Date().toISOString()
    }
  };
  const encrypted = encryptJson(nextData, secret);
  await fs.writeFile(filePath, encrypted, "utf8");
  return nextData;
}

async function updateStore(filePath, secret, updater) {
  const current = await readStore(filePath, secret);
  const next = await updater(current);
  return writeStore(filePath, secret, next);
}

module.exports = {
  defaultStore,
  ensureStore,
  readStore,
  writeStore,
  updateStore
};
