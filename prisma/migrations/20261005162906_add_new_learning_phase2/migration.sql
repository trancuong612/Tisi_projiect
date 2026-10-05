-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ExerciseType" ADD VALUE 'COLLOCATION';
ALTER TYPE "ExerciseType" ADD VALUE 'CONFUSION';

-- AlterTable
ALTER TABLE "NewLearningProgress" ADD COLUMN     "collocationPass" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "confusionPass" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "finalPass" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "usagePass" BOOLEAN NOT NULL DEFAULT false;
