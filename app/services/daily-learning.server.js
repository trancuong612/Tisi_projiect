import { prisma } from "../utils/db.server";

import { getWeakWords, getAcquiredVocabularyIdSet } from "./weak-words.server";

import { buildDailyWorkload } from "./daily-workload.server";

import {
  getOrCreateDailySession,
  getDailySessionProgress,
} from "./daily-session.server";

const DAY_MAP = {
  Monday: "MONDAY",
  Tuesday: "TUESDAY",
  Wednesday: "WEDNESDAY",
  Thursday: "THURSDAY",
  Friday: "FRIDAY",
  Saturday: "SATURDAY",
  Sunday: "SUNDAY",
};

const DAY_LABELS = {
  MONDAY: "Thứ Hai",
  TUESDAY: "Thứ Ba",
  WEDNESDAY: "Thứ Tư",
  THURSDAY: "Thứ Năm",
  FRIDAY: "Thứ Sáu",
  SATURDAY: "Thứ Bảy",
  SUNDAY: "Chủ Nhật",
};

function getVietnamDateInfo(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",

    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });

  const parts = formatter.formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const year = Number(values.year);

  const month = Number(values.month);

  const day = Number(values.day);

  const dateKey =
    `${year}-` +
    `${String(month).padStart(2, "0")}-` +
    `${String(day).padStart(2, "0")}`;

  const startOfDay = new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0));

  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

  const dayEnum = DAY_MAP[values.weekday];

  return {
    dateKey,

    year,
    month,
    day,

    dayEnum,

    dayLabel: DAY_LABELS[dayEnum],

    startOfDay,
    endOfDay,
  };
}

async function getActiveWeek(endOfToday) {
  let week = await prisma.week.findFirst({
    where: {
      startDate: {
        lte: endOfToday,
      },
    },

    orderBy: {
      startDate: "desc",
    },
  });

  if (!week) {
    week = await prisma.week.findFirst({
      orderBy: {
        number: "desc",
      },
    });
  }

  return week;
}

async function getTodayLessons({ weekId, dayEnum }) {
  if (!weekId || !dayEnum) {
    return [];
  }

  return prisma.lesson.findMany({
    where: {
      weekId,
      day: dayEnum,
    },

    include: {
      reading: true,

      vocabulary: {
        include: {
          memory: true,
        },
      },
    },

    orderBy: {
      position: "asc",
    },
  });
}

