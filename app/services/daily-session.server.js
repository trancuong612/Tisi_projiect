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

export function getCarryoverTargets(session) {
  return toArray(session?.workloadMeta?.carryoverTargets);
}

/**
 * Một vocabulary chỉ được xuất hiện
 * trong MỘT bucket của Daily Session.
 *
 * Priority:
 * NEW (incomplete acquisition)
 * ↓
 * DUE (FSRS)
 * ↓
 * RELEARNING
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
  const cleanDue = takeUnique(due);
  const cleanRelearning = takeUnique(relearning);
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

// Daily core budget is intentionally limited. Completed work is always kept.
// Pending work that doesn't fit stays in FSRS/carryover queues for later days.
function takeBudgeted(completed, candidates, cap, forbidden = new Set()) {
  const kept = unique(completed).filter((id) => !forbidden.has(id));
  const used = new Set([...forbidden, ...kept]);
  const free = Math.max(0, cap - kept.length);
  const pending = [];
  for (const id of unique(candidates)) {
    if (pending.length >= free) break;
    if (used.has(id)) continue;
    pending.push(id);
    used.add(id);
    if (pending.length >= free) break;
  }
  return [...kept, ...pending];
}

async function findCompletedIds(ids, startedAt, exerciseType = null) {
  if (!ids.length) return [];
  const rows = await prisma.reviewLog.findMany({
    where: {
      vocabularyId: { in: ids },
      reviewedAt: { gte: startedAt },
      correct: true,
      ...(exerciseType ? { exerciseType } : {}),
    },
    select: { vocabularyId: true },
    distinct: ["vocabularyId"],
  });
  return rows.map((r) => r.vocabularyId);
}

async function chooseCarryover(oldIds, candidates, cap, newIds) {
  const ids = unique([...oldIds, ...candidates]).filter(
    (id) => !newIds.includes(id),
  );
  if (!ids.length) return [];
  const acquired = await getAcquiredVocabularyIdSet(ids);
  const done = ids.filter((id) => acquired.has(id) && oldIds.includes(id));
  const pending = ids.filter((id) => !acquired.has(id));
  // Prefer words with acquisition checkpoints already started over untouched words.
  const started = pending.length
    ? await prisma.newLearningProgress.findMany({
        where: { vocabularyId: { in: pending }, finalPass: false },
        select: { vocabularyId: true, exposed: true, correctCount: true },
      })
    : [];
  const score = new Map();
  for (const row of started) {
    score.set(
      row.vocabularyId,
      Math.max(
        score.get(row.vocabularyId) || 0,
        (row.exposed ? 1 : 0) + Math.max(0, row.correctCount || 0),
      ),
    );
  }
  const prioritized = pending
    .map((id, index) => ({ id, index, priority: score.get(id) || 0 }))
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .map((v) => v.id);
  return takeBudgeted(done, prioritized, cap);
}

export async function getOrCreateDailySession({
  dateKey,
  day,
  weekNumber,
  targets,
  readings,
  carryoverIds = [],
  workloadMode,
  workloadMeta,
}) {
  const existing = await prisma.dailySession.findUnique({ where: { dateKey } });
  const input = await getSafeSessionTargets({
    due: toArray(targets?.due),
    relearning: toArray(targets?.relearning),
    weak: toArray(targets?.weak),
    newWords: toArray(targets?.newWords),
  });
  const oldMeta =
    existing?.workloadMeta && typeof existing.workloadMeta === "object"
      ? existing.workloadMeta
      : {};
  // Freeze the CORE caps/mode for this calendar day. Otherwise crossing BUSY
  // -> NORMAL would quietly create more required work during the same day.
  const alreadyPlanned = oldMeta.planVersion === "balanced-v1";
  const limits =
    alreadyPlanned && oldMeta.baseLimits
      ? oldMeta.baseLimits
      : workloadMeta?.limits || { due: 20, carryover: 5, practice: 4 };
  const effectiveMode = alreadyPlanned ? existing.workloadMode : workloadMode;
  const extraDueSlots = Math.max(0, Number(oldMeta.extraDueSlots || 0));
  const dueCap = Math.max(0, limits.due + extraDueSlots);

  // Previously completed snapshots remain visible and counted, even if today's
  // classification changes as FSRS schedules a new due date.
  const oldNew = toArray(existing?.newTargets);
  const newWords = unique([...oldNew, ...input.newWords]);
  const oldDue = toArray(existing?.dueTargets);
  const oldRelearning = toArray(existing?.relearningTargets);
  const oldWeak = toArray(existing?.weakTargets);
  const doneDue = existing
    ? await findCompletedIds(oldDue, existing.startedAt, "FLASHCARD")
    : [];
  const doneRelearning = existing
    ? await findCompletedIds(oldRelearning, existing.startedAt)
    : [];
  const doneWeak = existing
    ? await findCompletedIds(oldWeak, existing.startedAt)
    : [];

  const priorCarryover = getCarryoverTargets(existing);
  const carryover = await chooseCarryover(
    priorCarryover,
    unique(carryoverIds).filter((id) => !newWords.includes(id)),
    Math.max(0, limits.carryover),
    newWords,
  );
  const forbidden = new Set([...newWords, ...carryover]);
  const validOldDue = oldDue.length
    ? await prisma.memoryState.findMany({
        where: {
          vocabularyId: { in: oldDue },
          due: { lte: new Date() },
          state: { not: "NEW" },
        },
        select: { vocabularyId: true },
      })
    : [];
  const stillAcquired = await getAcquiredVocabularyIdSet(
    validOldDue.map((m) => m.vocabularyId),
  );
  // Keep today's assigned pending cards stable. After any FLASHCARD pass,
  // do not silently swap them for other overdue cards from the backlog.
  const dueCandidates = unique([
    ...validOldDue
      .map((m) => m.vocabularyId)
      .filter((id) => stillAcquired.has(id)),
    ...input.due,
  ]);
  const due = takeBudgeted(doneDue, dueCandidates, dueCap, forbidden);
  for (const id of due) forbidden.add(id);
  // Share one SMALL practice budget, not 2 separate caps.
  const relearning = takeBudgeted(
    doneRelearning,
    input.relearning,
    Math.max(0, limits.practice),
    forbidden,
  );
  for (const id of relearning) forbidden.add(id);
  const weak = takeBudgeted(
    doneWeak,
    input.weak,
    Math.max(0, limits.practice - relearning.length),
    forbidden,
  );

  const meta = {
    ...oldMeta,
    ...workloadMeta,
    planVersion: "balanced-v1",
    extraDueSlots,
    baseLimits: limits,
    reason: alreadyPlanned ? oldMeta.reason : workloadMeta.reason,
    limits: { ...limits, due: dueCap },
    carryoverTargets: carryover,
    rawCarryover: carryoverIds.length,
  };
  const updates = {
    dueTargets: due,
    relearningTargets: relearning,
    weakTargets: weak,
    newTargets: newWords,
    workloadMeta: meta,
    workloadMode: effectiveMode,
  };
  if (existing) {
    const changed =
      !arraysEqual(toArray(existing.dueTargets), due) ||
      !arraysEqual(toArray(existing.relearningTargets), relearning) ||
      !arraysEqual(toArray(existing.weakTargets), weak) ||
      !arraysEqual(toArray(existing.newTargets), newWords) ||
      !arraysEqual(priorCarryover, carryover) ||
      existing.workloadMode !== effectiveMode ||
      JSON.stringify(oldMeta) !== JSON.stringify(meta);
    if (!changed) return existing;
    return prisma.dailySession.update({
      where: { id: existing.id },
      data: updates,
    });
  }
  return prisma.dailySession.create({
    data: {
      dateKey,
      day,
      weekNumber,
      ...updates,
      readingTargets: unique(readings),
      completedReadingTargets: [],
    },
  });
}

/** Explicit user choice: add 10 MORE overdue reviews to TODAY only.
 * No FSRS schedule is modified, and no new words or history are deleted. */
