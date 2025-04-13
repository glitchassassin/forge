-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_monitored_channels" (
    "channel_id" TEXT NOT NULL PRIMARY KEY,
    "model" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_monitored_channels" ("channel_id", "created_at", "model") SELECT "channel_id", "created_at", "model" FROM "monitored_channels";
DROP TABLE "monitored_channels";
ALTER TABLE "new_monitored_channels" RENAME TO "monitored_channels";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
