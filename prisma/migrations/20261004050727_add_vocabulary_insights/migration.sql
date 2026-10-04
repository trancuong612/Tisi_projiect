-- CreateTable
CREATE TABLE "VocabularyInsight" (
    "id" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,
    "collocations" JSONB NOT NULL,
    "chunks" JSONB NOT NULL,
    "confusions" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabularyInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyInsight_vocabularyId_key" ON "VocabularyInsight"("vocabularyId");

-- AddForeignKey
ALTER TABLE "VocabularyInsight" ADD CONSTRAINT "VocabularyInsight_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
