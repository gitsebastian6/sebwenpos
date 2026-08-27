-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "client_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_session_id_client_key_key" ON "chat_messages"("session_id", "client_key");

