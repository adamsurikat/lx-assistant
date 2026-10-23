ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
UPDATE "User" SET "email" = lower(trim("email")) WHERE "email" IS NOT NULL;

CREATE TABLE "PasswordSetupToken" (
  "tokenHash" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  CONSTRAINT "PasswordSetupToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PasswordSetupToken_userId_key" ON "PasswordSetupToken"("userId");

CREATE TABLE "AuthRateLimit" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "attempts" INTEGER NOT NULL,
  "expiresAt" DATETIME NOT NULL
);
CREATE INDEX "AuthRateLimit_expiresAt_idx" ON "AuthRateLimit"("expiresAt");

CREATE TABLE "GoogleCalendarConnection" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "googleAccountId" TEXT NOT NULL,
  "email" TEXT,
  "accessTokenCipher" TEXT NOT NULL,
  "refreshTokenCipher" TEXT,
  "expiresAt" DATETIME NOT NULL,
  "scope" TEXT NOT NULL,
  CONSTRAINT "GoogleCalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "GoogleCalendarOAuthState" (
  "stateHash" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "verifierCipher" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  CONSTRAINT "GoogleCalendarOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GoogleCalendarOAuthState_userId_key" ON "GoogleCalendarOAuthState"("userId");
