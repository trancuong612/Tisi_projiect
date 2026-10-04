import { prisma } from "../utils/db.server";

const SKILLS = [
  {
    key: "recognition",
    label: "Nhận diện",
  },
  {
    key: "meaningRecall",
    label: "Nhớ nghĩa",
  },
  {
    key: "spelling",
    label: "Chính tả",
  },
  {
    key: "listening",
    label: "Nghe",
  },
  {
    key: "usage",
    label: "Sử dụng",
  },
];

const REVIEW_SKILL_WEIGHTS = {
  FLASHCARD: {
    recognition: 1,
  },

  RECOGNITION: {
    recognition: 1,
  },

  REVERSE_RECALL: {
    meaningRecall: 1,
    spelling: 0.3,
  },

  CLOZE: {
    meaningRecall: 0.45,
    usage: 0.75,
  },

  SPELLING: {
    spelling: 1,
  },

  LISTENING: {
    listening: 1,
  },

  DICTATION: {
    listening: 1,
    spelling: 0.7,
  },

  USAGE: {
    usage: 1,
  },
};

/**
 * Mapping từ skill yếu
 * sang dạng bài Adaptive Practice.
 *
 * Practice hiện tại chủ yếu có:
 * REVERSE_RECALL
 * CLOZE
 * DICTATION
 */
const PRACTICE_EXERCISE_SKILLS = {
  REVERSE_RECALL: {
    meaningRecall: 1,
    spelling: 0.45,
  },

  CLOZE: {
    meaningRecall: 0.55,
    usage: 1,
  },

  DICTATION: {
    listening: 1,
    spelling: 0.8,
  },
};

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function getReviewScore(review) {
  if (review.correct) {
    return review.hintsUsed > 0 ? 0.85 : 1;
  }

  /**
   * AI Usage:
   * PARTIAL = rating 2
   */
  if (review.exerciseType === "USAGE" && review.rating === 2) {
    return 0.5;
  }

  return 0;
}

function calculatePerformance(reviews) {
  const result = Object.fromEntries(
    SKILLS.map((skill) => [
      skill.key,
      {
        total: 0,
        weight: 0,
        attempts: 0,
      },
    ]),
  );

  for (const review of reviews) {
    const weights = REVIEW_SKILL_WEIGHTS[review.exerciseType];

    if (!weights) {
      continue;
    }

    const score = getReviewScore(review);

    for (const [skill, weight] of Object.entries(weights)) {
      result[skill].total += score * weight;

      result[skill].weight += weight;

      result[skill].attempts += 1;
    }
  }

  return Object.fromEntries(
    SKILLS.map((skill) => {
      const item = result[skill.key];

      const value = item.weight > 0 ? item.total / item.weight : null;

      return [
        skill.key,
        {
          value,
          percent: value === null ? null : Math.round(clamp(value) * 100),

          attempts: item.attempts,
        },
      ];
    }),
  );
}

function calculateCurrentSkills(skillStates) {
  return Object.fromEntries(
    SKILLS.map((skill) => {
      if (!skillStates.length) {
        return [skill.key, null];
      }

      const average =
        skillStates.reduce((sum, row) => sum + Number(row[skill.key] || 0), 0) /
        skillStates.length;

      return [skill.key, clamp(average)];
    }),
  );
}

