-- CreateTable
CREATE TABLE "PostIt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'yellow',
    "x" REAL NOT NULL DEFAULT 40,
    "y" REAL NOT NULL DEFAULT 40,
    "rotation" REAL NOT NULL DEFAULT 0,
    "zIndex" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PostIt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PostIt_userId_idx" ON "PostIt"("userId");
