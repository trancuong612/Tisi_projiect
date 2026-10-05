import { prisma } from "../utils/db.server";

import { generateVocabularyInsight } from "./lexical-insight.server";
import { evaluateAndRecordUsageAttempt } from "./usage-learning.server";

const BATCH_SIZE = 5;

const CORE_EXERCISE_ORDER = [
  "RECOGNITION",
  "REVERSE_RECALL",
  "SPELLING",
  "LISTENING",
  "DICTATION",
  "CLOZE",
  "COLLOCATION",
  "CONFUSION",
  "USAGE",
];

const PASS_FIELD = {
  RECOGNITION: "recognitionPass",
  REVERSE_RECALL: "recallPass",
  SPELLING: "spellingPass",
  LISTENING: "listeningPass",
  DICTATION: "dictationPass",
  CLOZE: "contextPass",
  COLLOCATION: "collocationPass",
  CONFUSION: "confusionPass",
  USAGE: "usagePass",
};

const SKILL_WEIGHTS = {
  RECOGNITION: {
    recognition: 1,
    meaningRecall: 0.25,
  },
  REVERSE_RECALL: {
    meaningRecall: 1,
    spelling: 0.35,
  },
  SPELLING: {
    spelling: 1,
    recognition: 0.15,
  },
  LISTENING: {
    listening: 1,
    recognition: 0.35,
  },
  DICTATION: {
    listening: 1,
    spelling: 0.9,
  },
  CLOZE: {
    meaningRecall: 0.7,
    usage: 1,
    spelling: 0.25,
  },
  COLLOCATION: {
    usage: 1,
    meaningRecall: 0.35,
  },
  CONFUSION: {
    recognition: 0.8,
    meaningRecall: 0.65,
  },
};

const SKILL_NAMES = [
  "recognition",
  "meaningRecall",
  "spelling",
  "listening",
  "usage",
];

function toArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}

function jsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value = "") {
  return String(value)
    .toLocaleLowerCase("en-US")
    .trim()
    .replace(/[“”"'`]/g, "")
    .replace(/[.!?,;:]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeToken(value = "") {
  return String(value)
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9'-]/g, "")
    .trim();
}

function chunk(values, size) {
  const result = [];

  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }

  return result;
}

function shuffle(values) {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }

  return result;
}

function uniqueBy(values, getKey) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const key = getKey(value);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

export function createNewLearningCloze(example, baseWord) {
  if (!example || !baseWord) {
    return null;
  }

  const escaped = baseWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b(${escaped}(?:s|es|ed|ing)?)\\b`, "i");
  const match = example.match(regex);

  if (!match) {
    return null;
  }

  return {
    prompt: example.replace(regex, "________"),
    expectedAnswer: match[1],
  };
}

function buildCollocationTask(word) {
  const lexicalItems = [
    ...jsonArray(word.insight?.collocations),
    ...jsonArray(word.insight?.chunks),
  ].filter((item) => item && typeof item.phrase === "string");

  const targetTokens = new Set(
    normalizeText(word.word).split(" ").map(normalizeToken).filter(Boolean),
  );

  for (const item of lexicalItems) {
    const phrase = String(item.phrase || "").trim();

    if (!phrase) {
      continue;
    }

    const phraseTokens = phrase.split(/\s+/);

    const candidateIndexes = phraseTokens
      .map((token, index) => ({
        token,
        clean: normalizeToken(token),
        index,
      }))
      .filter(
        ({ clean }) =>
          clean.length >= 3 &&
          !targetTokens.has(clean) &&
          !["the", "a", "an", "to", "of", "for", "in", "on"].includes(clean),
      );

    const selected = candidateIndexes.at(-1);

    if (!selected) {
      continue;
    }

    const promptTokens = [...phraseTokens];
    promptTokens[selected.index] = "________";

    return {
      prompt: promptTokens.join(" "),
      expectedAnswer: selected.clean,
      fullPhrase: phrase,
      meaning: String(item.meaning || "").trim(),
      example: String(item.example || "").trim(),
    };
  }

  return null;
}

function buildConfusionTask(word) {
  const confusions = jsonArray(word.insight?.confusions).filter(
    (item) =>
      item &&
      typeof item.word === "string" &&
      normalizeText(item.word) !== normalizeText(word.word),
  );

  const confusion = confusions[0];

  if (!confusion) {
    return null;
  }

  const targetExample = String(confusion.targetExample || "").trim();
  const cloze = createNewLearningCloze(targetExample, word.word);

  if (cloze) {
    return {
      prompt: cloze.prompt,
      expectedAnswer: cloze.expectedAnswer,
      options: shuffle([word.word, confusion.word]),
      confusionWord: confusion.word,
      confusionMeaning: String(confusion.meaning || "").trim(),
      difference: String(confusion.difference || "").trim(),
      targetExample,
      otherExample: String(confusion.otherExample || "").trim(),
    };
  }

  return {
    prompt: `Bạn muốn diễn đạt nghĩa “${word.meaning}”. Chọn từ phù hợp nhất.`,
    expectedAnswer: word.word,
    options: shuffle([word.word, confusion.word]),
    confusionWord: confusion.word,
    confusionMeaning: String(confusion.meaning || "").trim(),
    difference: String(confusion.difference || "").trim(),
    targetExample,
    otherExample: String(confusion.otherExample || "").trim(),
  };
}

function buildUsageScaffold(word) {
  const chunks = jsonArray(word.insight?.chunks);
  const collocations = jsonArray(word.insight?.collocations);

  const phrase =
    chunks.find((item) => item?.phrase)?.phrase ||
    collocations.find((item) => item?.phrase)?.phrase ||
    "";

  return String(phrase || "").trim();
}

function getRequiredPasses(word) {
  return {
    recognitionPass: true,
    recallPass: true,
    spellingPass: true,
    listeningPass: true,
    dictationPass: true,
    contextPass: Boolean(createNewLearningCloze(word.example, word.word)),
    collocationPass: Boolean(buildCollocationTask(word)),
    confusionPass: Boolean(buildConfusionTask(word)),
    usagePass: Boolean(process.env.GEMINI_API_KEY),
    finalPass: true,
  };
}

function isCoreComplete(progress, word) {
  if (!progress) {
    return false;
  }

  const required = getRequiredPasses(word);

  return Object.entries(required).every(([field, needed]) => {
    if (field === "finalPass" || !needed) {
      return true;
    }

    return Boolean(progress[field]);
  });
}

function isWordMastered(progress, word) {
  return Boolean(
    progress &&
      isCoreComplete(progress, word) &&
      progress.finalPass &&
      progress.masteredAt,
  );
}

function getNextCoreExerciseType(progress, word) {
  const required = getRequiredPasses(word);

  for (const type of CORE_EXERCISE_ORDER) {
    const field = PASS_FIELD[type];

    if (!field || !required[field]) {
      continue;
    }

    if (!progress?.[field]) {
      return type;
    }
  }

  return null;
}

function getSkillValues(skill) {
  return {
    recognition: skill?.recognition ?? 0,
    meaningRecall: skill?.meaningRecall ?? 0,
    spelling: skill?.spelling ?? 0,
    listening: skill?.listening ?? 0,
    usage: skill?.usage ?? 0,
  };
}

function calculateRecallQuality({ responseTime, hintsUsed }) {
  const seconds = Math.max(0, Number(responseTime || 0)) / 1000;

  let speedFactor = 1;

  if (seconds <= 4) {
    speedFactor = 1;
  } else if (seconds <= 8) {
    speedFactor = 0.9;
  } else if (seconds <= 15) {
    speedFactor = 0.78;
  } else if (seconds <= 30) {
    speedFactor = 0.64;
  } else {
    speedFactor = 0.52;
  }

  const hintFactor = Math.max(0.4, 1 - Number(hintsUsed || 0) * 0.2);

  return clamp(speedFactor * hintFactor, 0.35, 1);
}

function updateSkillValue({ current, correct, quality, weight }) {
  if (!weight) {
    return current;
  }

  if (correct) {
    const gain = (1 - current) * 0.2 * quality * weight;
    return clamp(current + gain);
  }

  const loss = Math.max(0.05, current * 0.12) * weight;
  return clamp(current - loss);
}

function buildSkillUpdates({ skill, exerciseType, correct, quality }) {
  const current = getSkillValues(skill);
  const weights = SKILL_WEIGHTS[exerciseType] || {};
  const updates = {};

  for (const skillName of SKILL_NAMES) {
    const weight = weights[skillName];

    if (!weight) {
      continue;
    }

    updates[skillName] = updateSkillValue({
      current: current[skillName],
      correct,
      quality,
      weight,
    });
  }

  return updates;
}

function applyMasteryFloors(skillUpdates, currentSkill) {
  const current = getSkillValues(currentSkill);

  return {
    ...skillUpdates,
    recognition: Math.max(skillUpdates.recognition ?? current.recognition, 0.6),
    meaningRecall: Math.max(
      skillUpdates.meaningRecall ?? current.meaningRecall,
      0.55,
    ),
    spelling: Math.max(skillUpdates.spelling ?? current.spelling, 0.55),
    listening: Math.max(skillUpdates.listening ?? current.listening, 0.55),
    usage: Math.max(skillUpdates.usage ?? current.usage, 0.5),
  };
}

function buildOptions({ word, pool, type }) {
  const isMeaning = type === "RECOGNITION";

  const preferred = pool.filter(
    (candidate) =>
      candidate.id !== word.id &&
      candidate.partOfSpeech &&
      word.partOfSpeech &&
      candidate.partOfSpeech === word.partOfSpeech,
  );

  const fallback = pool.filter((candidate) => candidate.id !== word.id);

  const candidates = uniqueBy([...preferred, ...fallback], (candidate) =>
    normalizeText(isMeaning ? candidate.meaning : candidate.word),
  );

  const distractors = shuffle(candidates)
    .slice(0, 3)
    .map((candidate) => (isMeaning ? candidate.meaning : candidate.word));

  const correct = isMeaning ? word.meaning : word.word;

  return shuffle([correct, ...distractors]);
}

function buildCoreExercise({ word, progress, optionPool }) {
  const type = getNextCoreExerciseType(progress, word);

  if (!type) {
    return null;
  }

  const cloze = createNewLearningCloze(word.example, word.word);
  const collocation = buildCollocationTask(word);
  const confusion = buildConfusionTask(word);

  if (type === "RECOGNITION") {
    return {
      type,
      stage: "CORE",
      prompt: word.word,
      options: buildOptions({ word, pool: optionPool, type }),
      expectedAnswer: word.meaning,
    };
  }

  if (type === "REVERSE_RECALL") {
    return {
      type,
      stage: "CORE",
      prompt: word.meaning,
      expectedAnswer: word.word,
    };
  }

  if (type === "SPELLING") {
    return {
      type,
      stage: "CORE",
      prompt: "Nhìn kỹ mặt chữ, sau đó gõ lại khi từ biến mất.",
      expectedAnswer: word.word,
    };
  }

  if (type === "LISTENING") {
    return {
      type,
      stage: "CORE",
      prompt: "Nghe từ và chọn đúng mặt chữ.",
      options: buildOptions({ word, pool: optionPool, type }),
      expectedAnswer: word.word,
    };
  }

  if (type === "DICTATION") {
    return {
      type,
      stage: "CORE",
      prompt: "Nghe từ và gõ lại chính xác.",
      expectedAnswer: word.word,
    };
  }

  if (type === "CLOZE") {
    return {
      type,
      stage: "CORE",
      prompt: cloze?.prompt || word.example || "Điền từ phù hợp vào câu.",
      expectedAnswer: cloze?.expectedAnswer || word.word,
      cloze,
    };
  }

  if (type === "COLLOCATION") {
    return {
      type,
      stage: "CORE",
      prompt: collocation?.prompt || "Hoàn thành cụm từ tự nhiên.",
      expectedAnswer: collocation?.expectedAnswer || word.word,
      collocation,
    };
  }

  if (type === "CONFUSION") {
    return {
      type,
      stage: "CORE",
      prompt: confusion?.prompt || `Chọn cách dùng đúng của ${word.word}.`,
      expectedAnswer: confusion?.expectedAnswer || word.word,
      options: confusion?.options || [word.word],
      confusion,
    };
  }

  if (type === "USAGE") {
    return {
      type,
      stage: "CORE",
      prompt: `Viết một câu tiếng Anh mới có dùng “${word.word}” đúng với nghĩa “${word.meaning}”.`,
      expectedAnswer: word.word,
      scaffold: buildUsageScaffold(word),
    };
  }

  return null;
}

function getFinalExerciseType(word) {
  const required = getRequiredPasses(word);
  const skill = getSkillValues(word.skill);
  const candidates = [];

  if (required.dictationPass) {
    candidates.push({
      type: "DICTATION",
      score: (skill.listening + skill.spelling) / 2,
      priority: 1,
    });
  }

  if (required.recallPass) {
    candidates.push({
      type: "REVERSE_RECALL",
      score: skill.meaningRecall,
      priority: 2,
    });
  }

  if (required.contextPass) {
    candidates.push({
      type: "CLOZE",
      score: (skill.meaningRecall + skill.usage) / 2,
      priority: 3,
    });
  }

  if (required.collocationPass) {
    candidates.push({
      type: "COLLOCATION",
      score: skill.usage,
      priority: 4,
    });
  }

  if (required.confusionPass) {
    candidates.push({
      type: "CONFUSION",
      score: (skill.recognition + skill.meaningRecall) / 2,
      priority: 5,
    });
  }

  candidates.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }

    return a.priority - b.priority;
  });

  return candidates[0]?.type || "REVERSE_RECALL";
}

function buildFinalExercise({ word, optionPool }) {
  const type = getFinalExerciseType(word);
  const base = buildCoreExercise({
    word,
    progress: {
      recognitionPass: type !== "RECOGNITION",
      recallPass: type !== "REVERSE_RECALL",
      spellingPass: type !== "SPELLING",
      listeningPass: type !== "LISTENING",
      dictationPass: type !== "DICTATION",
      contextPass: type !== "CLOZE",
      collocationPass: type !== "COLLOCATION",
      confusionPass: type !== "CONFUSION",
      usagePass: true,
    },
    optionPool,
  });

  if (!base) {
    return null;
  }

  return {
    ...base,
    stage: "FINAL",
    isFinal: true,
  };
}

function buildProgressSummary(progress, word) {
  const required = getRequiredPasses(word);

  const checks = [
    {
      key: "recognition",
      label: "Nhận diện",
      required: required.recognitionPass,
      passed: Boolean(progress?.recognitionPass),
    },
    {
      key: "recall",
      label: "Nhớ lại",
      required: required.recallPass,
      passed: Boolean(progress?.recallPass),
    },
    {
      key: "spelling",
      label: "Mặt chữ",
      required: required.spellingPass,
      passed: Boolean(progress?.spellingPass),
    },
    {
      key: "listening",
      label: "Nghe",
      required: required.listeningPass,
      passed: Boolean(progress?.listeningPass),
    },
    {
      key: "dictation",
      label: "Chính tả nghe",
      required: required.dictationPass,
      passed: Boolean(progress?.dictationPass),
    },
    {
      key: "context",
      label: "Ngữ cảnh",
      required: required.contextPass,
      passed: !required.contextPass || Boolean(progress?.contextPass),
    },
    {
      key: "collocation",
      label: "Collocation",
      required: required.collocationPass,
      passed: !required.collocationPass || Boolean(progress?.collocationPass),
    },
    {
      key: "confusion",
      label: "Phân biệt",
      required: required.confusionPass,
      passed: !required.confusionPass || Boolean(progress?.confusionPass),
    },
    {
      key: "usage",
      label: "Tự đặt câu",
      required: required.usagePass,
      passed: !required.usagePass || Boolean(progress?.usagePass),
    },
    {
      key: "final",
      label: "Final Check",
      required: true,
      passed: Boolean(progress?.finalPass),
    },
  ];

  const requiredChecks = checks.filter((item) => item.required);
  const passed = requiredChecks.filter((item) => item.passed).length;

  return {
    checks,
    passed,
    total: requiredChecks.length,
    percent:
      requiredChecks.length === 0
        ? 100
        : Math.round((passed / requiredChecks.length) * 100),
  };
}

async function getSessionContext(sessionId) {
  const session = await prisma.dailySession.findUnique({
    where: {
      id: sessionId,
    },
    select: {
      id: true,
      newTargets: true,
      startedAt: true,
    },
  });

  if (!session) {
    throw new Response("Daily session not found", {
      status: 404,
    });
  }

  const newIds = toArray(session.newTargets);

  if (!newIds.length) {
    return {
      session,
      newIds,
      words: [],
      progressRows: [],
      optionPool: [],
    };
  }

  const [words, progressRows, extraOptions] = await Promise.all([
    prisma.vocabulary.findMany({
      where: {
        id: {
          in: newIds,
        },
      },
      include: {
        memory: true,
        skill: true,
        insight: true,
        lesson: {
          include: {
            week: true,
          },
        },
      },
    }),
    prisma.newLearningProgress.findMany({
      where: {
        sessionId,
      },
    }),
    prisma.vocabulary.findMany({
      where: {
        id: {
          notIn: newIds,
        },
      },
      select: {
        id: true,
        word: true,
        meaning: true,
        partOfSpeech: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 30,
    }),
  ]);

  const wordMap = new Map(words.map((word) => [word.id, word]));
  const orderedWords = newIds.map((id) => wordMap.get(id)).filter(Boolean);

  const optionPool = [
    ...orderedWords.map((word) => ({
      id: word.id,
      word: word.word,
      meaning: word.meaning,
      partOfSpeech: word.partOfSpeech,
    })),
    ...extraOptions,
  ];

  return {
    session,
    newIds,
    words: orderedWords,
    progressRows,
    optionPool,
  };
}

function calculateSessionPercent(words, progressMap) {
  let passed = 0;
  let total = 0;

  for (const word of words) {
    const summary = buildProgressSummary(progressMap.get(word.id), word);
    passed += summary.passed;
    total += summary.total;
  }

  return total ? Math.round((passed / total) * 100) : 100;
}

export async function getNewLearningState(sessionId) {
  const context = await getSessionContext(sessionId);

  if (!context.newIds.length) {
    return {
      mode: "EMPTY",
      summary: {
        total: 0,
        coreReady: 0,
        mastered: 0,
        percent: 100,
        batchNumber: 0,
        batchCount: 0,
        phase: "EMPTY",
      },
    };
  }

  const progressMap = new Map(
    context.progressRows.map((progress) => [progress.vocabularyId, progress]),
  );

  const groups = chunk(context.newIds, BATCH_SIZE);

  const coreReady = context.words.filter((word) =>
    isCoreComplete(progressMap.get(word.id), word),
  ).length;

  const mastered = context.words.filter((word) =>
    isWordMastered(progressMap.get(word.id), word),
  ).length;

  let activeBatchIndex = groups.findIndex((ids) =>
    ids.some((id) => {
      const word = context.words.find((item) => item.id === id);
      const progress = progressMap.get(id);

      return word && !isCoreComplete(progress, word);
    }),
  );

  const summary = {
    total: context.words.length,
    coreReady,
    mastered,
    percent: calculateSessionPercent(context.words, progressMap),
    batchNumber: activeBatchIndex === -1 ? groups.length : activeBatchIndex + 1,
    batchCount: groups.length,
    phase: activeBatchIndex === -1 ? "FINAL" : "CORE",
  };

  if (mastered >= context.words.length) {
    return {
      mode: "COMPLETE",
      summary: {
        ...summary,
        percent: 100,
        phase: "COMPLETE",
      },
    };
  }

  const currentTurn = context.progressRows.reduce(
    (sum, progress) => sum + progress.encounterCount,
    0,
  );

  if (activeBatchIndex !== -1) {
    const activeIds = groups[activeBatchIndex];
    const activeWords = activeIds
      .map((id) => context.words.find((word) => word.id === id))
      .filter(Boolean);

    for (const word of activeWords) {
      const progress = progressMap.get(word.id);

      if (!progress?.exposed) {
        return {
          mode: "EXPOSURE",
          word,
          wordProgress: buildProgressSummary(progress, word),
          summary,
          batch: {
            size: activeWords.length,
            coreReady: activeWords.filter((item) =>
              isCoreComplete(progressMap.get(item.id), item),
            ).length,
          },
        };
      }
    }

    let candidates = activeWords
      .map((word) => ({
        word,
        progress: progressMap.get(word.id),
      }))
      .filter(({ word, progress }) => !isCoreComplete(progress, word));

    const eligible = candidates.filter(
      ({ progress }) => (progress?.nextEligibleTurn ?? 0) <= currentTurn,
    );

    if (eligible.length) {
      candidates = eligible;
    }

    candidates.sort((a, b) => {
      const aLast = a.progress?.lastTurn ?? -1;
      const bLast = b.progress?.lastTurn ?? -1;

      if (aLast !== bLast) {
        return aLast - bLast;
      }

      const aWrong = a.progress?.wrongCount ?? 0;
      const bWrong = b.progress?.wrongCount ?? 0;

      return bWrong - aWrong;
    });

    const selected = candidates[0];

    if (!selected) {
      return {
        mode: "COMPLETE",
        summary,
      };
    }

    const exercise = buildCoreExercise({
      word: selected.word,
      progress: selected.progress,
      optionPool: context.optionPool,
    });

    return {
      mode: "EXERCISE",
      word: selected.word,
      exercise,
      wordProgress: buildProgressSummary(selected.progress, selected.word),
      summary,
      batch: {
        size: activeWords.length,
        coreReady: activeWords.filter((item) =>
          isCoreComplete(progressMap.get(item.id), item),
        ).length,
      },
      turn: currentTurn,
    };
  }

  let finalCandidates = context.words
    .map((word) => ({
      word,
      progress: progressMap.get(word.id),
    }))
    .filter(
      ({ word, progress }) =>
        isCoreComplete(progress, word) && !progress?.finalPass,
    );

  const eligibleFinal = finalCandidates.filter(
    ({ progress }) => (progress?.nextEligibleTurn ?? 0) <= currentTurn,
  );

  if (eligibleFinal.length) {
    finalCandidates = eligibleFinal;
  }

  finalCandidates.sort((a, b) => {
    const aLast = a.progress?.lastTurn ?? -1;
    const bLast = b.progress?.lastTurn ?? -1;

    if (aLast !== bLast) {
      return aLast - bLast;
    }

    return (b.progress?.wrongCount ?? 0) - (a.progress?.wrongCount ?? 0);
  });

  const selected = finalCandidates[0];

  if (!selected) {
    return {
      mode: "COMPLETE",
      summary,
    };
  }

  return {
    mode: "FINAL",
    word: selected.word,
    exercise: buildFinalExercise({
      word: selected.word,
      optionPool: context.optionPool,
    }),
    wordProgress: buildProgressSummary(selected.progress, selected.word),
    summary,
    turn: currentTurn,
  };
}

export async function markNewWordExposed({ sessionId, vocabularyId }) {
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

  if (!newIds.includes(vocabularyId)) {
    throw new Response("Vocabulary is not part of today's new-word session.", {
      status: 400,
    });
  }

  await prisma.newLearningProgress.upsert({
    where: {
      sessionId_vocabularyId: {
        sessionId,
        vocabularyId,
      },
    },
    create: {
      sessionId,
      vocabularyId,
      exposed: true,
    },
    update: {
      exposed: true,
    },
  });

  try {
    await generateVocabularyInsight(vocabularyId);
  } catch (error) {
    console.error("Could not prepare lexical insight for new learning:", error);
  }
}

async function validateSessionWord({ sessionId, vocabularyId }) {
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

  if (!newIds.includes(vocabularyId)) {
    throw new Response("Vocabulary is not part of today's new-word session.", {
      status: 400,
    });
  }
}

async function getWordForLearning(vocabularyId) {
  const word = await prisma.vocabulary.findUnique({
    where: {
      id: vocabularyId,
    },
    include: {
      memory: true,
      skill: true,
      insight: true,
    },
  });

  if (!word) {
    throw new Response("Vocabulary not found", {
      status: 404,
    });
  }

  return word;
}

async function getProgress(sessionId, vocabularyId) {
  return prisma.newLearningProgress.findUnique({
    where: {
      sessionId_vocabularyId: {
        sessionId,
        vocabularyId,
      },
    },
  });
}

async function getTurn(sessionId) {
  const aggregate = await prisma.newLearningProgress.aggregate({
    where: {
      sessionId,
    },
    _sum: {
      encounterCount: true,
    },
  });

  return Number(aggregate._sum.encounterCount || 0) + 1;
}

export async function gradeNewLearningAnswer({
  sessionId,
  vocabularyId,
  exerciseType,
  stage = "CORE",
  answer,
  responseTime,
  hintsUsed,
}) {
  await validateSessionWord({ sessionId, vocabularyId });

  const word = await getWordForLearning(vocabularyId);
  const progress = await getProgress(sessionId, vocabularyId);

  const isFinal = stage === "FINAL";

  let exercise;

  if (isFinal) {
    if (!isCoreComplete(progress, word) || progress?.finalPass) {
      throw new Response(
        "Final challenge is no longer current. Reload /learn.",
        {
          status: 409,
        },
      );
    }

    exercise = buildFinalExercise({
      word,
      optionPool: [
        {
          id: word.id,
          word: word.word,
          meaning: word.meaning,
          partOfSpeech: word.partOfSpeech,
        },
      ],
    });
  } else {
    exercise = buildCoreExercise({
      word,
      progress,
      optionPool: [
        {
          id: word.id,
          word: word.word,
          meaning: word.meaning,
          partOfSpeech: word.partOfSpeech,
        },
      ],
    });
  }

  if (!exercise || exercise.type !== exerciseType || exerciseType === "USAGE") {
    throw new Response(
      "Learning exercise is no longer current. Reload /learn.",
      {
        status: 409,
      },
    );
  }

  const expectedAnswer = exercise.expectedAnswer;
  const correct = normalizeText(answer) === normalizeText(expectedAnswer);
  const safeHints = Math.max(0, Number(hintsUsed || 0));
  const independentPass = correct && safeHints === 0;
  const quality = correct
    ? calculateRecallQuality({ responseTime, hintsUsed: safeHints })
    : 0;

  const passField = PASS_FIELD[exerciseType];
  const turn = await getTurn(sessionId);
  const now = new Date();

  let skillUpdates = buildSkillUpdates({
    skill: word.skill,
    exerciseType,
    correct,
    quality,
  });

  const willMaster = isFinal && independentPass;

  if (willMaster) {
    skillUpdates = applyMasteryFloors(skillUpdates, word.skill);
  }

  await prisma.$transaction(async (tx) => {
    const progressData = {
      exposed: true,
      encounterCount: {
        increment: 1,
      },
      lastExercise: exerciseType,
      lastTurn: turn,
      nextEligibleTurn: turn + (correct ? 2 : 3),
      ...(correct
        ? {
            correctCount: {
              increment: 1,
            },
          }
        : {
            wrongCount: {
              increment: 1,
            },
          }),
    };

    if (!isFinal && independentPass && passField) {
      progressData[passField] = true;
    }

    if (isFinal && independentPass) {
      progressData.finalPass = true;
      progressData.masteredAt = now;
    }

    if (isFinal && !correct && passField) {
      progressData[passField] = false;
      progressData.finalPass = false;
      progressData.masteredAt = null;
    }

    await tx.newLearningProgress.upsert({
      where: {
        sessionId_vocabularyId: {
          sessionId,
          vocabularyId,
        },
      },
      create: {
        sessionId,
        vocabularyId,
        exposed: true,
        encounterCount: 1,
        correctCount: correct ? 1 : 0,
        wrongCount: correct ? 0 : 1,
        lastExercise: exerciseType,
        lastTurn: turn,
        nextEligibleTurn: turn + (correct ? 2 : 3),
        ...(!isFinal && independentPass && passField
          ? { [passField]: true }
          : {}),
        ...(isFinal && independentPass
          ? {
              finalPass: true,
              masteredAt: now,
            }
          : {}),
      },
      update: progressData,
    });

    if (Object.keys(skillUpdates).length) {
      await tx.skillState.upsert({
        where: {
          vocabularyId,
        },
        create: {
          vocabularyId,
          ...skillUpdates,
        },
        update: {
          ...skillUpdates,
        },
      });
    }

    await tx.reviewLog.create({
      data: {
        vocabularyId,
        exerciseType,
        answer: String(answer || ""),
        correct,
        responseTime: Math.max(0, Number(responseTime || 0)),
        hintsUsed: safeHints,
      },
    });

    if (willMaster && (!word.memory || word.memory.state === "NEW")) {
      await tx.memoryState.upsert({
        where: {
          vocabularyId,
        },
        create: {
          vocabularyId,
          state: "LEARNING",
          due: now,
        },
        update: {
          state: "LEARNING",
          due: now,
        },
      });
    }
  });

  return {
    correct,
    independentPass,
    quality: Number(quality.toFixed(2)),
    correctAnswer: expectedAnswer,
    word: word.word,
    meaning: word.meaning,
    example: word.example,
    exerciseType,
    stage: isFinal ? "FINAL" : "CORE",
    finalChallenge: isFinal,
    wordMastered: willMaster,
    message: isFinal
      ? correct
        ? "Final Challenge đã vượt qua. Từ này chính thức được bàn giao cho FSRS."
        : "Final Challenge chưa đạt. Kỹ năng vừa sai sẽ được mở lại để luyện thêm trước khi kiểm tra lại."
      : !correct
      ? "Chưa đúng. Từ này sẽ quay lại sau vài câu."
      : independentPass
      ? "Đúng độc lập. Một checkpoint đã được ghi nhận."
      : "Đúng nhưng có dùng gợi ý. Tisi sẽ hỏi lại để chắc rằng bạn tự nhớ được.",
  };
}

export async function gradeNewLearningUsage({
  sessionId,
  vocabularyId,
  answer,
  responseTime,
  hintsUsed,
}) {
  await validateSessionWord({ sessionId, vocabularyId });

  const word = await getWordForLearning(vocabularyId);
  const progress = await getProgress(sessionId, vocabularyId);
  const expectedType = getNextCoreExerciseType(progress, word);

  if (expectedType !== "USAGE") {
    throw new Response("Usage exercise is no longer current. Reload /learn.", {
      status: 409,
    });
  }

  const result = await evaluateAndRecordUsageAttempt({
    vocabularyId,
    answer,
    responseTime,
  });

  const evaluation = result.evaluation;
  const correct = evaluation.verdict === "CORRECT";
  const safeHints = Math.max(0, Number(hintsUsed || 0));
  const independentPass = correct && safeHints === 0;
  const turn = await getTurn(sessionId);

  await prisma.newLearningProgress.upsert({
    where: {
      sessionId_vocabularyId: {
        sessionId,
        vocabularyId,
      },
    },
    create: {
      sessionId,
      vocabularyId,
      exposed: true,
      encounterCount: 1,
      correctCount: correct ? 1 : 0,
      wrongCount: correct ? 0 : 1,
      lastExercise: "USAGE",
      lastTurn: turn,
      nextEligibleTurn: turn + (correct ? 2 : 3),
      usagePass: independentPass,
    },
    update: {
      exposed: true,
      encounterCount: {
        increment: 1,
      },
      lastExercise: "USAGE",
      lastTurn: turn,
      nextEligibleTurn: turn + (correct ? 2 : 3),
      ...(correct
        ? {
            correctCount: {
              increment: 1,
            },
          }
        : {
            wrongCount: {
              increment: 1,
            },
          }),
      ...(independentPass ? { usagePass: true } : {}),
    },
  });

  return {
    correct,
    independentPass,
    quality: correct ? Number((evaluation.confidence || 0.8).toFixed(2)) : 0,
    correctAnswer: word.word,
    word: word.word,
    meaning: word.meaning,
    example: word.example,
    exerciseType: "USAGE",
    stage: "CORE",
    finalChallenge: false,
    wordMastered: false,
    usageEvaluation: evaluation,
    message: independentPass
      ? "Bạn đã tự dùng từ đúng nghĩa trong một câu mới. Checkpoint Usage đã đạt."
      : correct
      ? "Câu đúng nhưng bạn đã dùng gợi ý. Tisi sẽ yêu cầu một câu khác không cần trợ giúp."
      : evaluation.shortFeedback ||
        "Câu chưa chứng minh được khả năng dùng từ. Tisi sẽ cho thử lại sau.",
  };
}
