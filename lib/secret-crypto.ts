import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function encryptionKey() {
  const configured = process.env.APP_ENCRYPTION_KEY || process.env.SECRET_ENCRYPTION_KEY || "";

  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("APP_ENCRYPTION_KEY is required in production.");
  }

  const material = configured || "local-development-only-secret-key";
  return crypto.createHash("sha256").update(material).digest();
}

export function encryptSecret(value: string) {
  if (!value) return "";

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(value: unknown) {
  if (typeof value !== "string" || !value) return "";

  if (!value.startsWith("v1:")) {
    return value;
  }

  const [, ivBase64, tagBase64, ciphertextBase64] = value.split(":");

  if (!ivBase64 || !tagBase64 || !ciphertextBase64) {
    throw new Error("Encrypted secret is malformed.");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, "base64")),
    decipher.final()
  ]).toString("utf8");
}

export function storedSecret(value: unknown, encryptedValue: unknown) {
  if (typeof encryptedValue === "string" && encryptedValue) {
    return decryptSecret(encryptedValue);
  }

  return typeof value === "string" ? value : "";
}
