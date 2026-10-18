import { prisma } from "../utils/db.server";
import { getAcquiredVocabularyIdSet } from "./weak-words.server";

function toArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

/**
 * Một vocabulary chỉ được xuất hiện
 * trong MỘT bucket của Daily Session.
 *
 * Priority:
 * NEW (incomplete acquisition)
 * ↓
 * RELEARNING
 * ↓
 * DUE
 * ↓
 * WEAK
 */
function sanitizeSessionTargets({
  due = [],
  relearning = [],
  weak = [],
  newWords = [],
}) {
  const used = new Set();

  function takeUnique(values) {
    const result = [];

    for (const id of unique(values)) {
      if (used.has(id)) {
        continue;
      }

      used.add(id);
      result.push(id);
    }

    return result;
  }

  const cleanNew = takeUnique(newWords);
  const cleanRelearning = takeUnique(relearning);
  const cleanDue = takeUnique(due);
  const cleanWeak = takeUnique(weak);

  return {
    due: cleanDue,
    relearning: cleanRelearning,
    weak: cleanWeak,
    newWords: cleanNew,
  };
}

/**
 * Loại vocabulary chưa vượt qua Final Challenge ra khỏi các bucket ôn.
 * Snapshot NEW được giữ lại để progress không biến mất khi người học hoàn thành.
 */
async function getSafeSessionTargets(targets) {
  const newWords = unique(toArray(targets.newWords));
  const reviewIds = unique([
    ...toArray(targets.relearning),
    ...toArray(targets.due),
    ...toArray(targets.weak),
  ]);
  const acquired = await getAcquiredVocabularyIdSet(reviewIds);
  return sanitizeSessionTargets({
    newWords,
    relearning: toArray(targets.relearning).filter((id) => acquired.has(id)),
    due: toArray(targets.due).filter((id) => acquired.has(id)),
    weak: toArray(targets.weak).filter((id) => acquired.has(id)),
  });
}

function arraysEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
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

  const cleanIncoming = await getSafeSessionTargets({
    due: toArray(targets?.due),
    relearning: toArray(targets?.relearning),
    weak: toArray(targets?.weak),
    newWords: toArray(targets?.newWords),
  });

  if (existing) {
    /**
     * Repair DailySession được tạo bởi
     * phiên bản cũ nếu target bị duplicate.
     */
    const oldDue = toArray(existing.dueTargets);
    const oldRelearning = toArray(existing.relearningTargets);
    const oldWeak = toArray(existing.weakTargets);
    const oldNew = toArray(existing.newTargets);

    const cleanedExisting = await getSafeSessionTargets({
      due: oldDue,
      relearning: oldRelearning,
      weak: oldWeak,
      newWords: oldNew,
    });

    const targetsChanged =
      !arraysEqual(oldDue, cleanedExisting.due) ||
      !arraysEqual(oldRelearning, cleanedExisting.relearning) ||
      !arraysEqual(oldWeak, cleanedExisting.weak) ||
      !arraysEqual(oldNew, cleanedExisting.newWords);

    /**
     * Session cũ chưa có metadata:
     * nâng cấp bằng workload hiện tại.
     */
    if (!existing.workloadMeta) {
      return prisma.dailySession.update({
        where: {
          id: existing.id,
        },

        data: {
          workloadMode,
          workloadMeta,

          dueTargets: cleanIncoming.due,
          relearningTargets: cleanIncoming.relearning,
          weakTargets: cleanIncoming.weak,
          newTargets: cleanIncoming.newWords,

          readingTargets: unique(readings),

          /**
           * Không reset completedReadingTargets.
           */
        },
      });
    }

    /**
     * Session hôm nay đã tồn tại.
     * Chỉ repair duplicate.
     *
     * Không rebuild toàn bộ snapshot,
     * không reset tiến độ đã học.
     */
    if (targetsChanged) {
      return prisma.dailySession.update({
        where: {
          id: existing.id,
        },

        data: {
          dueTargets: cleanedExisting.due,
          relearningTargets: cleanedExisting.relearning,
          weakTargets: cleanedExisting.weak,
          newTargets: cleanedExisting.newWords,
        },
      });
    }

    return existing;
  }

  /**
   * Session mới luôn được tạo
   * bằng target đã sanitize.
   */
  return prisma.dailySession.create({
    data: {
      dateKey,
      day,
      weekNumber,

      dueTargets: cleanIncoming.due,
      relearningTargets: cleanIncoming.relearning,
      weakTargets: cleanIncoming.weak,
      newTargets: cleanIncoming.newWords,

      readingTargets: unique(readings),
      completedReadingTargets: [],

      workloadMode,
      workloadMeta,
    },
  });
}

