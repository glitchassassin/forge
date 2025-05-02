-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "last_processed_message_timestamp" DATETIME;

-- Update the new column with timestamps from the corresponding messages
UPDATE "conversations"
SET "last_processed_message_timestamp" = (
    SELECT "created_at"
    FROM "messages"
    WHERE "conversation_id" = "conversations"."id"
    AND "id" = "conversations"."last_processed_message_id"
);
