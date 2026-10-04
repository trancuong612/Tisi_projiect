-- CreateEnum
CREATE TYPE "LessonDay" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "VocabularyKind" AS ENUM ('WORD', 'PHRASE', 'PHRASAL_VERB', 'COLLOCATION', 'IDIOM');

-- CreateEnum
CREATE TYPE "LearningState" AS ENUM ('NEW', 'LEARNING', 'REVIEWING', 'RELEARNING', 'MATURE', 'MASTERED');

-- CreateEnum
CREATE TYPE "ExerciseType" AS ENUM ('FLASHCARD', 'RECOGNITION', 'REVERSE_RECALL', 'CLOZE', 'SPELLING', 'LISTENING', 'DICTATION', 'USAGE');

-- CreateTable
CREATE TABLE "Week" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "startDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Week_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "day" "LessonDay" NOT NULL,
    "dayLabel" TEXT,
    "title" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vocabulary" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT,
    "kind" "VocabularyKind" NOT NULL DEFAULT 'WORD',
    "word" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "ipa" TEXT,
    "partOfSpeech" TEXT,
    "meaning" TEXT NOT NULL,
    "example" TEXT,
    "note" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vocabulary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reading" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryState" (
    "id" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,
    "state" "LearningState" NOT NULL DEFAULT 'NEW',
    "due" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "elapsedDays" INTEGER NOT NULL DEFAULT 0,
    "scheduledDays" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "learningSteps" INTEGER NOT NULL DEFAULT 0,
    "lastReview" TIMESTAMP(3),
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "correctReviews" INTEGER NOT NULL DEFAULT 0,
    "wrongReviews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillState" (
    "id" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,
    "recognition" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "meaningRecall" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spelling" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "listening" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,
    "exerciseType" "ExerciseType" NOT NULL,
    "rating" INTEGER,
    "answer" TEXT,
    "correct" BOOLEAN NOT NULL,
    "responseTime" INTEGER,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Week_number_key" ON "Week"("number");

-- CreateIndex
CREATE INDEX "Lesson_weekId_idx" ON "Lesson"("weekId");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_weekId_day_position_key" ON "Lesson"("weekId", "day", "position");

-- CreateIndex
CREATE INDEX "Vocabulary_normalized_idx" ON "Vocabulary"("normalized");

-- CreateIndex
CREATE INDEX "Vocabulary_lessonId_idx" ON "Vocabulary"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "Reading_lessonId_key" ON "Reading"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryState_vocabularyId_key" ON "MemoryState"("vocabularyId");

-- CreateIndex
CREATE INDEX "MemoryState_due_idx" ON "MemoryState"("due");

-- CreateIndex
CREATE UNIQUE INDEX "SkillState_vocabularyId_key" ON "SkillState"("vocabularyId");

-- CreateIndex
CREATE INDEX "ReviewLog_vocabularyId_reviewedAt_idx" ON "ReviewLog"("vocabularyId", "reviewedAt");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vocabulary" ADD CONSTRAINT "Vocabulary_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reading" ADD CONSTRAINT "Reading_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryState" ADD CONSTRAINT "MemoryState_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillState" ADD CONSTRAINT "SkillState_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
