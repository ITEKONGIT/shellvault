/*
  Warnings:

  - Made the column `email` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verification_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "email_verification_expiry" TIMESTAMP(3),
ADD COLUMN     "email_verification_token" TEXT,
ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "password_hash" DROP NOT NULL,
ALTER COLUMN "totp_secret" DROP NOT NULL,
ALTER COLUMN "backup_codes" SET DEFAULT ARRAY[]::TEXT[];
