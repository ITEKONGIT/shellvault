/*
  Warnings:

  - Added the required column `name` to the `servers` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "servers" ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "port" INTEGER NOT NULL DEFAULT 22,
ALTER COLUMN "agent_health_status" SET DEFAULT 'pending';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "locked_until" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "servers_is_active_idx" ON "servers"("is_active");

-- CreateIndex
CREATE INDEX "idx_users_locked_until" ON "users"("locked_until");

-- CreateIndex
CREATE INDEX "idx_users_last_login" ON "users"("last_login_at");
