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
    return {
      mastery,

      weakness: 1 - mastery,

      wrongRate: 0,
      hintRate: 0,
      slowRate: 0,
      recentFailures: 0,

      score: 1 - mastery,

      status: "NEW",

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

  if (reviews.length >= 4 && hadPreviousSuccess && recentFailures >= 0.5) {
    status = "RELEARNING";
  } else if (score >= 0.65) {
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

export async function getWeakWords({ limit = 50 } = {}) {
  const words = await prisma.vocabulary.findMany({
    include: {
      skill: true,
      memory: true,

      reviews: {
        orderBy: {
          reviewedAt: "desc",
        },

        take: 20,
      },
    },

    orderBy: {
      createdAt: "desc",
    },
  });

  return words
    .map((word) => ({
      ...word,

      weakProfile: calculateWeakProfile(word),
    }))
    .filter(
      (word) =>
        word.weakProfile.status === "WEAK" ||
        word.weakProfile.status === "RELEARNING",
    )
    .sort((a, b) => b.weakProfile.score - a.weakProfile.score)
    .slice(0, limit);
}

export async function getWeakWordStats() {
  const words = await prisma.vocabulary.findMany({
    include: {
      skill: true,

      reviews: {
        orderBy: {
          reviewedAt: "desc",
        },

        take: 20,
      },
    },
  });

  const profiles = words.map(calculateWeakProfile);

  return {
    total: words.length,

    newWords: profiles.filter((profile) => profile.status === "NEW").length,

    learning: profiles.filter((profile) => profile.status === "LEARNING")
      .length,

    weak: profiles.filter((profile) => profile.status === "WEAK").length,

    relearning: profiles.filter((profile) => profile.status === "RELEARNING")
      .length,

    strong: profiles.filter((profile) => profile.status === "STRONG").length,
  };
}
