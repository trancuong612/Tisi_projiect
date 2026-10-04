import { prisma } from "../utils/db.server";

export async function getTodaySummary() {
  const now = new Date();
  const [due, total, weak, readings] = await Promise.all([
    prisma.memoryState.count({ where: { due: { lte: now } } }),
    prisma.vocabulary.count(),
    prisma.skillState.count({
      where: {
        OR: [
          { meaningRecall: { lt: 0.45 } },
          { listening: { lt: 0.35 } },
          { spelling: { lt: 0.4 } },
        ],
      },
    }),
    prisma.reading.count(),
  ]);
  return { due, total, weak, readings };
}

export async function getReviewQueue(limit = 30) {
  return prisma.vocabulary.findMany({
    where: { memory: { due: { lte: new Date() } } },
    include: { memory: true, skill: true, lesson: { include: { week: true } } },
    orderBy: { memory: { due: "asc" } },
    take: limit,
  });
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
