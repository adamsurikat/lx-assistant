CREATE TABLE "JiraFixVersionCache" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "versionsJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JiraFixVersionCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
