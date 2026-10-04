import { json } from "@remix-run/node";
import { prisma } from "../utils/db.server";
export async function loader() {
  const [weeks, lessons, vocabulary, readings, memory, skills, reviews] =
    await Promise.all([
      prisma.week.findMany(),
      prisma.lesson.findMany(),
      prisma.vocabulary.findMany(),
      prisma.reading.findMany(),
      prisma.memoryState.findMany(),
      prisma.skillState.findMany(),
      prisma.reviewLog.findMany(),
    ]);
  return json(
    {
      exportedAt: new Date().toISOString(),
      weeks,
      lessons,
      vocabulary,
      readings,
      memory,
      skills,
      reviews,
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename=bright-english-backup-${new Date()
          .toISOString()
          .slice(0, 10)}.json`,
      },
    },
  );
}