export async function getDailyLearningQueue() {
  const now = new Date();

  const dateInfo = getVietnamDateInfo(now);

  const activeWeek = await getActiveWeek(dateInfo.endOfDay);

  const lessons = await getTodayLessons({
    weekId: activeWeek?.id,

    dayEnum: dateInfo.dayEnum,
  });

  /**
   * Curriculum new words.
   */
  const curriculumIds = lessons.flatMap((lesson) =>
    lesson.vocabulary.map((word) => word.id),
  );
  const acquiredCurriculum = await getAcquiredVocabularyIdSet(curriculumIds);
  const newWordIds = [...new Set(curriculumIds)].filter(
    (id) => !acquiredCurriculum.has(id),
  );

  /**
   * Reading curriculum.
   */
  const readingIds = lessons
    .filter((lesson) => Boolean(lesson.reading))
    .map((lesson) => lesson.reading.id);

  /**
   * Weak Engine.
   */
  const weakWords = await getWeakWords({
    limit: 1000,
  });

  /**
   * Raw FSRS backlog.
   */
  const rawDueMemories = await prisma.memoryState.findMany({
    where: {
      due: {
        lte: now,
      },

      state: {
        not: "NEW",
      },

      /**
       * Từ mới của curriculum hôm nay
       * chưa được phép xuất hiện trong Review.
       *
       * Chúng phải hoàn thành New Learning Engine
       * trước, sau đó mới được FSRS tiếp quản.
       */
      vocabularyId: {
        notIn: newWordIds,
      },
    },

    include: {
      vocabulary: {
        select: {
          id: true,
          importance: true,
        },
      },
    },
  });

  // Gate cuối: loại cả từ chưa học của hôm khác, và từ đã có
  // ReviewLog trong lúc New Learning Engine nhưng chưa vượt Final.
  const acquiredDue = await getAcquiredVocabularyIdSet(
    rawDueMemories.map((memory) => memory.vocabularyId),
  );
  const dueMemories = rawDueMemories.filter((memory) =>
    acquiredDue.has(memory.vocabularyId),
  );

  /**
   * Activity gần nhất.
   */
  const lastActivity = await prisma.reviewLog.findFirst({
    orderBy: {
      reviewedAt: "desc",
    },

    select: {
      reviewedAt: true,
    },
  });

  /**
   * Adaptive Workload.
   */
  const workload = buildDailyWorkload({
    now,

    dueMemories,

    weakWords,

    newWordIds,

    lastActivityAt: lastActivity?.reviewedAt ?? null,
  });

  /**
   * Snapshot hôm nay.
   */
  const session = await getOrCreateDailySession({
    dateKey: dateInfo.dateKey,

    day: dateInfo.dayEnum,

    weekNumber: activeWeek?.number ?? null,

    targets: workload.targets,

    readings: readingIds,

    workloadMode: workload.mode,

    workloadMeta: {
      reason: workload.reason,

      daysSinceLastActivity: workload.daysSinceLastActivity,

      raw: workload.raw,

      selected: workload.selected,

      deferred: workload.deferred,
    },
  });

  const progress = await getDailySessionProgress(session);

  const stepMap = Object.fromEntries(
    progress.steps.map((step) => [step.key, step]),
  );

  const queue = [
    {
      key: "DUE",

      title: "Ôn từ đến hạn",

      description: "FSRS chọn những từ đang đến thời điểm cần gọi lại.",

      path: "/review",

      priority: 1,

      ...stepMap.DUE,
    },

    {
      key: "RELEARNING",

      title: "Từ cần học lại",

      description: "Những từ từng biết nhưng gần đây bắt đầu quên.",

      path: "/practice?mode=relearning",

      priority: 2,

      ...stepMap.RELEARNING,
    },

    {
      key: "NEW",

      title: "Từ mới hôm nay",

      description: "Bộ từ mới được Workload Engine cho phép học hôm nay.",

      path: "/learn",

      priority: 3,

      ...stepMap.NEW,
    },

    {
      key: "WEAK",

      title: "Củng cố từ yếu",

      description: "Adaptive Practice tập trung vào kỹ năng chưa vững.",

      path: "/practice?mode=weak",

      priority: 4,

      ...stepMap.WEAK,
    },

    {
      key: "READING",

      title: "Đọc & nghe",

      description: "Gặp lại từ trong ngữ cảnh hoàn chỉnh.",

      path: "/reader",

      priority: 5,

      ...stepMap.READING,
    },
  ];

  const nextTask = queue.find(
    (item) => item.status === "PENDING" || item.status === "IN_PROGRESS",
  ) || {
    key: "SUMMARY",

    title: "Buổi học đã hoàn thành 🎉",

    description: "Xem lại hiệu suất hôm nay và trọng tâm tiếp theo.",

    path: "/summary",

    remaining: 0,

    status: "DONE",
  };

  const todayReviews = await prisma.reviewLog.count({
    where: {
      reviewedAt: {
        gte: dateInfo.startOfDay,

        lte: dateInfo.endOfDay,
      },
    },
  });

  const uniqueToday = await prisma.reviewLog.findMany({
    where: {
      reviewedAt: {
        gte: dateInfo.startOfDay,

        lte: dateInfo.endOfDay,
      },
    },

    select: {
      vocabularyId: true,
    },

    distinct: ["vocabularyId"],
  });

  const savedMeta =
    session.workloadMeta && typeof session.workloadMeta === "object"
      ? session.workloadMeta
      : {};

  // Tổng nhiệm vụ hiển thị phải dựa trên snapshot đã repair,
  // không lấy "selected" của metadata cũ còn trùng target.
  const sessionSelected = {
    due: Array.isArray(session.dueTargets) ? session.dueTargets.length : 0,
    relearning: Array.isArray(session.relearningTargets)
      ? session.relearningTargets.length
      : 0,
    newWords: Array.isArray(session.newTargets) ? session.newTargets.length : 0,
    weak: Array.isArray(session.weakTargets) ? session.weakTargets.length : 0,
  };
  sessionSelected.total = Object.values(sessionSelected).reduce(
    (a, b) => a + b,
    0,
  );

  const raw = savedMeta.raw || workload.raw;
  const deferred = {
    due: Math.max(0, Number(raw.due || 0) - sessionSelected.due),
    relearning: Math.max(
      0,
      Number(raw.relearning || 0) - sessionSelected.relearning,
    ),
    weak: Math.max(0, Number(raw.weak || 0) - sessionSelected.weak),
    newWords: Math.max(0, Number(raw.newWords || 0) - sessionSelected.newWords),
  };
  deferred.total =
    deferred.due + deferred.relearning + deferred.weak + deferred.newWords;

  return {
    sessionId: session.id,

    date: dateInfo,

    week: activeWeek
      ? {
          id: activeWeek.id,

          number: activeWeek.number,

          title: activeWeek.title,
        }
      : null,

    lessons: lessons.map((lesson) => ({
      id: lesson.id,

      title: lesson.title,

      day: lesson.day,

      dayLabel: lesson.dayLabel,

      vocabularyCount: lesson.vocabulary.length,

      hasReading: Boolean(lesson.reading),
    })),

    workload: {
      mode: session.workloadMode,

      reason: savedMeta.reason || workload.reason,

      daysSinceLastActivity:
        savedMeta.daysSinceLastActivity ?? workload.daysSinceLastActivity,

      raw,

      selected: sessionSelected,

      deferred,
    },

    progress,

    queue,

    nextTask,

    activity: {
      reviewsToday: todayReviews,

      uniqueWordsToday: uniqueToday.length,
    },
  };
}
