import { prisma } from "../utils/db.server";

const SKILLS = ["meaningRecall", "spelling", "listening", "usage"];

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function getSkillValues(skill) {
  return {
    meaningRecall: skill?.meaningRecall ?? 0,

    spelling: skill?.spelling ?? 0,

    listening: skill?.listening ?? 0,

    usage: skill?.usage ?? 0,
  };
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getWeakestSkill(skills) {
  return Object.entries(skills).sort((a, b) => a[1] - b[1])[0][0];
}

export function calculateWeakProfile(word) {
  const skills = getSkillValues(word.skill);

  const mastery = average(SKILLS.map((skill) => skills[skill]));

  const reviews = word.reviews || [];

  if (!reviews.length) {
    const acquired = word.memory && word.memory.state !== "NEW";
    const weakest = Math.min(...SKILLS.map((key) => skills[key]));
    const needsPractice =
      acquired && (mastery < 0.4 || (weakest < 0.35 && mastery < 0.65));
    return {
      mastery,
      weakness: 1 - mastery,
      wrongRate: 0,
      hintRate: 0,
      slowRate: 0,
      recentFailures: 0,
      score: 1 - mastery,
      status: !acquired
        ? "NEW"
        : word.memory.state === "RELEARNING"
        ? "RELEARNING"
        : needsPractice
        ? "WEAK"
        : "LEARNING",
      weakestSkill: getWeakestSkill(skills),
    };
  }

  const wrongCount = reviews.filter((review) => !review.correct).length;

  const wrongRate = wrongCount / reviews.length;

  const hintCount = reviews.filter(
    (review) => (review.hintsUsed || 0) > 0,
  ).length;

  const hintRate = hintCount / reviews.length;

  const slowCount = reviews.filter(
    (review) => (review.responseTime || 0) > 15000,
  ).length;

  const slowRate = slowCount / reviews.length;

  /**
   * 4 lần gần nhất.
   */
  const recent = reviews.slice(0, 4);

  const recentFailures =
    recent.filter((review) => !review.correct).length /
    Math.max(1, recent.length);

  const weakness = 1 - mastery;

  const score = clamp(
    weakness * 0.45 +
      wrongRate * 0.25 +
      recentFailures * 0.15 +
      hintRate * 0.1 +
      slowRate * 0.05,
  );

  let status = "LEARNING";

  /**
   * Relearning chỉ được tính
   * khi trước đây đã từng
   * trả lời đúng.
   */
  const olderReviews = reviews.slice(2);

  const hadPreviousSuccess = olderReviews.some((review) => review.correct);
  const hadFsrsSuccess = Number(word.memory?.correctReviews || 0) > 0;

  // RELEARNING yêu cầu từ từng được nhớ đúng trong FSRS,
  // không chỉ đúng ở bài kiểm tra trong lúc đang học từ mới.
  if (
    word.memory?.state === "RELEARNING" ||
    (hadPreviousSuccess && hadFsrsSuccess && recentFailures >= 0.5)
  ) {
    status = "RELEARNING";
  } else if (
    score >= 0.58 ||
    (Math.min(...SKILLS.map((key) => skills[key])) < 0.35 && mastery < 0.65)
  ) {
    status = "WEAK";
  } else if (mastery >= 0.82) {
    status = "STRONG";
  } else {
    status = "LEARNING";
  }

  return {
    mastery,
    weakness,

    wrongRate,
    hintRate,
    slowRate,

    recentFailures,

    score,
    status,

    weakestSkill: getWeakestSkill(skills),
  };
}

/**
 * Một từ chỉ đi vào các engine ôn tập SAU KHI hoàn thành học từ mới.
 *
 * Nếu từ đã từng vào New Learning Engine: cần Final Challenge thành công.
 * Nếu là dữ liệu legacy không có NewLearningProgress: cần có FSRS review
 * thực sự (memory.totalReviews > 0), không chỉ một MemoryState trống.
 *
 * Không dùng số lượng ReviewLog để xác định việc đã học: chính New
 * Learning Engine cũng tạo ReviewLog trước khi vượt Final Challenge.
 */
export async function getAcquiredVocabularyIdSet(vocabularyIds = []) {
  const ids = [...new Set(vocabularyIds.filter(Boolean))];
  if (!ids.length) return new Set();

  const [memories, progressRows] = await Promise.all([
    prisma.memoryState.findMany({
      where: { vocabularyId: { in: ids } },
      select: { vocabularyId: true, state: true, totalReviews: true },
    }),
    prisma.newLearningProgress.findMany({
      where: { vocabularyId: { in: ids } },
      select: { vocabularyId: true, finalPass: true, masteredAt: true },
    }),
  ]);

  const acquisition = new Map();
  for (const progress of progressRows) {
    const entry = acquisition.get(progress.vocabularyId) || {
      existed: false,
      completed: false,
    };
    entry.existed = true;
    if (progress.finalPass && progress.masteredAt) entry.completed = true;
    acquisition.set(progress.vocabularyId, entry);
  }

  const eligible = new Set();
  for (const memory of memories) {
    if (memory.state === "NEW") continue;
    const progress = acquisition.get(memory.vocabularyId);
    if (progress ? progress.completed : Number(memory.totalReviews || 0) > 0) {
      eligible.add(memory.vocabularyId);
    }
  }
  return eligible;
}

/** Acquisition logs are not forgetting evidence. Use post-Final reviews only. */
export async function getPostAcquisitionWords(words) {
  const ids = words.map((w) => w.id);
  const acquired = await getAcquiredVocabularyIdSet(ids);
  const finished = await prisma.newLearningProgress.findMany({
    where: {
      vocabularyId: { in: ids },
      finalPass: true,
      masteredAt: { not: null },
    },
    select: { vocabularyId: true, masteredAt: true },
    orderBy: { masteredAt: "asc" },
  });
  const firstMastery = new Map();
  for (const row of finished)
    if (!firstMastery.has(row.vocabularyId)) {
      firstMastery.set(row.vocabularyId, row.masteredAt);
    }
  return words
    .filter((word) => acquired.has(word.id))
    .map((word) => {
      const time = firstMastery.get(word.id);
      const reviews = (word.reviews || []).filter((review) =>
        time
          ? new Date(review.reviewedAt).getTime() >
            new Date(time).getTime() + 1000
          : review.exerciseType === "FLASHCARD",
      );
      return { ...word, reviews, acquisitionFinishedAt: time || null };
    });
}

export async function getWeakWords({ limit = 50 } = {}) {
  const words = await prisma.vocabulary.findMany({
    include: {
      skill: true,
      memory: true,
      reviews: { orderBy: { reviewedAt: "desc" }, take: 20 },
    },
    orderBy: { createdAt: "desc" },
  });
  const ready = await getPostAcquisitionWords(words);
  const now = Date.now();
  return (
    ready
      // Don't immediately reassign newly acquired words in the same sitting.
      .filter(
        (w) =>
          !w.acquisitionFinishedAt ||
          now - new Date(w.acquisitionFinishedAt).getTime() >=
            12 * 60 * 60 * 1000,
      )
      .map((word) => ({ ...word, weakProfile: calculateWeakProfile(word) }))
      .filter((word) =>
        ["WEAK", "RELEARNING"].includes(word.weakProfile.status),
      )
      .sort((a, b) => b.weakProfile.score - a.weakProfile.score)
      .slice(0, limit)
  );
}

export async function getWeakWordStats() {
  const words = await prisma.vocabulary.findMany({
    include: {
      skill: true,
      memory: true,
      reviews: { orderBy: { reviewedAt: "desc" }, take: 20 },
    },
  });
  const ready = await getPostAcquisitionWords(words);
  const readyMap = new Map(ready.map((word) => [word.id, word]));
  const profiles = words.map((word) => {
    const acquired = readyMap.get(word.id);
    return acquired ? calculateWeakProfile(acquired) : { status: "NEW" };
  });
  return {
    total: words.length,
    newWords: profiles.filter((p) => p.status === "NEW").length,
    learning: profiles.filter((p) => p.status === "LEARNING").length,
    weak: profiles.filter((p) => p.status === "WEAK").length,
    relearning: profiles.filter((p) => p.status === "RELEARNING").length,
    strong: profiles.filter((p) => p.status === "STRONG").length,
  };
}
