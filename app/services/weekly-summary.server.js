import { prisma } from "../utils/db.server";

const TIME_ZONE = "Asia/Ho_Chi_Minh";

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

function getVietnamParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,

    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function getDateKey(date = new Date()) {
  const parts = getVietnamParts(date);

  return [parts.year, parts.month, parts.day].join("-");
}

function dateKeyToDate(dateKey) {
  return new Date(`${dateKey}T00:00:00+07:00`);
}

function addDays(dateKey, days) {
  const date = dateKeyToDate(dateKey);

  date.setUTCDate(date.getUTCDate() + days);

  return getDateKey(date);
}

function getMonday(date = new Date()) {
  const dateKey = getDateKey(date);

  const base = dateKeyToDate(dateKey);

  /**
   * JS:
   * Sunday = 0
   * Monday = 1
   */
  const day = base.getUTCDay();

  const offset = day === 0 ? -6 : 1 - day;

  return addDays(dateKey, offset);
}

function buildWeekRange(mondayKey) {
  const sundayKey = addDays(mondayKey, 6);

  return {
    startKey: mondayKey,

    endKey: sundayKey,

    start: dateKeyToDate(mondayKey),

    /**
     * lt next Monday
     */
    end: dateKeyToDate(addDays(sundayKey, 1)),
  };
}

function reviewScore(review) {
  if (review.correct) {
    return review.hintsUsed > 0 ? 0.85 : 1;
  }

  /**
   * AI Usage PARTIAL
   */
  if (review.exerciseType === "USAGE" && review.rating === 2) {
    return 0.5;
  }

  return 0;
}

function calculateTotals(reviews) {
  const total = reviews.length;

  const correct = reviews.filter((item) => item.correct).length;

  const hints = reviews.filter((item) => item.hintsUsed > 0).length;

  const uniqueWords = new Set(reviews.map((item) => item.vocabularyId)).size;

  return {
    reviews: total,

    correct,

    accuracy: total ? Math.round((correct / total) * 100) : 0,

    uniqueWords,

    hintRate: total ? Math.round((hints / total) * 100) : 0,
  };
}

function emptySkillMap() {
  return Object.fromEntries(
    SKILLS.map((skill) => [
      skill.key,
      {
        total: 0,
        weight: 0,
        attempts: 0,
      },
    ]),
  );
}

function calculateSkills(reviews) {
  const map = emptySkillMap();

  for (const review of reviews) {
    const weights = EXERCISE_SKILLS[review.exerciseType];

    if (!weights) {
      continue;
    }

    const score = reviewScore(review);

    for (const [skill, weight] of Object.entries(weights)) {
      map[skill].total += score * weight;

      map[skill].weight += weight;

      map[skill].attempts += 1;
    }
  }

  return Object.fromEntries(
    SKILLS.map((skill) => {
      const item = map[skill.key];

      const value = item.weight ? item.total / item.weight : null;

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

function calculateHardWords(reviews) {
  const map = new Map();

  for (const review of reviews) {
    const id = review.vocabularyId;

    if (!map.has(id)) {
      map.set(id, {
        id,

        word: review.vocabulary?.word || "",

        meaning: review.vocabulary?.meaning || "",

        attempts: 0,
        correct: 0,
        hints: 0,
      });
    }

    const item = map.get(id);

    item.attempts += 1;

    if (review.correct) {
      item.correct += 1;
    }

    if (review.hintsUsed > 0) {
      item.hints += 1;
    }
  }

  return [...map.values()]
    .filter((item) => item.attempts >= 2)
    .map((item) => {
      const accuracy = item.correct / item.attempts;

      const hintRate = item.hints / item.attempts;

      return {
        ...item,

        accuracy: Math.round(accuracy * 100),

        weakness: (1 - accuracy) * 0.8 + hintRate * 0.2,
      };
    })
    .sort((a, b) => b.weakness - a.weakness)
    .slice(0, 8);
}

function buildSkillComparison(current, previous) {
  return SKILLS.map((skill) => {
    const currentItem = current[skill.key];

    const previousItem = previous[skill.key];

    const change =
      currentItem.percent === null || previousItem.percent === null
        ? null
        : currentItem.percent - previousItem.percent;

    return {
      ...skill,

      percent: currentItem.percent,

      attempts: currentItem.attempts,

      previousPercent: previousItem.percent,

      change,
    };
  });
}

function buildFocus({ skillComparison, skillStates }) {
  const currentState = Object.fromEntries(
    SKILLS.map((skill) => {
      if (!skillStates.length) {
        return [skill.key, 0];
      }

      const average =
        skillStates.reduce((sum, row) => sum + Number(row[skill.key] || 0), 0) /
        skillStates.length;

      return [skill.key, average];
    }),
  );

  return skillComparison
    .map((skill) => {
      const recent = skill.percent === null ? null : skill.percent / 100;

      const state = currentState[skill.key] || 0;

      const combined = recent === null ? state : state * 0.6 + recent * 0.4;

      /**
       * Nếu tuần này đang tụt,
       * tăng priority.
       */
      const declineBoost =
        skill.change !== null && skill.change < 0
          ? Math.min(Math.abs(skill.change) / 100, 0.15)
          : 0;

      return {
        ...skill,

        priority: 1 - combined + declineBoost,

        score: Math.round(combined * 100),
      };
    })
    .sort((a, b) => b.priority - a.priority);
}

function calculateDailyActivity(reviews, mondayKey) {
  return Array.from(
    {
      length: 7,
    },
    (_, index) => {
      const dateKey = addDays(mondayKey, index);

      const dayReviews = reviews.filter(
        (review) => getDateKey(review.reviewedAt) === dateKey,
      );

      return {
        dateKey,

        reviews: dayReviews.length,

        accuracy: dayReviews.length
          ? Math.round(
              (dayReviews.filter((item) => item.correct).length /
                dayReviews.length) *
                100,
            )
          : null,
      };
    },
  );
}

function diff(current, previous) {
  return current - previous;
}

export async function getWeeklySummary() {
  const currentMonday = getMonday();

  const previousMonday = addDays(currentMonday, -7);

  const currentRange = buildWeekRange(currentMonday);

  const previousRange = buildWeekRange(previousMonday);

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

  const currentTotals = calculateTotals(currentReviews);

  const previousTotals = calculateTotals(previousReviews);

  const currentSkills = calculateSkills(currentReviews);

  const previousSkills = calculateSkills(previousReviews);

  const skillComparison = buildSkillComparison(currentSkills, previousSkills);

  const focus = buildFocus({
    skillComparison,
    skillStates,
  });

  return {
    currentWeek: {
      start: currentRange.startKey,

      end: currentRange.endKey,
    },

    previousWeek: {
      start: previousRange.startKey,

      end: previousRange.endKey,
    },

    totals: currentTotals,

    previousTotals,

    comparison: {
      reviews: diff(currentTotals.reviews, previousTotals.reviews),

      uniqueWords: diff(currentTotals.uniqueWords, previousTotals.uniqueWords),

      accuracy: diff(currentTotals.accuracy, previousTotals.accuracy),

      hintRate: diff(currentTotals.hintRate, previousTotals.hintRate),
    },

    skills: skillComparison,

    focus: focus.slice(0, 3),

    hardWords: calculateHardWords(currentReviews),

    dailyActivity: calculateDailyActivity(currentReviews, currentMonday),
  };
}
