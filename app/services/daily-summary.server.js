import { prisma } from "../utils/db.server";

import { getWeakWords } from "./weak-words.server";

import { getDailySessionProgress } from "./daily-session.server";

const SKILL_LABELS = {
  recognition: "Nhận diện",
  meaningRecall: "Nhớ nghĩa",
  spelling: "Chính tả",
  listening: "Nghe",
  usage: "Sử dụng",
};

const EXERCISE_LABELS = {
  FLASHCARD: "Flashcard",
  RECOGNITION: "Nhận diện",
  REVERSE_RECALL: "Nhớ ngược",
  CLOZE: "Điền từ",
  SPELLING: "Chính tả",
  LISTENING: "Nghe",
  DICTATION: "Nghe viết",
  USAGE: "Sử dụng",
};

function toArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}

export function getVietnamDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",

    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function getVietnamDayRange(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);

  /**
   * 00:00 Việt Nam
   * =
   * 17:00 UTC ngày hôm trước.
   */
  const start = new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0));

  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    start,
    end,
  };
}

function percentage(value, total) {
  if (!total) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildExerciseStats(logs) {
  const map = new Map();

  for (const log of logs) {
    const key = log.exerciseType;

    if (!map.has(key)) {
      map.set(key, {
        type: key,

        label: EXERCISE_LABELS[key] || key,

        total: 0,
        correct: 0,
        wrong: 0,

        hints: 0,

        responseTimes: [],
      });
    }

    const item = map.get(key);

    item.total += 1;

    if (log.correct) {
      item.correct += 1;
    } else {
      item.wrong += 1;
    }

    if ((log.hintsUsed || 0) > 0) {
      item.hints += 1;
    }

    if (typeof log.responseTime === "number" && log.responseTime >= 0) {
      item.responseTimes.push(log.responseTime);
    }
  }

  return Array.from(map.values())
    .map((item) => ({
      type: item.type,
      label: item.label,

      total: item.total,
      correct: item.correct,
      wrong: item.wrong,

      accuracy: percentage(item.correct, item.total),

      hintRate: percentage(item.hints, item.total),

      averageResponseSeconds: item.responseTimes.length
        ? Number((average(item.responseTimes) / 1000).toFixed(1))
        : null,
    }))
    .sort((a, b) => b.total - a.total);
}

function buildWordStats(logs) {
  const map = new Map();

  for (const log of logs) {
    const id = log.vocabularyId;

    if (!map.has(id)) {
      map.set(id, {
        id,

        word: log.vocabulary.word,

        meaning: log.vocabulary.meaning,

        total: 0,
        correct: 0,
        wrong: 0,

        hints: 0,

        slow: 0,

        responseTimes: [],
      });
    }

    const item = map.get(id);

    item.total += 1;

    if (log.correct) {
      item.correct += 1;
    } else {
      item.wrong += 1;
    }

    if ((log.hintsUsed || 0) > 0) {
      item.hints += 1;
    }

    if (typeof log.responseTime === "number") {
      item.responseTimes.push(log.responseTime);

      if (log.responseTime > 15000) {
        item.slow += 1;
      }
    }
  }

  return Array.from(map.values()).map((item) => {
    /**
     * Đây chỉ là ranking nội bộ
     * để tìm từ cần chú ý,
     * không phải "điểm học tập".
     */
    const difficultyScore = item.wrong * 3 + item.hints * 1.5 + item.slow;

    return {
      ...item,

      accuracy: percentage(item.correct, item.total),

      averageResponseSeconds: item.responseTimes.length
        ? Number((average(item.responseTimes) / 1000).toFixed(1))
        : null,

      difficultyScore,
    };
  });
}

function buildFocus(weakWords) {
  if (!weakWords.length) {
    return {
      skill: null,

      skillLabel: "Củng cố tổng hợp",

      relearning: 0,

      weak: 0,

      message:
        "Hiện chưa có nhóm từ yếu nổi bật. Learning Engine sẽ tiếp tục theo dõi dữ liệu ở các buổi học tiếp theo.",
    };
  }

  const relearning = weakWords.filter(
    (word) => word.weakProfile.status === "RELEARNING",
  ).length;

  const weak = weakWords.filter(
    (word) => word.weakProfile.status === "WEAK",
  ).length;

  const skillCounts = {};

  for (const word of weakWords) {
    const skill = word.weakProfile.weakestSkill;

    skillCounts[skill] = (skillCounts[skill] || 0) + 1;
  }

  const sortedSkills = Object.entries(skillCounts).sort((a, b) => b[1] - a[1]);

  const topSkill = sortedSkills[0]?.[0] || null;

  let message = "";

  if (relearning > 0) {
    message =
      `Có ${relearning} từ đang ở trạng thái học lại. ` +
      "Hệ thống sẽ tiếp tục ưu tiên chúng trước khi tăng lượng kiến thức mới.";
  } else if (topSkill) {
    message =
      `Kỹ năng cần chú ý nhất hiện tại là ${
        SKILL_LABELS[topSkill] || topSkill
      }. ` + "Adaptive Practice sẽ tăng bài tập nhắm vào kỹ năng này.";
  } else {
    message = "Tiếp tục duy trì nhịp học hiện tại.";
  }

  return {
    skill: topSkill,

    skillLabel: SKILL_LABELS[topSkill] || "Củng cố tổng hợp",

    relearning,
    weak,

    message,
  };
}

export async function getDailySummary({ dateKey = getVietnamDateKey() } = {}) {
  const session = await prisma.dailySession.findUnique({
    where: {
      dateKey,
    },
  });

  if (!session) {
    return null;
  }

  const { start, end } = getVietnamDayRange(dateKey);

  const logs = await prisma.reviewLog.findMany({
    where: {
      reviewedAt: {
        gte: start,
        lt: end,
      },
    },

    include: {
      vocabulary: {
        select: {
          id: true,
          word: true,
          meaning: true,
        },
      },
    },

    orderBy: {
      reviewedAt: "asc",
    },
  });

  const progress = await getDailySessionProgress(session);

  const total = logs.length;

  const correct = logs.filter((log) => log.correct).length;

  const wrong = total - correct;

  const withHints = logs.filter((log) => (log.hintsUsed || 0) > 0).length;

  const withoutHints = total - withHints;

  const slowAnswers = logs.filter(
    (log) => typeof log.responseTime === "number" && log.responseTime > 15000,
  ).length;

  const responseTimes = logs
    .map((log) => log.responseTime)
    .filter((value) => typeof value === "number" && value >= 0);

  const uniqueIds = new Set(logs.map((log) => log.vocabularyId));

  const exerciseStats = buildExerciseStats(logs);

  const wordStats = buildWordStats(logs);

  /**
   * Các từ cần chú ý nhất hôm nay.
   */
  const hardestWords = wordStats
    .filter((word) => word.wrong > 0 || word.hints > 0 || word.slow > 0)
    .sort((a, b) => b.difficultyScore - a.difficultyScore)
    .slice(0, 5);

  /**
   * Các từ thể hiện recall tốt:
   * đúng hết + không hint.
   */
  const strongestWords = wordStats
    .filter(
      (word) =>
        word.total > 0 && word.correct === word.total && word.hints === 0,
    )
    .sort((a, b) => {
      const timeA = a.averageResponseSeconds ?? 999;

      const timeB = b.averageResponseSeconds ?? 999;

      return timeA - timeB;
    })
    .slice(0, 5);

  const weakWords = await getWeakWords({
    limit: 100,
  });

  const focus = buildFocus(weakWords);

  const readingTargets = toArray(session.readingTargets);

  const completedReadings = toArray(session.completedReadingTargets);

  return {
    dateKey,

    day: session.day,

    weekNumber: session.weekNumber,

    startedAt: session.startedAt,

    progress,

    overview: {
      totalReviews: total,

      uniqueWords: uniqueIds.size,

      correct,
      wrong,

      accuracy: percentage(correct, total),

      noHintRate: percentage(withoutHints, total),

      hintRate: percentage(withHints, total),

      slowRate: percentage(slowAnswers, total),

      averageResponseSeconds: responseTimes.length
        ? Number((average(responseTimes) / 1000).toFixed(1))
        : null,

      readingsCompleted: readingTargets.filter((id) =>
        completedReadings.includes(id),
      ).length,

      readingsTotal: readingTargets.length,
    },

    exercises: exerciseStats,

    hardestWords,
    strongestWords,

    focus,
  };
}
