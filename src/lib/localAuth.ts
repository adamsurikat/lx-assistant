import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { hashPassword, validPassword, verifyPassword } from "./password";

export class AuthInputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new AuthInputError("Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthInputError("Enter a valid email address.");
  return email;
}

export function tokenHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Atomic fixed-window counters survive restarts and do not trust client IP headers.
export async function consumeAuthAttempt(identity: string, limit: number, windowMs = 15 * 60_000) {
  const now = Date.now();
  const window = Math.floor(now / windowMs);
  await prisma.authRateLimit.deleteMany({ where: { expiresAt: { lte: new Date(now) } } });
  const row = await prisma.authRateLimit.upsert({
    where: { key: `${tokenHash(identity)}:${window}` },
    create: { key: `${tokenHash(identity)}:${window}`, attempts: 1, expiresAt: new Date((window + 1) * windowMs) },
    update: { attempts: { increment: 1 } },
  });
  if (row.attempts > limit) throw new AuthInputError("Too many attempts. Try again in 15 minutes.", 429);
}

export async function registerUser(input: { name?: unknown; email?: unknown; password?: unknown }) {
  const email = normalizeEmail(input.email);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 100) throw new AuthInputError("Enter a name of up to 100 characters.");
  if (!validPassword(input.password)) throw new AuthInputError("Use a password between 12 and 128 characters.");
  await consumeAuthAttempt("register:all", 30);
  await consumeAuthAttempt(`register:${email}`, 5);
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.user.create({ data: { name, email, passwordHash }, select: { id: true, name: true, email: true } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AuthInputError("Unable to register this email. Sign in or ask the server administrator for a password setup link.", 409);
    }
    throw error;
  }
}

export async function authenticateUser(emailInput: unknown, password: unknown) {
  let email: string;
  try { email = normalizeEmail(emailInput); } catch { return null; }
  if (typeof password !== "string" || password.length > 128) return null;
  await consumeAuthAttempt("login:all", 100);
  await consumeAuthAttempt(`login:${email}`, 10);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!await verifyPassword(password, user?.passwordHash ?? null) || !user) return null;
  return { id: user.id, name: user.name, email: user.email, image: user.image };
}

export async function createPasswordSetupToken(emailInput: unknown) {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(emailInput) }, select: { id: true } });
  if (!user) throw new AuthInputError("No account exists for that email.");
  const token = randomBytes(32).toString("base64url");
  const data = { tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 60 * 60_000) };
  await prisma.passwordSetupToken.upsert({ where: { userId: user.id }, create: { ...data, userId: user.id }, update: data });
  return token;
}

export async function setPasswordWithToken(token: unknown, password: unknown) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AuthInputError("This password setup link is invalid or expired.");
  if (!validPassword(password)) throw new AuthInputError("Use a password between 12 and 128 characters.");
  await consumeAuthAttempt("password-setup:all", 30);
  const key = tokenHash(token);
  const setup = await prisma.passwordSetupToken.findUnique({ where: { tokenHash: key } });
  if (!setup || setup.expiresAt.getTime() <= Date.now()) throw new AuthInputError("This password setup link is invalid or expired.");
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordSetupToken.deleteMany({ where: { tokenHash: key, expiresAt: { gt: new Date() } } });
    if (!consumed.count) throw new AuthInputError("This password setup link is invalid or expired.");
    await tx.user.update({ where: { id: setup.userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
  });
}

export async function changePassword(userId: string, currentPassword: unknown, password: unknown) {
  if (!validPassword(password)) throw new AuthInputError("Use a password between 12 and 128 characters.");
  await consumeAuthAttempt(`password:${userId}`, 10);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.passwordHash && (typeof currentPassword !== "string" || !await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AuthInputError("Current password is incorrect.");
  }
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({ where: { id: userId, passwordHash: user.passwordHash }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    if (!updated.count) throw new AuthInputError("Your password changed. Sign in again before retrying.");
    await tx.passwordSetupToken.deleteMany({ where: { userId } });
  });
}
