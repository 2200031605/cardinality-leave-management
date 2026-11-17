/*
  Warnings:

  - You are about to drop the column `tokenVersion` on the `PendingSignup` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PendingSignup" DROP COLUMN "tokenVersion";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;
