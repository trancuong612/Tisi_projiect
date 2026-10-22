const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Workload safety limits.
 *
 * NORMAL:
 * curriculum quyết định khối lượng.
 *
 * BUSY / RECOVERY:
 * giới hạn tạm thời khi backlog cao.
 */
const CONFIG = {
  // Daily core review caps. These are TASK caps, not changes to FSRS due dates.
  normalDueCap: 20,
  busyDueCap: 12,
  recoveryDueCap: 10,

  normalCarryoverCap: 5,
  busyCarryoverCap: 3,
  recoveryCarryoverCap: 3,

  normalExtraPracticeCap: 4,
  busyExtraPracticeCap: 2,
  recoveryExtraPracticeCap: 1,

  busyDueThreshold: 40,
  recoveryDueThreshold: 80,

  busyGapDays: 3,
  recoveryGapDays: 7,
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
    .map((item) =>
      typeof item === "string" ? item : item.vocabularyId || item.id,
    );
}

function uniqueIds(values) {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Bảo hiểm cuối:
 *
 * Một vocabularyId chỉ được xuất hiện
 * trong MỘT bucket duy nhất.
 *
 * Priority:
 *
 * RELEARNING
 * ↓
 * DUE
 * ↓
 * WEAK
 * ↓
 * NEW
 */
function enforceUniqueTargets(targets) {
  const used = new Set();

  function takeUnique(values) {
    const result = [];

    for (const id of uniqueIds(values)) {
      if (used.has(id)) {
        continue;
      }

      used.add(id);
      result.push(id);
    }

    return result;
  }

  const newWords = takeUnique(targets.newWords || []);
  const due = takeUnique(targets.due || []);
  const relearning = takeUnique(targets.relearning || []);
  const weak = takeUnique(targets.weak || []);

  return {
    due,
    relearning,
    weak,
    newWords,
  };
}

export function buildDailyWorkload({
  now,
  dueMemories,
  weakWords,
  newWordIds,
  lastActivityAt,
}) {
  const daysSinceLastActivity = calculateDaysSince(lastActivityAt, now);

  /**
   * 1. RELEARNING có priority cao nhất.
   */
  // FSRS due always wins over optional practice. Never suppress an actual due.
  const mandatoryNewIds = new Set(newWordIds);
  const allDueIds = new Set(dueMemories.map((memory) => memory.vocabularyId));
  const relearningWords = weakWords.filter(
    (word) =>
      word.weakProfile.status === "RELEARNING" &&
      !allDueIds.has(word.id) &&
      !mandatoryNewIds.has(word.id),
  );

  const relearningIds = new Set(relearningWords.map((word) => word.id));

  /**
   * 2. DUE.
   *
   * Một từ đã thuộc RELEARNING
   * thì không được xuất hiện thêm trong DUE.
   */
  const rankedDue = dueMemories
    .filter(
      (memory) =>
        !relearningIds.has(memory.vocabularyId) &&
        !mandatoryNewIds.has(memory.vocabularyId),
    )
    .map((memory) => ({
      ...memory,
      priority: getDuePriority(memory, now),
    }))
    .sort((a, b) => b.priority - a.priority);

  /**
   * Toàn bộ raw DUE IDs.
   *
   * Quan trọng:
   * dùng RAW set, không phải chỉ những từ
   * sau khi cap Busy/Recovery.
   *
   * Nếu một từ DUE bị deferred,
   * nó cũng không được lẻn sang WEAK.
   */
  const dueIds = new Set(rankedDue.map((memory) => memory.vocabularyId));

  /**
   * 3. WEAK.
   *
   * Chỉ là WEAK thuần túy.
   *
   * Nếu đã thuộc:
   * - RELEARNING
   * - DUE
   *
   * thì loại khỏi bucket WEAK.
   */
  const weakOnlyWords = weakWords.filter(
    (word) =>
      word.weakProfile.status === "WEAK" &&
      !relearningIds.has(word.id) &&
      !dueIds.has(word.id) &&
      !mandatoryNewIds.has(word.id),
  );

  const weakIds = new Set(weakOnlyWords.map((word) => word.id));

  /**
   * 4. NEW.
   *
   * Bình thường NEW không thể trùng DUE,
   * nhưng vẫn phòng thủ dữ liệu để
   * một ID chỉ có đúng một nhiệm vụ.
   */
  const cleanedNewWordIds = uniqueIds(newWordIds);

  const mode = chooseMode({
    dueCount: rankedDue.length,
    daysSinceLastActivity,
  });

  // Daily budget: NEW follows curriculum unchanged; optional practice shares
  // ONE small cap, not two independent caps. DUE can be extended voluntarily.
  const limits =
    mode === "RECOVERY"
      ? {
          due: CONFIG.recoveryDueCap,
          carryover: CONFIG.recoveryCarryoverCap,
          practice: CONFIG.recoveryExtraPracticeCap,
        }
      : mode === "BUSY"
      ? {
          due: CONFIG.busyDueCap,
          carryover: CONFIG.busyCarryoverCap,
          practice: CONFIG.busyExtraPracticeCap,
        }
      : {
          due: CONFIG.normalDueCap,
          carryover: CONFIG.normalCarryoverCap,
          practice: CONFIG.normalExtraPracticeCap,
        };

  const dueSelected = takeIds(rankedDue, limits.due);
  // If both groups exist, reserve at least one place for each when possible.
  // The two groups SHARE the cap; they are not independent workloads.
  const reQuota =
    weakOnlyWords.length > 0 && limits.practice >= 2
      ? Math.ceil(limits.practice / 2)
      : limits.practice;
  let relearningSelected = takeIds(relearningWords, reQuota);
  let weakSelected = takeIds(
    weakOnlyWords,
    Math.max(0, limits.practice - relearningSelected.length),
  );
  let spare = Math.max(
    0,
    limits.practice - relearningSelected.length - weakSelected.length,
  );
  if (spare > 0) {
    relearningSelected = takeIds(
      relearningWords,
      relearningSelected.length + spare,
    );
    spare = Math.max(
      0,
      limits.practice - relearningSelected.length - weakSelected.length,
    );
  }
  if (spare > 0)
    weakSelected = takeIds(weakOnlyWords, weakSelected.length + spare);
  let targets = {
    due: dueSelected,
    relearning: relearningSelected,
    weak: weakSelected,
    // Never reduce the user's scheduled new words, including BUSY/RECOVERY.
    newWords: [...cleanedNewWordIds],
  };

  /**
   * Safety net cuối cùng.
   *
   * Dù dữ liệu đầu vào có bất thường,
   * targets trả về vẫn tuyệt đối không trùng ID.
   */
  targets = enforceUniqueTargets(targets);

  // Distinguish TODAY's assigned DUE cards from deferred FSRS backlog.
  // A weak overdue card not assigned today is NOT "already practised today".
  const assignedDueIds = new Set(targets.due);
  const overlap = {
    dueRelearning: weakWords.filter(
      (w) => w.weakProfile.status === "RELEARNING" && assignedDueIds.has(w.id),
    ).length,
    dueWeak: weakWords.filter(
      (w) => w.weakProfile.status === "WEAK" && assignedDueIds.has(w.id),
    ).length,
    deferredDueRelearning: weakWords.filter(
      (w) =>
        w.weakProfile.status === "RELEARNING" &&
        allDueIds.has(w.id) &&
        !assignedDueIds.has(w.id),
    ).length,
    deferredDueWeak: weakWords.filter(
      (w) =>
        w.weakProfile.status === "WEAK" &&
        allDueIds.has(w.id) &&
        !assignedDueIds.has(w.id),
    ).length,
  };

  /**
   * RAW cũng phải phản ánh số nhiệm vụ
   * thực sự khác nhau.
   */
  const raw = {
    due: rankedDue.length,
    relearning: relearningWords.length,
    weak: weakOnlyWords.length,
    newWords: cleanedNewWordIds.length,
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
        "Tisi ưu tiên nhắc lịch ôn; đủ từ mới theo lịch vẫn được giữ nguyên.";
    } else {
      reason =
        "Nợ ôn đang cao. Tisi giao một phần ôn ưu tiên hôm nay; phần còn lại vẫn giữ nguyên hạn FSRS.";
    }
  } else if (mode === "BUSY") {
    reason =
      "Khối lượng lớn: giữ đủ từ mới, chia nhỏ nợ ôn, và chỉ giao ít bài củng cố. Bạn có thể chọn ôn thêm.";
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
    limits,
    overlap,
  };
}
