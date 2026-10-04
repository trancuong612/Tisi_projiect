import { prisma } from "../utils/db.server";

import { evaluateUsageWithAI } from "./ai-usage-evaluator.server";

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function getLearningEffect(verdict) {
  switch (verdict) {
    case "CORRECT":
      return {
        usageDelta: 0.08,

        rating: 3,

        correct: true,
      };

    case "PARTIAL":
      return {
        /**
         * Hiểu đúng hướng
         * nhưng chưa dùng vững.
         */
        usageDelta: 0.01,

        rating: 2,

        correct: false,
      };

    default:
      return {
        usageDelta: -0.08,

        rating: 1,

        correct: false,
      };
  }
}

export async function evaluateAndRecordUsageAttempt({
  vocabularyId,
  answer,
  responseTime = 0,
}) {
  const cleanAnswer = String(answer || "").trim();

  if (!cleanAnswer) {
    throw new Error("Hãy viết một câu trước.");
  }

  const vocabulary = await prisma.vocabulary.findUnique({
    where: {
      id: vocabularyId,
    },

    include: {
      skill: true,
    },
  });

  if (!vocabulary) {
    throw new Response("Vocabulary not found", {
      status: 404,
    });
  }

  /**
   * Không tốn API cho input
   * rõ ràng chưa phải một câu.
   */
  const wordCount = cleanAnswer.split(/\s+/).filter(Boolean).length;

  if (wordCount < 3) {
    return {
      evaluation: {
        verdict: "INCORRECT",

        targetUsed: false,

        meaningCorrect: false,

        grammarCorrect: false,

        natural: false,

        collocationCorrect: false,

        correctedSentence: "",

        vietnameseExplanation:
          "Câu quá ngắn để đánh giá khả năng sử dụng từ. Hãy viết một câu hoàn chỉnh hơn.",

        shortFeedback: "Hãy viết ít nhất một câu ngắn hoàn chỉnh.",

        confidence: 1,
      },

      recorded: false,
      localValidation: true,
    };
  }

  /**
   * Gemini chỉ CHẤM.
   */
  const evaluation = await evaluateUsageWithAI({
    vocabulary,
    answer: cleanAnswer,
  });

  /**
   * Code của chúng ta mới
   * quyết định learning effect.
   */
  const effect = getLearningEffect(evaluation.verdict);

  const currentUsage = vocabulary.skill?.usage || 0;

  const nextUsage = clamp(currentUsage + effect.usageDelta);

  await prisma.$transaction([
    prisma.skillState.upsert({
      where: {
        vocabularyId,
      },

      update: {
        usage: nextUsage,
      },

      create: {
        vocabularyId,
        usage: nextUsage,
      },
    }),

    prisma.reviewLog.create({
      data: {
        vocabularyId,

        exerciseType: "USAGE",

        answer: cleanAnswer,

        rating: effect.rating,

        correct: effect.correct,

        responseTime: Number(responseTime) || null,

        hintsUsed: 0,
      },
    }),
  ]);

  return {
    evaluation,

    recorded: true,

    localValidation: false,

    usage: {
      before: currentUsage,

      after: nextUsage,

      delta: effect.usageDelta,
    },
  };
}
