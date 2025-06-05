import crypto from "crypto";

// Global secret (never exposed to frontend)
const MASTER_KEY = process.env.ENCRYPTION_KEY 

// Derive encryption key per user using PBKDF2
function deriveKey(userId, salt) {
  return crypto.pbkdf2Sync(MASTER_KEY + userId, salt, 100000, 32, 'sha256');
}

// Encrypt message securely
export function encryptMessage(plainText, userId) {
  const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
  const salt = crypto.randomBytes(16); // Salt for key derivation
  const key = deriveKey(userId, salt);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = {
    iv: iv.toString("hex"),
    salt: salt.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: encrypted.toString("hex")
  };

  return JSON.stringify(payload);
}

// Decrypt the message
export function decryptMessage(encryptedJsonOrObject, userId) {
  // If input is a string, parse it, else use as is
  const payload = typeof encryptedJsonOrObject === "string"
    ? JSON.parse(encryptedJsonOrObject)
    : encryptedJsonOrObject;

  const { iv, salt, tag, ciphertext } = payload;

  const key = deriveKey(userId, Buffer.from(salt, "hex"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "hex")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

