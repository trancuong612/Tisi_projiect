-- CreateTable
CREATE TABLE "NewLearningProgress" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,
    "exposed" BOOLEAN NOT NULL DEFAULT false,
    "recognitionPass" BOOLEAN NOT NULL DEFAULT false,
    "recallPass" BOOLEAN NOT NULL DEFAULT false,
    "spellingPass" BOOLEAN NOT NULL DEFAULT false,
    "listeningPass" BOOLEAN NOT NULL DEFAULT false,
    "dictationPass" BOOLEAN NOT NULL DEFAULT false,
    "contextPass" BOOLEAN NOT NULL DEFAULT false,
    "encounterCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "nextEligibleTurn" INTEGER NOT NULL DEFAULT 0,
    "lastTurn" INTEGER NOT NULL DEFAULT -1,
    "lastExercise" "ExerciseType",
    "masteredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewLearningProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewLearningProgress_sessionId_masteredAt_nextEligibleTurn_idx" ON "NewLearningProgress"("sessionId", "masteredAt", "nextEligibleTurn");

-- CreateIndex
CREATE INDEX "NewLearningProgress_vocabularyId_idx" ON "NewLearningProgress"("vocabularyId");

-- CreateIndex
CREATE UNIQUE INDEX "NewLearningProgress_sessionId_vocabularyId_key" ON "NewLearningProgress"("sessionId", "vocabularyId");

-- AddForeignKey
ALTER TABLE "NewLearningProgress" ADD CONSTRAINT "NewLearningProgress_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DailySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewLearningProgress" ADD CONSTRAINT "NewLearningProgress_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
