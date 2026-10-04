import { prisma } from "../utils/db.server";

const BACKUP_VERSION = 1;

const DATA_KEYS = [
  "weeks",
  "lessons",
  "vocabulary",
  "vocabularyInsights",
  "readings",
  "memoryStates",
  "skillStates",
  "reviewLogs",
  "dailySessions",
];

function countsFromData(data) {
  return Object.fromEntries(
    DATA_KEYS.map((key) => [
      key,
      Array.isArray(data?.[key]) ? data[key].length : 0,
    ]),
  );
}

export async function createBackup() {
  const data = await prisma.$transaction(async (tx) => {
    const [
      weeks,
      lessons,
      vocabulary,
      vocabularyInsights,
      readings,
      memoryStates,
      skillStates,
      reviewLogs,
      dailySessions,
    ] = await Promise.all([
      tx.week.findMany({
        orderBy: {
          number: "asc",
        },
      }),

      tx.lesson.findMany({
        orderBy: [
          {
            weekId: "asc",
          },
          {
            position: "asc",
          },
        ],
      }),

      tx.vocabulary.findMany({
        orderBy: {
          createdAt: "asc",
        },
      }),

      tx.vocabularyInsight.findMany(),

      tx.reading.findMany({
        orderBy: {
          createdAt: "asc",
        },
      }),

      tx.memoryState.findMany(),

      tx.skillState.findMany(),

      tx.reviewLog.findMany({
        orderBy: {
          reviewedAt: "asc",
        },
      }),

      tx.dailySession.findMany({
        orderBy: {
          dateKey: "asc",
        },
      }),
    ]);

    return {
      weeks,
      lessons,
      vocabulary,
      vocabularyInsights,
      readings,
      memoryStates,
      skillStates,
      reviewLogs,
      dailySessions,
    };
  });

  return {
    meta: {
      app: "Bright English Remix",
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      counts: countsFromData(data),
    },

    data,
  };
}

export async function getDatabaseCounts() {
  const [
    weeks,
    lessons,
    vocabulary,
    vocabularyInsights,
    readings,
    memoryStates,
    skillStates,
    reviewLogs,
    dailySessions,
  ] = await Promise.all([
    prisma.week.count(),
    prisma.lesson.count(),
    prisma.vocabulary.count(),
    prisma.vocabularyInsight.count(),
    prisma.reading.count(),
    prisma.memoryState.count(),
    prisma.skillState.count(),
    prisma.reviewLog.count(),
    prisma.dailySession.count(),
  ]);

  return {
    weeks,
    lessons,
    vocabulary,
    vocabularyInsights,
    readings,
    memoryStates,
    skillStates,
    reviewLogs,
    dailySessions,
  };
}

function ensureArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`Backup không hợp lệ: "${name}" phải là một mảng.`);
  }
}

function ensureUniqueIds(rows, name) {
  const ids = new Set();

  for (const row of rows) {
    if (!row?.id) {
      throw new Error(`Backup không hợp lệ: ${name} có bản ghi thiếu id.`);
    }

    if (ids.has(row.id)) {
      throw new Error(`Backup không hợp lệ: ${name} có id trùng "${row.id}".`);
    }

    ids.add(row.id);
  }

  return ids;
}

function ensureReference({ value, validIds, relationName, optional = false }) {
  if (optional && (value === null || value === undefined)) {
    return;
  }

  if (!validIds.has(value)) {
    throw new Error(
      `Backup không hợp lệ: relation ${relationName} tham chiếu tới id không tồn tại "${value}".`,
    );
  }
}

export function validateBackup(backup) {
  if (!backup || typeof backup !== "object") {
    throw new Error("File backup không phải JSON hợp lệ.");
  }

  if (!backup.meta) {
    throw new Error("File backup thiếu metadata.");
  }

  if (Number(backup.meta.version) !== BACKUP_VERSION) {
    throw new Error(
      `Phiên bản backup không được hỗ trợ. Cần version ${BACKUP_VERSION}.`,
    );
  }

  if (!backup.data) {
    throw new Error("File backup thiếu trường data.");
  }

  for (const key of DATA_KEYS) {
    ensureArray(backup.data[key], key);
  }

  const {
    weeks,
    lessons,
    vocabulary,
    vocabularyInsights,
    readings,
    memoryStates,
    skillStates,
    reviewLogs,
  } = backup.data;

  const weekIds = ensureUniqueIds(weeks, "weeks");

  const lessonIds = ensureUniqueIds(lessons, "lessons");

  const vocabularyIds = ensureUniqueIds(vocabulary, "vocabulary");

  ensureUniqueIds(vocabularyInsights, "vocabularyInsights");

  ensureUniqueIds(readings, "readings");

  ensureUniqueIds(memoryStates, "memoryStates");

  ensureUniqueIds(skillStates, "skillStates");

  ensureUniqueIds(reviewLogs, "reviewLogs");

  ensureUniqueIds(backup.data.dailySessions, "dailySessions");

  /**
   * Lesson → Week
   */
  for (const lesson of lessons) {
    ensureReference({
      value: lesson.weekId,
      validIds: weekIds,
      relationName: "Lesson.weekId → Week.id",
    });
  }

  /**
   * Vocabulary → Lesson
   *
   * lessonId nullable.
   */
  for (const word of vocabulary) {
    ensureReference({
      value: word.lessonId,
      validIds: lessonIds,
      relationName: "Vocabulary.lessonId → Lesson.id",
      optional: true,
    });
  }

  /**
   * Reading → Lesson
   */
  for (const reading of readings) {
    ensureReference({
      value: reading.lessonId,
      validIds: lessonIds,
      relationName: "Reading.lessonId → Lesson.id",
    });
  }

  /**
   * Các bảng con → Vocabulary
   */
  for (const item of vocabularyInsights) {
    ensureReference({
      value: item.vocabularyId,
      validIds: vocabularyIds,
      relationName: "VocabularyInsight.vocabularyId → Vocabulary.id",
    });
  }

  for (const item of memoryStates) {
    ensureReference({
      value: item.vocabularyId,
      validIds: vocabularyIds,
      relationName: "MemoryState.vocabularyId → Vocabulary.id",
    });
  }

  for (const item of skillStates) {
    ensureReference({
      value: item.vocabularyId,
      validIds: vocabularyIds,
      relationName: "SkillState.vocabularyId → Vocabulary.id",
    });
  }

  for (const item of reviewLogs) {
    ensureReference({
      value: item.vocabularyId,
      validIds: vocabularyIds,
      relationName: "ReviewLog.vocabularyId → Vocabulary.id",
    });
  }

  return {
    valid: true,

    app: backup.meta.app || "Unknown",

    version: backup.meta.version,

    exportedAt: backup.meta.exportedAt || null,

    counts: countsFromData(backup.data),
  };
}

