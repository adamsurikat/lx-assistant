-- CreateTable
CREATE TABLE "UserLinkLayout" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "orderJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserLinkLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
