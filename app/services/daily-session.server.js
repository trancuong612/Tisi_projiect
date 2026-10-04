import { prisma } from "../utils/db.server";

function toArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}

function unique(values) {
  return [...new Set(values)];
}

export async function getOrCreateDailySession({
  dateKey,
  day,
  weekNumber,
  targets,
  readings,
  workloadMode,
  workloadMeta,
}) {
  const existing = await prisma.dailySession.findUnique({
    where: {
      dateKey,
    },
  });

  if (existing) {
    /**
     * Upgrade session cũ được tạo
     * trước Phase 3E.
     *
     * Chỉ chạy 1 lần nếu chưa có metadata.
     */
    if (!existing.workloadMeta) {
      return prisma.dailySession.update({
        where: {
          id: existing.id,
        },

        data: {
          workloadMode,
          workloadMeta,

          dueTargets: unique(targets.due),

          relearningTargets: unique(targets.relearning),

          newTargets: unique(targets.newWords),

          weakTargets: unique(targets.weak),

          readingTargets: unique(readings),
        },
      });
    }

    /**
     * Session đã được chốt.
     * Không merge thêm target.
     */
    return existing;
  }

  return prisma.dailySession.create({
    data: {
      dateKey,
      day,
      weekNumber,

      dueTargets: unique(targets.due),

      relearningTargets: unique(targets.relearning),

      newTargets: unique(targets.newWords),

      weakTargets: unique(targets.weak),

      readingTargets: unique(readings),

      completedReadingTargets: [],

      workloadMode,
      workloadMeta,
    },
  });
}

function buildStep({ key, total, completed }) {
  const safeCompleted = Math.min(total, completed);

  let status = "PENDING";

  if (total === 0) {
    status = "NOT_REQUIRED";
  } else if (safeCompleted >= total) {
    status = "DONE";
  } else if (safeCompleted > 0) {
    status = "IN_PROGRESS";
  }

  return {
    key,
    total,

    completed: safeCompleted,

    remaining: Math.max(0, total - safeCompleted),

    status,
  };
}

export async function getDailySessionProgress(session) {
  const dueIds = toArray(session.dueTargets);

  const relearningIds = toArray(session.relearningTargets);

  const newIds = toArray(session.newTargets);

  const weakIds = toArray(session.weakTargets);

  const readingIds = toArray(session.readingTargets);

  const completedReadingIds = toArray(session.completedReadingTargets);

  /**
   * Due chỉ hoàn thành khi
   * có FLASHCARD correct.
   *
   * Rating Again sẽ chưa complete.
   */
  const completedDue = dueIds.length
    ? (
        await prisma.reviewLog.findMany({
          where: {
            vocabularyId: {
              in: dueIds,
            },

            reviewedAt: {
              gte: session.startedAt,
            },

            exerciseType: "FLASHCARD",

            correct: true,
          },

          select: {
            vocabularyId: true,
          },

          distinct: ["vocabularyId"],
        })
      ).length
    : 0;

  const completedRelearning = relearningIds.length
    ? (
        await prisma.reviewLog.findMany({
          where: {
            vocabularyId: {
              in: relearningIds,
            },

            reviewedAt: {
              gte: session.startedAt,
            },

            correct: true,
          },

          select: {
            vocabularyId: true,
          },

          distinct: ["vocabularyId"],
        })
      ).length
    : 0;

  const completedNew = newIds.length
    ? await prisma.memoryState.count({
        where: {
          vocabularyId: {
            in: newIds,
          },

          state: {
            not: "NEW",
          },
        },
      })
    : 0;

  const completedWeak = weakIds.length
    ? (
        await prisma.reviewLog.findMany({
          where: {
            vocabularyId: {
              in: weakIds,
            },

            reviewedAt: {
              gte: session.startedAt,
            },

            correct: true,
          },

          select: {
            vocabularyId: true,
          },

          distinct: ["vocabularyId"],
        })
      ).length
    : 0;

  const completedReading = readingIds.filter((id) =>
    completedReadingIds.includes(id),
  ).length;

  const steps = [
    buildStep({
      key: "DUE",
      total: dueIds.length,
      completed: completedDue,
    }),

    buildStep({
      key: "RELEARNING",
      total: relearningIds.length,
      completed: completedRelearning,
    }),

    buildStep({
      key: "NEW",
      total: newIds.length,
      completed: completedNew,
    }),

    buildStep({
      key: "WEAK",
      total: weakIds.length,
      completed: completedWeak,
    }),

    buildStep({
      key: "READING",
      total: readingIds.length,
      completed: completedReading,
    }),
  ];

  const required = steps.filter((step) => step.status !== "NOT_REQUIRED");

  const total = required.reduce((sum, step) => sum + step.total, 0);

  const completed = required.reduce((sum, step) => sum + step.completed, 0);

  const percent = total === 0 ? 100 : Math.round((completed / total) * 100);

  return {
    sessionId: session.id,

    steps,

    total,
    completed,

    remaining: Math.max(0, total - completed),

    percent,

    completedAll: total === 0 || completed >= total,
  };
}

/**
 * Review Queue chỉ được lấy
 * từ target đã được Daily Session chọn.
 */
