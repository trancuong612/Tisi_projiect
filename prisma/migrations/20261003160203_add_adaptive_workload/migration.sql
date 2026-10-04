-- CreateEnum
CREATE TYPE "WorkloadMode" AS ENUM ('NORMAL', 'BUSY', 'RECOVERY');

-- AlterTable
ALTER TABLE "DailySession" ADD COLUMN     "workloadMeta" JSONB,
ADD COLUMN     "workloadMode" "WorkloadMode" NOT NULL DEFAULT 'NORMAL';