function parseDate(value, field, nullable = false) {
  if (nullable && (value === null || value === undefined)) {
    return null;
  }

  if (value === null || value === undefined) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Ngày không hợp lệ tại "${field}".`);
  }

  return date;
}

function mapWeek(row) {
  return {
    ...row,

    startDate: parseDate(row.startDate, "Week.startDate", true),

    createdAt: parseDate(row.createdAt, "Week.createdAt"),

    updatedAt: parseDate(row.updatedAt, "Week.updatedAt"),
  };
}

function mapLesson(row) {
  return {
    ...row,

    createdAt: parseDate(row.createdAt, "Lesson.createdAt"),

    updatedAt: parseDate(row.updatedAt, "Lesson.updatedAt"),
  };
}

function mapVocabulary(row) {
  return {
    ...row,

    createdAt: parseDate(row.createdAt, "Vocabulary.createdAt"),

    updatedAt: parseDate(row.updatedAt, "Vocabulary.updatedAt"),
  };
}

function mapVocabularyInsight(row) {
  return {
    ...row,

    generatedAt: parseDate(row.generatedAt, "VocabularyInsight.generatedAt"),

    updatedAt: parseDate(row.updatedAt, "VocabularyInsight.updatedAt"),
  };
}

function mapReading(row) {
  return {
    ...row,

    createdAt: parseDate(row.createdAt, "Reading.createdAt"),

    updatedAt: parseDate(row.updatedAt, "Reading.updatedAt"),
  };
}

function mapMemoryState(row) {
  return {
    ...row,

    due: parseDate(row.due, "MemoryState.due"),

    lastReview: parseDate(row.lastReview, "MemoryState.lastReview", true),

    createdAt: parseDate(row.createdAt, "MemoryState.createdAt"),

    updatedAt: parseDate(row.updatedAt, "MemoryState.updatedAt"),
  };
}

function mapSkillState(row) {
  return {
    ...row,

    updatedAt: parseDate(row.updatedAt, "SkillState.updatedAt"),
  };
}

function mapReviewLog(row) {
  return {
    ...row,

    reviewedAt: parseDate(row.reviewedAt, "ReviewLog.reviewedAt"),
  };
}

function mapDailySession(row) {
  return {
    ...row,

    startedAt: parseDate(row.startedAt, "DailySession.startedAt"),

    createdAt: parseDate(row.createdAt, "DailySession.createdAt"),

    updatedAt: parseDate(row.updatedAt, "DailySession.updatedAt"),
  };
}

export async function restoreBackup(backup) {
  /**
   * Validate trước khi đụng DB.
   */
  const validation = validateBackup(backup);

  const data = backup.data;

  await prisma.$transaction(
    async (tx) => {
      /**
       * XÓA:
       * child trước parent.
       */
      await tx.reviewLog.deleteMany();
      await tx.vocabularyInsight.deleteMany();
      await tx.memoryState.deleteMany();
      await tx.skillState.deleteMany();
      await tx.reading.deleteMany();

      await tx.vocabulary.deleteMany();
      await tx.lesson.deleteMany();
      await tx.week.deleteMany();

      await tx.dailySession.deleteMany();

      /**
       * CREATE:
       * parent trước child.
       */

      if (data.weeks.length) {
        await tx.week.createMany({
          data: data.weeks.map(mapWeek),
        });
      }

      if (data.lessons.length) {
        await tx.lesson.createMany({
          data: data.lessons.map(mapLesson),
        });
      }

      if (data.vocabulary.length) {
        await tx.vocabulary.createMany({
          data: data.vocabulary.map(mapVocabulary),
        });
      }

      if (data.readings.length) {
        await tx.reading.createMany({
          data: data.readings.map(mapReading),
        });
      }

      if (data.memoryStates.length) {
        await tx.memoryState.createMany({
          data: data.memoryStates.map(mapMemoryState),
        });
      }

      if (data.skillStates.length) {
        await tx.skillState.createMany({
          data: data.skillStates.map(mapSkillState),
        });
      }

      if (data.vocabularyInsights.length) {
        await tx.vocabularyInsight.createMany({
          data: data.vocabularyInsights.map(mapVocabularyInsight),
        });
      }

      if (data.reviewLogs.length) {
        await tx.reviewLog.createMany({
          data: data.reviewLogs.map(mapReviewLog),
        });
      }

      if (data.dailySessions.length) {
        await tx.dailySession.createMany({
          data: data.dailySessions.map(mapDailySession),
        });
      }
    },
    {
      maxWait: 10000,
      timeout: 60000,
    },
  );

  return validation;
}
