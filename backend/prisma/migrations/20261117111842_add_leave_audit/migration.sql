-- CreateEnum
CREATE TYPE "LeaveAuditAction" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "LeaveAudit" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "actorId" INTEGER NOT NULL,
    "action" "LeaveAuditAction" NOT NULL,
    "fromStatus" "LeaveStatus",
    "toStatus" "LeaveStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveAudit_requestId_createdAt_idx" ON "LeaveAudit"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeaveAudit" ADD CONSTRAINT "LeaveAudit_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "LeaveRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveAudit" ADD CONSTRAINT "LeaveAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
