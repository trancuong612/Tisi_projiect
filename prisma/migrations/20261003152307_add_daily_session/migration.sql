-- CreateTable
CREATE TABLE "DailySession" (
    "id" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "day" "LessonDay" NOT NULL,
    "weekNumber" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueTargets" JSONB NOT NULL,
    "relearningTargets" JSONB NOT NULL,
    "newTargets" JSONB NOT NULL,
    "weakTargets" JSONB NOT NULL,
    "readingTargets" JSONB NOT NULL,
    "completedReadingTargets" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailySession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailySession_dateKey_key" ON "DailySession"("dateKey");