function buildStep({ key, total, completed }) {
  const safeTotal = Math.max(0, Number(total || 0));

  const safeCompleted = Math.min(
    safeTotal,
    Math.max(0, Number(completed || 0)),
  );

  let status = "PENDING";

  if (safeTotal === 0) {
    status = "NOT_REQUIRED";
  } else if (safeCompleted >= safeTotal) {
    status = "DONE";
  } else if (safeCompleted > 0) {
    status = "IN_PROGRESS";
  }

  return {
    key,

    total: safeTotal,
    completed: safeCompleted,

    remaining: Math.max(0, safeTotal - safeCompleted),

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

  const now = new Date();
  const acquired = await getAcquiredVocabularyIdSet([
    ...dueIds,
    ...relearningIds,
    ...weakIds,
    ...newIds,
  ]);
  const effectiveRelearningIds = relearningIds.filter((id) => acquired.has(id));
  const effectiveWeakIds = weakIds.filter((id) => acquired.has(id));

  /**
   * =====================================================
   * DUE
   * =====================================================
   *
   * Snapshot có thể chứa một từ từng DUE,
   * nhưng hiện tại FSRS đã chuyển due sang tương lai.
   *
   * Nếu cứ giữ từ đó trong denominator,
   * Daily Session sẽ bị kẹt:
   *
   * Home: 0/30
   * Review: không có câu nào.
   *
   * Vì vậy:
   *
   * - đã review trong session → tính completed
   * - chưa review và due <= now → vẫn actionable
   * - chưa review nhưng due > now → không khóa session
   * - MemoryState không còn tồn tại → không khóa session
   */

  const [dueMemories, dueReviews] = dueIds.length
    ? await Promise.all([
        prisma.memoryState.findMany({
          where: {
            vocabularyId: {
              in: dueIds,
            },
          },

          select: {
            vocabularyId: true,
            due: true,
          },
        }),

        prisma.reviewLog.findMany({
          where: {
            vocabularyId: {
              in: dueIds,
            },

            reviewedAt: {
              gte: session.startedAt,
            },
          },

          select: {
            vocabularyId: true,
          },

          distinct: ["vocabularyId"],
        }),
      ])
    : [[], []];

  const dueMemoryMap = new Map(
    dueMemories.map((memory) => [memory.vocabularyId, memory]),
  );

  const reviewedDueIds = new Set(
    dueReviews.map((review) => review.vocabularyId),
  );

  /**
   * Chỉ giữ những DUE hiện thực sự
   * có ý nghĩa đối với Daily Session.
   */
  const effectiveDueIds = dueIds.filter((id) => {
    if (!acquired.has(id)) return false;
    /**
     * Đã thực hiện retrieval trong session.
     * Giữ lại để tính completed.
     */
    if (reviewedDueIds.has(id)) {
      return true;
    }

    const memory = dueMemoryMap.get(id);

    /**
     * Vocabulary/MemoryState không còn.
     * Không được khóa Daily Session.
     */
    if (!memory) {
      return false;
    }

    /**
     * Hiện vẫn thực sự đến hạn.
     */
    return new Date(memory.due) <= now;
  });

  const completedDue = effectiveDueIds.filter((id) =>
    reviewedDueIds.has(id),
  ).length;

  /**
   * =====================================================
   * RELEARNING
   * =====================================================
   *
   * Daily Session đo workload đã thực hiện,
   * không phải mastery.
   *
   * Một từ đã được retrieval hôm nay
   * thì nhiệm vụ Relearning của ngày đó
   * đã được thực hiện.
   *
   * Nếu sai, FSRS / Weak Engine vẫn chịu trách nhiệm
   * đưa nó quay lại sau.
   */

  const relearningReviews = effectiveRelearningIds.length
    ? await prisma.reviewLog.findMany({
        where: {
          vocabularyId: {
            in: effectiveRelearningIds,
          },

          reviewedAt: {
            gte: session.startedAt,
          },
        },

        select: {
          vocabularyId: true,
        },

        distinct: ["vocabularyId"],
      })
    : [];

  const completedRelearning = relearningReviews.length;

  /**
   * =====================================================
   * NEW
   * =====================================================
   *
   * New Word Learning Engine chỉ chuyển:
   *
   * NEW → LEARNING
   *
   * sau khi từ đã vượt acquisition/mastery gate.
   */

  const completedNew = newIds.filter((id) => acquired.has(id)).length;

  /**
   * =====================================================
   * WEAK
   * =====================================================
   *
   * Giống Relearning:
   * Daily Session chỉ yêu cầu
   * đã thực hiện retrieval/practice hôm nay.
   */

  const weakReviews = effectiveWeakIds.length
    ? await prisma.reviewLog.findMany({
        where: {
          vocabularyId: {
            in: effectiveWeakIds,
          },

          reviewedAt: {
            gte: session.startedAt,
          },
        },

        select: {
          vocabularyId: true,
        },

        distinct: ["vocabularyId"],
      })
    : [];

  const completedWeak = weakReviews.length;

  /**
   * =====================================================
   * READING
   * =====================================================
   */

  const completedReading = readingIds.filter((id) =>
    completedReadingIds.includes(id),
  ).length;

  /**
   * =====================================================
   * STEPS
   * =====================================================
   */

  const steps = [
    buildStep({
      key: "DUE",

      /**
       * QUAN TRỌNG:
       * không dùng dueIds.length nữa.
       */
      total: effectiveDueIds.length,

      completed: completedDue,
    }),

    buildStep({
      key: "RELEARNING",
      total: effectiveRelearningIds.length,
      completed: completedRelearning,
    }),

    buildStep({
      key: "NEW",
      total: newIds.length,
      completed: completedNew,
    }),

    buildStep({
      key: "WEAK",
      total: effectiveWeakIds.length,
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
 * =====================================================
 * REVIEW QUEUE
 * =====================================================
 *
 * Nguyên tắc:
 *
 * Nếu progress nói còn một DUE actionable,
 * function này PHẢI tìm được từ tương ứng.
 *
 * Nhờ vậy không còn trạng thái:
 *
 * Home: còn DUE
 * /review: không có bài.
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

      /**
       * Bất kỳ retrieval nào trong session
       * đều coi target DUE này đã được xử lý.
       */
      reviews: {
        where: {
          reviewedAt: {
            gte: session.startedAt,
          },
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
  const acquired = await getAcquiredVocabularyIdSet(dueIds);

  /**
   * Giữ đúng thứ tự priority
   * do Workload Engine chốt.
   */
  for (const id of dueIds) {
    const word = map.get(id);

    /**
     * Target stale hoặc vocabulary
     * đã bị xóa.
     */
    if (!word || !word.memory || !acquired.has(id)) {
      continue;
    }

    /**
     * Đã retrieval trong Daily Session này.
     * Không hỏi lại trong bucket DUE.
     */
    if (word.reviews.length > 0) {
      continue;
    }

    /**
     * FSRS đã đẩy sang tương lai.
     *
     * Không actionable ở thời điểm này
     * nên không hỏi.
     *
     * getDailySessionProgress()
     * cũng loại target này khỏi denominator.
     */
    if (new Date(word.memory.due) > now) {
      continue;
    }

    return word;
  }

  return null;
}

/**
 * =====================================================
 * NEW WORD QUEUE
 * =====================================================
 *
 * Giữ đúng snapshot DailySession.
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
  const acquired = await getAcquiredVocabularyIdSet(newIds);

  /**
   * Giữ đúng thứ tự do
   * Workload Engine chốt.
   */
  for (const id of newIds) {
    const word = map.get(id);

    if (!word) {
      continue;
    }

    /**
     * Chưa có MemoryState
     * hoặc state vẫn NEW
     * = chưa hoàn thành Learn.
     */
    if (!acquired.has(id)) {
      return word;
    }
  }

  return null;
}

/**
 * =====================================================
 * LEGACY NEW-WORD ACTIVATION
 * =====================================================
 *
 * Giữ lại để tương thích với các route cũ.
 *
 * Đây không phải Review.
 * Không tạo ReviewLog.
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
   * Không cho route kích hoạt
   * vocabulary ngoài DailySession.
   */
  if (!newIds.includes(vocabularyId)) {
    throw new Response("Vocabulary is not part of today's new-word session.", {
      status: 400,
    });
  }

  // Chỉ cho kích hoạt FSRS sau Final Challenge, tránh đánh dấu
  // LEARNING trước khi New Learning Engine hoàn tất.
  const acquired = await getAcquiredVocabularyIdSet([vocabularyId]);
  if (!acquired.has(vocabularyId)) {
    throw new Response(
      "Hãy hoàn thành Final Challenge trước khi kích hoạt FSRS.",
      {
        status: 409,
      },
    );
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
     * Nếu từ đã chuyển khỏi NEW
     * bởi New Learning Engine hoặc
     * thao tác khác thì không hạ state.
     */
    if (vocabulary.memory && vocabulary.memory.state !== "NEW") {
      return vocabulary;
    }

    /**
     * Đảm bảo MemoryState tồn tại.
     */
    if (vocabulary.memory) {
      await tx.memoryState.update({
        where: {
          vocabularyId,
        },

        data: {
          state: "LEARNING",

          /**
           * Chưa tạo ReviewLog,
           * chưa tăng reps.
           *
           * Due=now chỉ để từ đủ điều kiện
           * được scheduler xử lý sau.
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
     * Bảo đảm SkillState tồn tại.
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

/**
 * =====================================================
 * READING COMPLETION
 * =====================================================
 */
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

  /**
   * Không cho duplicate reading IDs.
   */
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
