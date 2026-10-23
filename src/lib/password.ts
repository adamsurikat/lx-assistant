import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const OPTIONS = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export function validPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, OPTIONS, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (!validPassword(password)) throw new Error("Use a password between 12 and 128 characters.");
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt:131072:8:1:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  const match = hash?.match(/^scrypt:131072:8:1:([a-f0-9]{32}):([a-f0-9]{128})$/);
  // Unknown accounts take the same expensive path as a wrong password.
  const key = await derive(password, match ? Buffer.from(match[1], "hex") : Buffer.alloc(16));
  return Boolean(match && timingSafeEqual(key, Buffer.from(match[2], "hex")));
}
