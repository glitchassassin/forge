-- CreateTable
CREATE TABLE "monitored_channels" (
    "channel_id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "scheduled_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schedule_pattern" TEXT,
    "prompt" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "last_triggered_at" DATETIME,
    "next_trigger_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "conversation_context" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
