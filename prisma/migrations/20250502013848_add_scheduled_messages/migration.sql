-- CreateTable
CREATE TABLE "scheduled_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversation_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "next_trigger" DATETIME NOT NULL,
    "cron" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
