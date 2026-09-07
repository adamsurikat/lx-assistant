-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TimeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ticketId" TEXT,
    "start" DATETIME NOT NULL,
    "end" DATETIME NOT NULL,
    "comment" TEXT,
    "syncedToJira" BOOLEAN NOT NULL DEFAULT false,
    "jiraWorklogId" TEXT,
    "lastSyncError" TEXT,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TimeEntry" ("comment", "createdAt", "end", "id", "jiraWorklogId", "lastSyncError", "lastSyncedAt", "start", "syncedToJira", "ticketId", "updatedAt", "userId") SELECT "comment", "createdAt", "end", "id", "jiraWorklogId", "lastSyncError", "lastSyncedAt", "start", "syncedToJira", "ticketId", "updatedAt", "userId" FROM "TimeEntry";
DROP TABLE "TimeEntry";
ALTER TABLE "new_TimeEntry" RENAME TO "TimeEntry";
CREATE INDEX "TimeEntry_userId_start_idx" ON "TimeEntry"("userId", "start");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
