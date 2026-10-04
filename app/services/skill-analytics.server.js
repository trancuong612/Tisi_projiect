import { prisma } from "../utils/db.server";

const TIME_ZONE = "Asia/Ho_Chi_Minh";

export const SKILL_META = [
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

const EXERCISE_SKILLS = {
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

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 0) {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function percent(value) {
  return Math.round(clamp(value) * 100);
}

function getDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,

    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(map.year),

    month: Number(map.month),

    day: Number(map.day),
  };
}

export function getVietnamDateKey(date = new Date()) {
  const { year, month, day } = getDateParts(date);

  return [
    year,
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function dateKeyToUTC(dateKey) {
  return new Date(`${dateKey}T00:00:00+07:00`);
}

function addDaysToDateKey(dateKey, days) {
  const date = dateKeyToUTC(dateKey);

  date.setUTCDate(date.getUTCDate() + days);

  return getVietnamDateKey(date);
}

function getRange({ endDateKey, days }) {
  const startDateKey = addDaysToDateKey(endDateKey, -(days - 1));

  const start = dateKeyToUTC(startDateKey);

  const end = dateKeyToUTC(addDaysToDateKey(endDateKey, 1));

  return {
    startDateKey,
    endDateKey,
    start,
    end,
  };
}

function getReviewScore(review) {
  /**
   * USAGE PARTIAL:
   * rating = 2
   * correct = false
   *
   * vẫn có một phần
   * kiến thức đúng.
   */
  let score = 0;

  if (review.correct) {
    score = 1;
  } else if (review.exerciseType === "USAGE" && review.rating === 2) {
    score = 0.5;
  }

  /**
   * Dùng hint thì
   * giảm chất lượng recall.
   */
  if (review.hintsUsed > 0) {
    score *= 0.85;
  }

  return clamp(score);
}

function emptySkillAccumulator() {
  return {
    recognition: {
      score: 0,
      weight: 0,
      attempts: 0,
    },

    meaningRecall: {
      score: 0,
      weight: 0,
      attempts: 0,
    },

    spelling: {
      score: 0,
      weight: 0,
      attempts: 0,
    },

    listening: {
      score: 0,
      weight: 0,
      attempts: 0,
    },

    usage: {
      score: 0,
      weight: 0,
      attempts: 0,
    },
  };
}

function calculateSkillPerformance(reviews) {
  const accumulator = emptySkillAccumulator();

  for (const review of reviews) {
    const weights = EXERCISE_SKILLS[review.exerciseType];

    if (!weights) {
      continue;
    }

    const score = getReviewScore(review);

    for (const [skill, weight] of Object.entries(weights)) {
      accumulator[skill].score += score * weight;

      accumulator[skill].weight += weight;

      accumulator[skill].attempts += 1;
    }
  }

  return Object.fromEntries(
    SKILL_META.map(({ key }) => {
      const item = accumulator[key];

      const value = item.weight ? item.score / item.weight : null;

      return [
        key,
        {
          value,
          percent: value === null ? null : percent(value),

          attempts: item.attempts,
        },
      ];
    }),
  );
}

function calculateCurrentSkillAverage(skillStates) {
  const result = {};

  for (const { key } of SKILL_META) {
    if (!skillStates.length) {
      result[key] = {
        value: 0,
        percent: 0,
      };

      continue;
    }

    const average =
      skillStates.reduce((sum, item) => sum + Number(item[key] || 0), 0) /
      skillStates.length;

    result[key] = {
      value: clamp(average),

      percent: percent(average),
    };
  }

  return result;
}

function calculateTotals(reviews) {
  const total = reviews.length;

  const correct = reviews.filter((review) => review.correct).length;

  const hints = reviews.filter((review) => review.hintsUsed > 0).length;

  const responseTimes = reviews
    .map((review) => review.responseTime)
    .filter((value) => Number(value) > 0);

  const uniqueWords = new Set(reviews.map((review) => review.vocabularyId))
    .size;

  const averageResponseTime = responseTimes.length
    ? responseTimes.reduce((sum, value) => sum + Number(value), 0) /
      responseTimes.length
    : 0;

  return {
    reviews: total,

    correct,

    accuracy: total ? Math.round((correct / total) * 100) : 0,

    uniqueWords,

    hintRate: total ? Math.round((hints / total) * 100) : 0,

    averageResponseTime: Math.round(averageResponseTime),
  };
}

function calculateExerciseStats(reviews) {
  const groups = {};

  for (const review of reviews) {
    const key = review.exerciseType;

    if (!groups[key]) {
      groups[key] = {
        type: key,
        attempts: 0,
        correct: 0,
      };
    }

    groups[key].attempts += 1;

    if (review.correct) {
      groups[key].correct += 1;
    }
  }

  return Object.values(groups)
    .map((item) => ({
      ...item,

      accuracy: item.attempts
        ? Math.round((item.correct / item.attempts) * 100)
        : 0,
    }))
    .sort((a, b) => b.attempts - a.attempts);
}

function calculateHardWords(reviews) {
  const words = new Map();

  for (const review of reviews) {
    const id = review.vocabularyId;

    if (!words.has(id)) {
      words.set(id, {
        id,

        word: review.vocabulary?.word || "Unknown",

        meaning: review.vocabulary?.meaning || "",

        attempts: 0,

        correct: 0,

        hints: 0,

        totalResponse: 0,

        responseCount: 0,
      });
    }

    const item = words.get(id);

    item.attempts += 1;

    if (review.correct) {
      item.correct += 1;
    }

    if (review.hintsUsed > 0) {
      item.hints += 1;
    }

    if (Number(review.responseTime) > 0) {
      item.totalResponse += Number(review.responseTime);

      item.responseCount += 1;
    }
  }

  return [...words.values()]
    .filter((item) => item.attempts >= 2)
    .map((item) => {
      const accuracy = item.correct / item.attempts;

      const hintRate = item.hints / item.attempts;

      const weakness = (1 - accuracy) * 0.75 + hintRate * 0.25;

      return {
        ...item,

        accuracy: Math.round(accuracy * 100),

        weakness,

        averageResponseTime: item.responseCount
          ? Math.round(item.totalResponse / item.responseCount)
          : 0,
      };
    })
    .sort((a, b) => b.weakness - a.weakness)
    .slice(0, 10);
}

function calculateDailyActivity(reviews, startDateKey, endDateKey) {
  const map = new Map();

  let cursor = startDateKey;

  while (true) {
    map.set(cursor, {
      dateKey: cursor,
      reviews: 0,
      correct: 0,
    });

    if (cursor === endDateKey) {
      break;
    }

    cursor = addDaysToDateKey(cursor, 1);
  }

  for (const review of reviews) {
    const dateKey = getVietnamDateKey(review.reviewedAt);

    const item = map.get(dateKey);

    if (!item) {
      continue;
    }

    item.reviews += 1;

    if (review.correct) {
      item.correct += 1;
    }
  }

  return [...map.values()].map((item) => ({
    ...item,

    accuracy: item.reviews
      ? Math.round((item.correct / item.reviews) * 100)
      : null,
  }));
}

function calculateFocus({ currentSkill, performance }) {
  return SKILL_META.map((meta) => {
    const current = currentSkill[meta.key]?.value ?? 0;

    const recent = performance[meta.key]?.value;

    /**
     * 65% trạng thái skill
     * 35% recent performance.
     */
    const score =
      recent === null || recent === undefined
        ? current
        : current * 0.65 + recent * 0.35;

    return {
      ...meta,

      score,

      percent: percent(score),
    };
  }).sort((a, b) => a.score - b.score);
}

export async function getSkillAnalytics({ days = 30 } = {}) {
  const safeDays = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;

  const today = getVietnamDateKey();

  const currentRange = getRange({
    endDateKey: today,

    days: safeDays,
  });

  const previousEnd = addDaysToDateKey(currentRange.startDateKey, -1);

  const previousRange = getRange({
    endDateKey: previousEnd,

    days: safeDays,
  });

  const [currentReviews, previousReviews, skillStates] = await Promise.all([
    prisma.reviewLog.findMany({
      where: {
        reviewedAt: {
          gte: currentRange.start,

          lt: currentRange.end,
        },
      },

      include: {
        vocabulary: {
          select: {
            word: true,
            meaning: true,
          },
        },
      },

      orderBy: {
        reviewedAt: "asc",
      },
    }),

    prisma.reviewLog.findMany({
      where: {
        reviewedAt: {
          gte: previousRange.start,

          lt: previousRange.end,
        },
      },
    }),

    prisma.skillState.findMany(),
  ]);

  const currentSkill = calculateCurrentSkillAverage(skillStates);

  const performance = calculateSkillPerformance(currentReviews);

  const previousPerformance = calculateSkillPerformance(previousReviews);

  const trends = Object.fromEntries(
    SKILL_META.map(({ key }) => {
      const current = performance[key]?.percent;

      const previous = previousPerformance[key]?.percent;

      return [
        key,
        current === null || previous === null ? null : current - previous,
      ];
    }),
  );

  return {
    days: safeDays,

    dateRange: {
      start: currentRange.startDateKey,

      end: currentRange.endDateKey,
    },

    totals: calculateTotals(currentReviews),

    currentSkill,

    performance,

    previousPerformance,

    trends,

    focus: calculateFocus({
      currentSkill,
      performance,
    }),

    hardestWords: calculateHardWords(currentReviews),

    exerciseStats: calculateExerciseStats(currentReviews),

    dailyActivity: calculateDailyActivity(
      currentReviews,
      currentRange.startDateKey,
      currentRange.endDateKey,
    ),
  };
}
