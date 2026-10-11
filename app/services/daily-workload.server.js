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

  const relearning = takeUnique(targets.relearning || []);
  const due = takeUnique(targets.due || []);
  const weak = takeUnique(targets.weak || []);
  const newWords = takeUnique(targets.newWords || []);

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
  const relearningWords = weakWords.filter(
    (word) => word.weakProfile.status === "RELEARNING",
  );

  const relearningIds = new Set(relearningWords.map((word) => word.id));

  /**
   * 2. DUE.
   *
   * Một từ đã thuộc RELEARNING
   * thì không được xuất hiện thêm trong DUE.
   */
  const rankedDue = dueMemories
    .filter((memory) => !relearningIds.has(memory.vocabularyId))
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
      !dueIds.has(word.id),
  );

  const weakIds = new Set(weakOnlyWords.map((word) => word.id));

  /**
   * 4. NEW.
   *
   * Bình thường NEW không thể trùng DUE,
   * nhưng vẫn phòng thủ dữ liệu để
   * một ID chỉ có đúng một nhiệm vụ.
   */
  const cleanedNewWordIds = uniqueIds(newWordIds).filter(
    (id) => !relearningIds.has(id) && !dueIds.has(id) && !weakIds.has(id),
  );

  const mode = chooseMode({
    dueCount: rankedDue.length,
    daysSinceLastActivity,
  });

  let targets;

  if (mode === "RECOVERY") {
    targets = {
      relearning: takeIds(relearningWords, CONFIG.recoveryRelearningCap),

      due: takeIds(rankedDue, CONFIG.recoveryDueCap),

      weak: takeIds(weakOnlyWords, CONFIG.recoveryWeakCap),

      newWords: [],
    };
  } else if (mode === "BUSY") {
    targets = {
      relearning: takeIds(relearningWords, CONFIG.busyRelearningCap),

      due: takeIds(rankedDue, CONFIG.busyDueCap),

      weak: takeIds(weakOnlyWords, CONFIG.busyWeakCap),

      newWords: cleanedNewWordIds.slice(
        0,
        Math.ceil(cleanedNewWordIds.length * CONFIG.busyNewRatio),
      ),
    };
  } else {
    targets = {
      relearning: relearningWords.map((word) => word.id),

      due: rankedDue.map((memory) => memory.vocabularyId),

      weak: weakOnlyWords.map((word) => word.id),

      newWords: [...cleanedNewWordIds],
    };
  }

  /**
   * Safety net cuối cùng.
   *
   * Dù dữ liệu đầu vào có bất thường,
   * targets trả về vẫn tuyệt đối không trùng ID.
   */
  targets = enforceUniqueTargets(targets);

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
