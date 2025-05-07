-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_tools" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mcp_server_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tools_mcp_server_id_fkey" FOREIGN KEY ("mcp_server_id") REFERENCES "mcp_servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_tools" ("created_at", "id", "mcp_server_id", "name", "requires_approval", "updated_at") SELECT "created_at", "id", "mcp_server_id", "name", "requires_approval", "updated_at" FROM "tools";
DROP TABLE "tools";
ALTER TABLE "new_tools" RENAME TO "tools";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
