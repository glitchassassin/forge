-- CreateTable
CREATE TABLE "collapsible_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "collapsed_content" TEXT NOT NULL,
    "is_collapsed" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "collapsible_messages_message_id_key" ON "collapsible_messages"("message_id");