function calculatePriority({
  currentSkills,
  recentPerformance,
  previousPerformance,
}) {
  return SKILLS.map((skill) => {
    const current = currentSkills[skill.key];

    const recent = recentPerformance[skill.key]?.value;

    const previous = previousPerformance[skill.key]?.value;

    /**
     * Nếu chưa có dữ liệu nào
     * thì không ép skill này lên top.
     */
    const hasCurrent = current !== null && current !== undefined;

    const hasRecent = recent !== null && recent !== undefined;

    if (!hasCurrent && !hasRecent) {
      return {
        ...skill,
        current: null,
        recent: null,
        change: null,
        priority: 0,
        score: null,
      };
    }

    /**
     * Knowledge state hiện tại.
     */
    const knowledge = hasCurrent ? current : recent;

    /**
     * Hiệu suất gần đây.
     */
    const recentScore = hasRecent ? recent : knowledge;

    /**
     * Nếu skill gần đây tụt,
     * thêm urgency.
     */
    let declineBoost = 0;

    let change = null;

    if (
      recent !== null &&
      recent !== undefined &&
      previous !== null &&
      previous !== undefined
    ) {
      change = recent - previous;

      if (change < 0) {
        declineBoost = Math.min(Math.abs(change) * 0.35, 0.15);
      }
    }

    /**
     * Priority cao = cần luyện nhiều.
     *
     * 60% state dài hạn
     * 40% recent performance
     * + decline boost
     */
    const combined = knowledge * 0.6 + recentScore * 0.4;

    const priority = clamp(1 - combined + declineBoost, 0, 1);

    return {
      ...skill,

      current: hasCurrent ? Math.round(current * 100) : null,

      recent: hasRecent ? Math.round(recent * 100) : null,

      change: change === null ? null : Math.round(change * 100),

      priority,

      score: Math.round(combined * 100),
    };
  }).sort((a, b) => b.priority - a.priority);
}

function buildExerciseBoost(priorities) {
  const priorityMap = Object.fromEntries(
    priorities.map((item) => [item.key, item.priority]),
  );

  const result = {};

  for (const [exerciseType, skills] of Object.entries(
    PRACTICE_EXERCISE_SKILLS,
  )) {
    let total = 0;
    let totalWeight = 0;

    for (const [skill, weight] of Object.entries(skills)) {
      total += (priorityMap[skill] || 0) * weight;

      totalWeight += weight;
    }

    const weakness = totalWeight > 0 ? total / totalWeight : 0;

    /**
     * Neutral = 1
     * Yếu nhiều → tối đa ~1.8
     */
    result[exerciseType] = Number((1 + weakness * 0.8).toFixed(2));
  }

  return result;
}

function getActionForSkill(skill) {
  switch (skill) {
    case "recognition":
      return {
        path: "/review",
        title: "Ôn nhận diện",
      };

    case "listening":
      return {
        path: "/practice",
        title: "Luyện nghe",
      };

    case "usage":
      return {
        path: "/practice",
        title: "Luyện sử dụng",
      };

    case "spelling":
      return {
        path: "/practice",
        title: "Luyện chính tả",
      };

    default:
      return {
        path: "/practice",
        title: "Luyện nhớ nghĩa",
      };
  }
}

export async function getAdaptiveRecommendation() {
  const now = new Date();

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [skillStates, recentReviews, previousReviews] = await Promise.all([
    prisma.skillState.findMany(),

    prisma.reviewLog.findMany({
      where: {
        reviewedAt: {
          gte: sevenDaysAgo,
        },
      },
    }),

    prisma.reviewLog.findMany({
      where: {
        reviewedAt: {
          gte: fourteenDaysAgo,

          lt: sevenDaysAgo,
        },
      },
    }),
  ]);

  const hasData = skillStates.length > 0 || recentReviews.length > 0;

  if (!hasData) {
    return {
      hasData: false,

      focus: [],

      primaryFocus: null,

      exerciseBoost: {
        REVERSE_RECALL: 1,
        CLOZE: 1,
        DICTATION: 1,
      },
    };
  }

  const currentSkills = calculateCurrentSkills(skillStates);

  const recentPerformance = calculatePerformance(recentReviews);

  const previousPerformance = calculatePerformance(previousReviews);

  const priorities = calculatePriority({
    currentSkills,
    recentPerformance,
    previousPerformance,
  });

  const focus = priorities
    .filter((item) => item.priority > 0)
    .slice(0, 3)
    .map((item) => ({
      ...item,
      action: getActionForSkill(item.key),
    }));

  return {
    hasData: true,

    generatedAt: new Date().toISOString(),

    focus,

    primaryFocus: focus[0] || null,

    allSkills: priorities,

    exerciseBoost: buildExerciseBoost(priorities),
  };
}