export async function addOptionalDueBatch({
  sessionId,
  dateKey,
  batchSize = 10,
}) {
  const session = await prisma.dailySession.findUnique({
    where: { id: sessionId },
  });
  if (!session || session.dateKey !== dateKey) {
    throw new Response("Daily Session is not current", { status: 409 });
  }
  const used = new Set([
    ...toArray(session.dueTargets),
    ...toArray(session.relearningTargets),
    ...toArray(session.weakTargets),
    ...toArray(session.newTargets),
    ...getCarryoverTargets(session),
  ]);
  const due = await prisma.memoryState.findMany({
    where: { due: { lte: new Date() }, state: { not: "NEW" } },
    orderBy: { due: "asc" },
    select: { vocabularyId: true },
  });
  const candidates = due
    .map((m) => m.vocabularyId)
    .filter((id) => !used.has(id));
  const acquired = await getAcquiredVocabularyIdSet(candidates);
  const added = candidates
    .filter((id) => acquired.has(id))
    .slice(0, Math.min(10, batchSize));
  if (!added.length) return 0;
  const oldMeta = session.workloadMeta || {};
  await prisma.dailySession.update({
    where: { id: session.id },
    data: {
      dueTargets: [...toArray(session.dueTargets), ...added],
      workloadMeta: {
        ...oldMeta,
        extraDueSlots: Number(oldMeta.extraDueSlots || 0) + added.length,
      },
    },
  });
  return added.length;
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
  const carryoverIds = getCarryoverTargets(session).filter(
    (id) => !newIds.includes(id),
  );
  const weakIds = toArray(session.weakTargets);

  const readingIds = toArray(session.readingTargets);

  const completedReadingIds = toArray(session.completedReadingTargets);

  const now = new Date();
  const acquired = await getAcquiredVocabularyIdSet([
    ...dueIds,
    ...relearningIds,
    ...weakIds,
    ...newIds,
    ...carryoverIds,
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
            exerciseType: "FLASHCARD",
            correct: true,
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
          correct: true,
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
  const completedCarryover = carryoverIds.filter((id) =>
    acquired.has(id),
  ).length;

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
          correct: true,
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
      key: "CARRYOVER",
      total: carryoverIds.length,
      completed: completedCarryover,
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
export async function getNextSessionNewWord(sessionId, lane = "new") {
  const session = await prisma.dailySession.findUnique({
    where: {
      id: sessionId,
    },

    select: {
      newTargets: true,
      workloadMeta: true,
    },
  });

  if (!session) {
    return null;
  }

  const newIds =
    lane === "carryover"
      ? getCarryoverTargets(session)
      : toArray(session.newTargets);

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
      workloadMeta: true,
    },
  });

  if (!session) {
    throw new Response("Daily session not found", {
      status: 404,
    });
  }

  const newIds = unique([
    ...toArray(session.newTargets),
    ...getCarryoverTargets(session),
  ]);

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
