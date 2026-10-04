import { prisma } from "../utils/db.server";
import { calculateWeakProfile } from "./weak-words.server";
import { getAdaptiveRecommendation } from "./adaptive-recommendation.server";
const PRACTICE_SKILLS = ["meaningRecall", "spelling", "listening", "usage"];

const EXERCISE_SKILL_WEIGHTS = {
  REVERSE_RECALL: {
    meaningRecall: 1,
    spelling: 0.55,
  },

  CLOZE: {
    meaningRecall: 0.7,
    usage: 1,
    spelling: 0.25,
  },

  DICTATION: {
    listening: 1,
    spelling: 0.85,
  },
};

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function normalizeText(value = "") {
  return value
    .toLocaleLowerCase("en-US")
    .trim()
    .replace(/[“”"'`]/g, "")
    .replace(/[.!?,;:]/g, "")
    .replace(/\s+/g, " ");
}

export function createCloze(example, baseWord) {
  if (!example || !baseWord) return null;

  const escaped = baseWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const regex = new RegExp(`\\b(${escaped}(?:s|es|ed|ing)?)\\b`, "i");

  const match = example.match(regex);

  if (!match) return null;

  return {
    prompt: example.replace(regex, "________"),
    expectedAnswer: match[1],
  };
}

function getSkillValues(skill) {
  return {
    meaningRecall: skill?.meaningRecall ?? 0,
    spelling: skill?.spelling ?? 0,
    listening: skill?.listening ?? 0,
    usage: skill?.usage ?? 0,
  };
}

export function calculateWeakness(skill) {
  const values = getSkillValues(skill);

  const deficits = PRACTICE_SKILLS.map((skillName) => 1 - values[skillName]);

  return deficits.reduce((total, value) => total + value, 0) / deficits.length;
}

function calculateWrongRate(reviews = []) {
  if (!reviews.length) return 0;

  const wrong = reviews.filter((review) => !review.correct).length;

  return wrong / reviews.length;
}

/**
 * Micro-spacing trong một session.
 *
 * Sai:
 * < 2 phút: chưa hỏi lại ngay
 * 2-10 phút: ưu tiên rất cao
 * 10-60 phút: ưu tiên vừa
 *
 * Đúng:
 * tránh hỏi lại ngay.
 */
function calculateSpacingAdjustment(reviews = []) {
  if (!reviews.length) return 0;

  const last = reviews[0];

  const ageMs = Date.now() - new Date(last.reviewedAt).getTime();

  const minute = 60 * 1000;

  if (!last.correct) {
    if (ageMs < minute * 2) {
      return -0.85;
    }

    if (ageMs < minute * 10) {
      return 0.75;
    }

    if (ageMs < minute * 60) {
      return 0.4;
    }

    return 0.18;
  }

  if (ageMs < minute * 2) {
    return -0.75;
  }

  if (ageMs < minute * 5) {
    return -0.25;
  }

  return 0;
}

function calculatePriority(word) {
  const weakness = calculateWeakness(word.skill);

  const wrongRate = calculateWrongRate(word.reviews);

  const spacingAdjustment = calculateSpacingAdjustment(word.reviews);

  const weakProfile = calculateWeakProfile(word);

  let dueBoost = 0;

  if (word.memory?.due && new Date(word.memory.due) <= new Date()) {
    dueBoost = 0.15;
  }

  const importanceBoost = Math.max(0, (word.importance ?? 1) - 1) * 0.05;

  const recentReviews = (word.reviews || []).slice(0, 4);

  const recentFailures =
    recentReviews.filter((review) => !review.correct).length /
    Math.max(1, recentReviews.length);

  let weakStatusBoost = 0;

  if (weakProfile.status === "RELEARNING") {
    weakStatusBoost = 0.35;
  } else if (weakProfile.status === "WEAK") {
    weakStatusBoost = 0.18;
  }

  return (
    weakness * 0.5 +
    wrongRate * 0.2 +
    recentFailures * 0.15 +
    dueBoost +
    importanceBoost +
    spacingAdjustment +
    weakStatusBoost
  );
}

function getWeakestSkill(skill) {
  const values = getSkillValues(skill);

  return Object.entries(values).sort((a, b) => a[1] - b[1])[0][0];
}

function getAvailableExercises(word) {
  const result = ["REVERSE_RECALL", "DICTATION"];

  const cloze = createCloze(word.example, word.word);

  if (cloze) {
    result.push("CLOZE");
  }

  return {
    exercises: result,
    cloze,
  };
}

function selectExercise(word, recommendation) {
  const weakestSkill = getWeakestSkill(word.skill);

  const { exercises, cloze } = getAvailableExercises(word);

  const skillValues = getSkillValues(word.skill);

  /**
   * 2 exercise gần nhất.
   * Dùng để giữ interleaving.
   */
  const recentTypes = (word.reviews || [])
    .slice(0, 2)
    .map((review) => review.exerciseType);

  /**
   * Chấm điểm từng dạng bài.
   *
   * LOCAL:
   * từ này đang yếu skill nào?
   *
   * GLOBAL:
   * toàn bộ người học đang yếu skill nào?
   */
  const scoredExercises = exercises.map((exerciseType) => {
    const weights = EXERCISE_SKILL_WEIGHTS[exerciseType] || {};

    let localScore = 0;
    let totalWeight = 0;

    for (const [skillName, weight] of Object.entries(weights)) {
      const mastery = Number(skillValues[skillName] || 0);

      const weakness = 1 - mastery;

      localScore += weakness * weight;

      totalWeight += weight;
    }

    /**
     * Chuẩn hóa local weakness
     * về khoảng 0 → 1.
     */
    if (totalWeight > 0) {
      localScore = localScore / totalWeight;
    }

    /**
     * Phase 5C:
     * Global skill recommendation.
     *
     * Ví dụ:
     * CLOZE = 1.55
     * DICTATION = 1.62
     */
    const globalBoost = recommendation?.exerciseBoost?.[exerciseType] || 1;

    /**
     * Không cấm exercise vừa xuất hiện,
     * chỉ giảm xác suất.
     *
     * Nhờ vậy vẫn giữ interleaving.
     */
    const interleaveFactor =
      recentTypes.includes(exerciseType) && exercises.length > 1 ? 0.55 : 1;

    const score = Math.max(0.05, localScore * globalBoost * interleaveFactor);

    return {
      type: exerciseType,
      score,
    };
  });

  /**
   * Weighted random.
   *
   * Exercise score cao hơn
   * có xác suất xuất hiện cao hơn,
   * nhưng không khóa tuyệt đối.
   */
  const totalScore = scoredExercises.reduce((sum, item) => sum + item.score, 0);

  let random = Math.random() * totalScore;

  let type = scoredExercises[0]?.type || exercises[0];

  for (const item of scoredExercises) {
    random -= item.score;

    if (random <= 0) {
      type = item.type;
      break;
    }
  }

  return {
    type,
    weakestSkill,
    cloze,
  };
}

function weightedPick(words) {
  if (!words.length) return null;

  const prepared = words.map((word) => ({
    word,

    score: Math.max(0.05, calculatePriority(word) + 0.15),
  }));

  const total = prepared.reduce((sum, item) => sum + item.score, 0);

  let random = Math.random() * total;

  for (const item of prepared) {
    random -= item.score;

    if (random <= 0) {
      return item.word;
    }
  }

  return prepared[0].word;
}

export async function getAdaptiveExercise() {
  const [words, recommendation] = await Promise.all([
    prisma.vocabulary.findMany({
      include: {
        skill: true,
        memory: true,

        reviews: {
          orderBy: {
            reviewedAt: "desc",
          },

          take: 20,
        },
      },

      orderBy: {
        createdAt: "desc",
      },

      take: 150,
    }),

    /**
     * Phase 5C
     *
     * Chỉ query recommendation
     * một lần cho request này.
     */
    getAdaptiveRecommendation(),
  ]);

  if (!words.length) {
    return null;
  }

  const ranked = words
    .map((word) => ({
      ...word,

      _priority: calculatePriority(word),
    }))
    .sort((a, b) => b._priority - a._priority);

  /**
   * Random có trọng số trong
   * nhóm ưu tiên cao.
   */
  const candidatePool = ranked.slice(0, Math.min(15, ranked.length));

  const word = weightedPick(candidatePool);

  if (!word) {
    return null;
  }

  const selection = selectExercise(word, recommendation);

  let prompt = "";
  let expectedAnswer = word.word;

  if (selection.type === "REVERSE_RECALL") {
    prompt = word.meaning;
  }

  if (selection.type === "DICTATION") {
    prompt = "Nghe từ rồi gõ lại";
  }

  if (selection.type === "CLOZE") {
    prompt = selection.cloze.prompt;

    expectedAnswer = selection.cloze.expectedAnswer;
  }

  const weakProfile = calculateWeakProfile(word);

  return {
    id: word.id,

    word: word.word,
    ipa: word.ipa,
    meaning: word.meaning,
    example: word.example,
    note: word.note,

    type: selection.type,

    weakestSkill: selection.weakestSkill,

    learningStatus: weakProfile.status,

    weakScore: Number(weakProfile.score.toFixed(3)),

    prompt,
    expectedAnswer,

    priority: Number(calculatePriority(word).toFixed(3)),

    adaptiveRecommendation: {
      primaryFocus: recommendation?.primaryFocus?.key || null,

      primaryFocusLabel: recommendation?.primaryFocus?.label || null,

      exerciseBoost: recommendation?.exerciseBoost || null,
    },
  };
}

function calculateRecallQuality({ responseTime, hintsUsed }) {
  const seconds = Math.max(0, responseTime) / 1000;

  let speedFactor = 1;

  if (seconds <= 4) {
    speedFactor = 1;
  } else if (seconds <= 8) {
    speedFactor = 0.88;
  } else if (seconds <= 15) {
    speedFactor = 0.72;
  } else if (seconds <= 30) {
    speedFactor = 0.58;
  } else {
    speedFactor = 0.48;
  }

  const hintFactor = Math.max(0.4, 1 - hintsUsed * 0.18);

  return clamp(speedFactor * hintFactor, 0.35, 1);
}

function updateSkillValue({ current, correct, quality, weight }) {
  if (!weight) return current;

  if (correct) {
    const learningGain = (1 - current) * 0.12 * quality * weight;

    return clamp(current + learningGain);
  }

  const forgettingLoss = Math.max(0.055, current * 0.13) * weight;

  return clamp(current - forgettingLoss);
}

export async function gradeAdaptiveAnswer({
  vocabularyId,
  exerciseType,
  answer,
  expectedAnswer,
  responseTime,
  hintsUsed,
}) {
  const word = await prisma.vocabulary.findUnique({
    where: {
      id: vocabularyId,
    },

    include: {
      skill: true,
    },
  });

  if (!word) {
    throw new Response("Vocabulary not found", {
      status: 404,
    });
  }

  const normalizedAnswer = normalizeText(answer);

  const normalizedExpected = normalizeText(expectedAnswer || word.word);

  const correct = normalizedAnswer === normalizedExpected;

  const quality = correct
    ? calculateRecallQuality({
        responseTime,
        hintsUsed,
      })
    : 0;

  const current = getSkillValues(word.skill);

  const weights = EXERCISE_SKILL_WEIGHTS[exerciseType] || {};

  const skillUpdates = {};

  for (const skillName of PRACTICE_SKILLS) {
    if (!weights[skillName]) {
      continue;
    }

    skillUpdates[skillName] = updateSkillValue({
      current: current[skillName],

      correct,
      quality,

      weight: weights[skillName],
    });
  }

  await prisma.$transaction([
    prisma.skillState.upsert({
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
    }),

    prisma.reviewLog.create({
      data: {
        vocabularyId,
        exerciseType,
        answer,
        correct,
        responseTime,
        hintsUsed,
      },
    }),
  ]);

  return {
    correct,

    quality: Number(quality.toFixed(2)),

    correctAnswer: expectedAnswer || word.word,

    word: word.word,
    meaning: word.meaning,
    example: word.example,

    skillUpdates,
  };
}
