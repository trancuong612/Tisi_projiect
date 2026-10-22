import { prisma } from "../utils/db.server";
import { getWeakWords, getAcquiredVocabularyIdSet } from "./weak-words.server";

export async function getTodaySummary() {
  const now = new Date();
  const [allDue, total, weakWords, readings] = await Promise.all([
    prisma.memoryState.findMany({
      where: { due: { lte: now }, state: { not: "NEW" } },
      select: { vocabularyId: true },
    }),
    prisma.vocabulary.count(),
    getWeakWords({ limit: 10000 }),
    prisma.reading.count(),
  ]);
  const acquired = await getAcquiredVocabularyIdSet(
    allDue.map((v) => v.vocabularyId),
  );
  return {
    due: allDue.filter((v) => acquired.has(v.vocabularyId)).length,
    total,
    weak: weakWords.length,
    readings,
  };
}

export async function getReviewQueue(limit = 30) {
  const now = new Date();
  const memories = await prisma.memoryState.findMany({
    where: { due: { lte: now }, state: { not: "NEW" } },
    select: { vocabularyId: true },
    orderBy: { due: "asc" },
  });
  const acquired = await getAcquiredVocabularyIdSet(
    memories.map((v) => v.vocabularyId),
  );
  const ids = memories
    .map((v) => v.vocabularyId)
    .filter((id) => acquired.has(id))
    .slice(0, limit);
  const words = await prisma.vocabulary.findMany({
    where: { id: { in: ids } },
    include: { memory: true, skill: true, lesson: { include: { week: true } } },
  });
  const map = new Map(words.map((word) => [word.id, word]));
  return ids.map((id) => map.get(id)).filter(Boolean);
}

export async function getNewWords(limit = 30) {
  return prisma.vocabulary.findMany({
    where: {
      OR: [
        {
          memory: null,
        },

        {
          memory: {
            state: "NEW",
          },
        },
      ],
    },

    include: {
      memory: true,
      skill: true,

      lesson: {
        include: {
          week: true,
        },
      },
    },

    orderBy: {
      createdAt: "asc",
    },

    take: limit,
  });
}
