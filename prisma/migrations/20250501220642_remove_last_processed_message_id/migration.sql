/*
  Warnings:

  - You are about to drop the column `last_processed_message_id` on the `conversations` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_conversations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "last_processed_message_timestamp" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_conversations" ("created_at", "id", "last_processed_message_timestamp", "updated_at") SELECT "created_at", "id", "last_processed_message_timestamp", "updated_at" FROM "conversations";
DROP TABLE "conversations";
ALTER TABLE "new_conversations" RENAME TO "conversations";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