export async function getNextSessionReviewWord(sessionId) {
  const session = await prisma.dailySession.findUnique({
    where: {
      id: sessionId,
    },
  });

  if (!session) {
    return null;
  }

  const dueIds = toArray(session.dueTargets);

  if (!dueIds.length) {
    return null;
  }

  const words = await prisma.vocabulary.findMany({
    where: {
      id: {
        in: dueIds,
      },
    },

    include: {
      memory: true,
      skill: true,

      reviews: {
        where: {
          reviewedAt: {
            gte: session.startedAt,
          },

          exerciseType: "FLASHCARD",

          correct: true,
        },

        select: {
          id: true,
        },

        take: 1,
      },
    },
  });

  const map = new Map(words.map((word) => [word.id, word]));

  const now = new Date();

  /**
   * Giữ đúng thứ tự priority
   * được Workload Engine chốt.
   */
  for (const id of dueIds) {
    const word = map.get(id);

    if (!word || !word.memory) {
      continue;
    }

    /**
     * Đã có một review đúng hôm nay.
     */
    if (word.reviews.length > 0) {
      continue;
    }

    /**
     * Nếu vừa Again,
     * FSRS có thể đặt due vài phút tới.
     *
     * Không hỏi lại ngay.
     */
    if (new Date(word.memory.due) > now) {
      continue;
    }

    return word;
  }

  return null;
}
/**
 * Lấy từ NEW tiếp theo đúng theo
 * snapshot DailySession hôm nay.
 */
export async function getNextSessionNewWord(sessionId) {
  const session = await prisma.dailySession.findUnique({
    where: {
      id: sessionId,
    },
    select: {
      newTargets: true,
    },
  });

  if (!session) {
    return null;
  }

  const newIds = toArray(session.newTargets);

  if (!newIds.length) {
    return null;
  }

  const words = await prisma.vocabulary.findMany({
    where: {
      id: {
        in: newIds,
      },
    },

    include: {
      memory: true,
      skill: true,

      lesson: {
        include: {
          week: true,
        },
      },
    },
  });

  const map = new Map(words.map((word) => [word.id, word]));

  /**
   * Giữ đúng thứ tự
   * Workload Engine đã chốt.
   */
  for (const id of newIds) {
    const word = map.get(id);

    if (!word) {
      continue;
    }

    /**
     * Chưa có MemoryState
     * hoặc vẫn NEW
     * = chưa hoàn thành Learn.
     */
    if (!word.memory || word.memory.state === "NEW") {
      return word;
    }
  }

  return null;
}

/**
 * Xác nhận người học đã
 * làm quen một từ mới.
 *
 * Đây KHÔNG phải review,
 * nên không tạo ReviewLog.
 */
export async function activateSessionNewWord({ sessionId, vocabularyId }) {
  const session = await prisma.dailySession.findUnique({
    where: {
      id: sessionId,
    },
    select: {
      newTargets: true,
    },
  });

  if (!session) {
    throw new Response("Daily session not found", {
      status: 404,
    });
  }

  const newIds = toArray(session.newTargets);

  /**
   * Không cho route Learn
   * kích hoạt từ ngoài
   * DailySession hôm nay.
   */
  if (!newIds.includes(vocabularyId)) {
    throw new Response("Vocabulary is not part of today's new-word session.", {
      status: 400,
    });
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const vocabulary = await tx.vocabulary.findUnique({
      where: {
        id: vocabularyId,
      },

      include: {
        memory: true,
        skill: true,
      },
    });

    if (!vocabulary) {
      throw new Response("Vocabulary not found", {
        status: 404,
      });
    }

    /**
     * Nếu đã chuyển khỏi NEW
     * bởi một thao tác khác
     * thì không hạ state lại.
     */
    if (vocabulary.memory && vocabulary.memory.state !== "NEW") {
      return vocabulary;
    }

    /**
     * MemoryState có thể chưa tồn tại.
     */
    if (vocabulary.memory) {
      await tx.memoryState.update({
        where: {
          vocabularyId,
        },

        data: {
          state: "LEARNING",

          /**
           * Chưa có review thực sự,
           * nên chưa tính reps /
           * correctReviews.
           *
           * Due=now giúp từ này
           * đủ điều kiện được FSRS
           * xử lý ở phiên sau.
           */
          due: now,
        },
      });
    } else {
      await tx.memoryState.create({
        data: {
          vocabularyId,

          state: "LEARNING",

          due: now,
        },
      });
    }

    /**
     * Bảo đảm SkillState tồn tại
     * để Review/Practice sau này
     * không gặp update missing row.
     */
    if (!vocabulary.skill) {
      await tx.skillState.create({
        data: {
          vocabularyId,
        },
      });
    }

    return tx.vocabulary.findUnique({
      where: {
        id: vocabularyId,
      },

      include: {
        memory: true,
        skill: true,
      },
    });
  });
}
export async function markReadingCompleted({ sessionId, readingId }) {
  const session = await prisma.dailySession.findUnique({
    where: {
      id: sessionId,
    },
  });

  if (!session) {
    throw new Response("Daily session not found", {
      status: 404,
    });
  }

  const completed = unique([
    ...toArray(session.completedReadingTargets),

    readingId,
  ]);

  return prisma.dailySession.update({
    where: {
      id: sessionId,
    },

    data: {
      completedReadingTargets: completed,
    },
  });
}
