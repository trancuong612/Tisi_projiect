import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Resetting Tisi learning data...");

  const result = await prisma.$transaction(async (tx) => {
    /*
     * Xóa progress của New Learning Engine trước.
     */
    const newLearningProgress = await tx.newLearningProgress.deleteMany();

    /*
     * Xóa lịch sử luyện tập.
     */
    const reviewLogs = await tx.reviewLog.deleteMany();

    /*
     * Xóa trạng thái kỹ năng.
     */
    const skillStates = await tx.skillState.deleteMany();

    /*
     * Xóa trạng thái FSRS / memory.
     */
    const memoryStates = await tx.memoryState.deleteMany();

    /*
     * Xóa lexical insights do AI tạo.
     */
    const vocabularyInsights = await tx.vocabularyInsight.deleteMany();

    /*
     * Xóa Daily Session snapshots.
     */
    const dailySessions = await tx.dailySession.deleteMany();

    /*
     * Xóa Reading trước Lesson.
     */
    const readings = await tx.reading.deleteMany();

    /*
     * Xóa vocabulary.
     */
    const vocabulary = await tx.vocabulary.deleteMany();

    /*
     * Xóa curriculum.
     */
    const lessons = await tx.lesson.deleteMany();

    const weeks = await tx.week.deleteMany();

    return {
      newLearningProgress: newLearningProgress.count,
      reviewLogs: reviewLogs.count,
      skillStates: skillStates.count,
      memoryStates: memoryStates.count,
      vocabularyInsights: vocabularyInsights.count,
      dailySessions: dailySessions.count,
      readings: readings.count,
      vocabulary: vocabulary.count,
      lessons: lessons.count,
      weeks: weeks.count,
    };
  });

  console.log("");
  console.log("✅ Tisi learning data cleared.");
  console.table(result);
  console.log("");
  console.log("Database schema and migrations were NOT deleted.");
}

main()
  .catch((error) => {
    console.error("❌ Reset failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
