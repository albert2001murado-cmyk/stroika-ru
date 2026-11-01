import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import { SecurityError } from "./account-security-session";

let activeDerivations = 0;
async function derive(password: string, salt: string) {
  if (activeDerivations >= 2)
    throw new SecurityError("Сервис входа занят. Повторите через несколько секунд", "security/busy", 503);
  activeDerivations++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
        (error, key) => error ? reject(error) : resolve(key));
    });
  } finally { activeDerivations--; }
}
export const opaqueId = () => randomBytes(24).toString("hex");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function encryptionKey() {
  const encoded = process.env.STROVA_MFA_ENCRYPTION_KEY || "";
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded)
    throw new SecurityError("Защита ещё не настроена на сервере. Обратитесь в поддержку", "security/not-configured", 503);
  return key;
}
export function assertSecurityConfigured() { encryptionKey(); }
export function encryptSecret(uid: string, value: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from("strova-mfa:v1:" + uid));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}
export function decryptSecret(uid: string, value: string) {
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("security/secret-format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from("strova-mfa:v1:" + uid));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
export function newTotp(email: string) {
  return new TOTP({ issuer: "Строва", label: email, algorithm: "SHA1", digits: 6, period: 30, secret: new Secret({ size: 20 }) });
}
export function totpCounter(secret: string, code: string, now: number) {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = new TOTP({ secret: Secret.fromBase32(secret), algorithm: "SHA1", digits: 6, period: 30 })
    .validate({ token: code, timestamp: now, window: 1 });
  return delta === null ? null : Math.floor(now / 30_000) + delta;
}
export function recoveryDigest(uid: string, code: string) {
  return createHmac("sha256", encryptionKey()).update("recovery:" + uid + ":" + code.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");
}
export function newRecoveryCodes(uid: string) {
  const codes = Array.from({ length: 10 }, () => randomBytes(12).toString("hex").toUpperCase().match(/.{4}/g)!.join("-"));
  return { codes, hashes: codes.map(code => recoveryDigest(uid, code)) };
}
export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 6 && Buffer.byteLength(value, "utf8") <= 256;
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return "scrypt-v1." + salt + "." + key.toString("hex");
}
export async function checkPassword(password: string, encoded: string) {
  const [version, salt, expected] = encoded.split(".");
  if (version !== "scrypt-v1" || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  const key = await derive(password, salt);
  return safeEqual(key.toString("hex"), expected);
}
