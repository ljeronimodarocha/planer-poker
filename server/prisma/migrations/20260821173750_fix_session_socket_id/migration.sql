-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "hostName" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);
INSERT INTO "new_Room" ("code", "createdAt", "creatorName", "finishedAt", "hostName", "id", "passwordHash") SELECT "code", "createdAt", "creatorName", "finishedAt", "hostName", "id", "passwordHash" FROM "Room";
DROP TABLE "Room";
ALTER TABLE "new_Room" RENAME TO "Room";
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "socketId" TEXT,
    "role" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_roomName_fkey" FOREIGN KEY ("roomName") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("createdAt", "expiresAt", "id", "name", "role", "roomName", "socketId", "token") SELECT "createdAt", "expiresAt", "id", "name", "role", "roomName", "socketId", "token" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
