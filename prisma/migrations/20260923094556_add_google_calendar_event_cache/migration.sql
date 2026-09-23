-- CreateTable
CREATE TABLE "GoogleCalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start" DATETIME NOT NULL,
    "end" DATETIME NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "htmlLink" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoogleCalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GoogleCalendarEvent_userId_start_idx" ON "GoogleCalendarEvent"("userId", "start");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarEvent_userId_googleEventId_key" ON "GoogleCalendarEvent"("userId", "googleEventId");
