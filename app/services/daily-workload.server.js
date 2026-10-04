const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Đây là workload safety limits,
 * KHÔNG phải mục tiêu cố định số từ/ngày.
 *
 * NORMAL:
 * không giới hạn curriculum.
 *
 * BUSY / RECOVERY:
 * chỉ giới hạn tạm thời khi backlog cao.
 */
const CONFIG = {
  busyDueThreshold: 40,
  recoveryDueThreshold: 80,

  busyGapDays: 3,
  recoveryGapDays: 7,

  busyDueCap: 30,
  busyRelearningCap: 8,
  busyWeakCap: 6,
  busyNewRatio: 0.5,

  recoveryDueCap: 25,
  recoveryRelearningCap: 8,
  recoveryWeakCap: 5,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calculateDaysSince(date, now) {
  if (!date) {
    return null;
  }

  return Math.max(
    0,
    Math.floor((now.getTime() - new Date(date).getTime()) / DAY_MS),
  );
}

function getDuePriority(memory, now) {
  const overdueDays = Math.max(
    0,
    (now.getTime() - new Date(memory.due).getTime()) / DAY_MS,
  );

  const difficulty = clamp(memory.difficulty || 0, 0, 10);

  const lapses = memory.lapses || 0;

  const importance = memory.vocabulary?.importance || 1;

  let stateBoost = 0;

  if (memory.state === "RELEARNING") {
    stateBoost = 4;
  } else if (memory.state === "LEARNING") {
    stateBoost = 2;
  }

  /**
   * Đây là priority tương đối,
   * không phải điểm kiến thức.
   */
  return (
    overdueDays * 1.2 + lapses * 2 + difficulty * 0.5 + importance + stateBoost
  );
}

function chooseMode({ dueCount, daysSinceLastActivity }) {
  if (
    dueCount >= CONFIG.recoveryDueThreshold ||
    (daysSinceLastActivity !== null &&
      daysSinceLastActivity >= CONFIG.recoveryGapDays)
  ) {
    return "RECOVERY";
  }

  if (
    dueCount >= CONFIG.busyDueThreshold ||
    (daysSinceLastActivity !== null &&
      daysSinceLastActivity >= CONFIG.busyGapDays)
  ) {
    return "BUSY";
  }

  return "NORMAL";
}

function takeIds(items, limit) {
  return items
    .slice(0, limit)
    .map((item) => (typeof item === "string" ? item : item.id));
}

export function buildDailyWorkload({
  now,
  dueMemories,
  weakWords,
  newWordIds,
  lastActivityAt,
}) {
  const daysSinceLastActivity = calculateDaysSince(lastActivityAt, now);

  const relearningWords = weakWords.filter(
    (word) => word.weakProfile.status === "RELEARNING",
  );

  const weakOnlyWords = weakWords.filter(
    (word) => word.weakProfile.status === "WEAK",
  );

  const relearningIds = new Set(relearningWords.map((word) => word.id));

  /**
   * Không double count:
   * từ RELEARNING đi vào
   * bucket riêng.
   */
  const rankedDue = dueMemories
    .filter((memory) => !relearningIds.has(memory.vocabularyId))
    .map((memory) => ({
      ...memory,

      priority: getDuePriority(memory, now),
    }))
    .sort((a, b) => b.priority - a.priority);

  const mode = chooseMode({
    dueCount: rankedDue.length,

    daysSinceLastActivity,
  });

  let targets;

  if (mode === "RECOVERY") {
    targets = {
      due: takeIds(rankedDue, CONFIG.recoveryDueCap),

      relearning: takeIds(relearningWords, CONFIG.recoveryRelearningCap),

      weak: takeIds(weakOnlyWords, CONFIG.recoveryWeakCap),

      /**
       * Recovery:
       * tạm ngừng nạp kiến thức mới.
       */
      newWords: [],
    };
  } else if (mode === "BUSY") {
    targets = {
      due: takeIds(rankedDue, CONFIG.busyDueCap),

      relearning: takeIds(relearningWords, CONFIG.busyRelearningCap),

      weak: takeIds(weakOnlyWords, CONFIG.busyWeakCap),

      /**
       * Busy:
       * giảm lượng new words,
       * không tắt hoàn toàn.
       */
      newWords: newWordIds.slice(
        0,
        Math.ceil(newWordIds.length * CONFIG.busyNewRatio),
      ),
    };
  } else {
    /**
     * NORMAL:
     *
     * Không ép số từ/ngày.
     * Curriculum của bạn quyết định.
     */
    targets = {
      due: rankedDue.map((memory) => memory.vocabularyId),

      relearning: relearningWords.map((word) => word.id),

      weak: weakOnlyWords.map((word) => word.id),

      newWords: [...newWordIds],
    };
  }

  const raw = {
    due: rankedDue.length,

    relearning: relearningWords.length,

    weak: weakOnlyWords.length,

    newWords: newWordIds.length,
  };

  const selected = {
    due: targets.due.length,

    relearning: targets.relearning.length,

    weak: targets.weak.length,

    newWords: targets.newWords.length,
  };

  const deferred = {
    due: Math.max(0, raw.due - selected.due),

    relearning: Math.max(0, raw.relearning - selected.relearning),

    weak: Math.max(0, raw.weak - selected.weak),

    newWords: Math.max(0, raw.newWords - selected.newWords),
  };

  raw.total = raw.due + raw.relearning + raw.weak + raw.newWords;

  selected.total =
    selected.due + selected.relearning + selected.weak + selected.newWords;

  deferred.total =
    deferred.due + deferred.relearning + deferred.weak + deferred.newWords;

  let reason;

  if (mode === "RECOVERY") {
    if (
      daysSinceLastActivity !== null &&
      daysSinceLastActivity >= CONFIG.recoveryGapDays
    ) {
      reason =
        `Bạn quay lại sau khoảng ${daysSinceLastActivity} ngày. ` +
        "Hệ thống tạm giảm tải và ưu tiên kiến thức cũ trước.";
    } else {
      reason =
        "Backlog ôn tập đang lớn. Hệ thống chia nhỏ phần cần xử lý để tránh quá tải.";
    }
  } else if (mode === "BUSY") {
    reason =
      "Khối lượng ôn đang cao hơn bình thường. Hệ thống giảm lượng từ mới và ưu tiên kiến thức cũ.";
  } else {
    reason =
      "Khối lượng hiện tại đang cân bằng. Bạn có thể tiếp tục curriculum bình thường.";
  }

  return {
    mode,

    reason,

    daysSinceLastActivity,

    raw,
    selected,
    deferred,

    targets,
  };
}
