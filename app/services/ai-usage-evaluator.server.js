const DEFAULT_MODEL = "gemini-3.5-flash-lite";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

const VALID_VERDICTS = ["CORRECT", "PARTIAL", "INCORRECT"];

function normalizeBoolean(value) {
  return value === true;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function validateEvaluation(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Gemini returned invalid evaluation.");
  }

  const verdict = VALID_VERDICTS.includes(raw.verdict)
    ? raw.verdict
    : "INCORRECT";

  return {
    verdict,

    targetUsed: normalizeBoolean(raw.targetUsed),

    meaningCorrect: normalizeBoolean(raw.meaningCorrect),

    grammarCorrect: normalizeBoolean(raw.grammarCorrect),

    natural: normalizeBoolean(raw.natural),

    collocationCorrect: normalizeBoolean(raw.collocationCorrect),

    correctedSentence: String(raw.correctedSentence || "").trim(),

    vietnameseExplanation: String(raw.vietnameseExplanation || "").trim(),

    shortFeedback: String(raw.shortFeedback || "").trim(),

    confidence: clamp(Number(raw.confidence) || 0, 0, 1),
  };
}

function buildPrompt({ vocabulary, answer }) {
  return `
You are an English vocabulary usage evaluator for a Vietnamese learner.

Your task is NOT to grade general writing.
Evaluate whether the learner can correctly USE the specific target vocabulary in a new English sentence.

TARGET VOCABULARY:
Word or phrase: ${vocabulary.word}
Kind: ${vocabulary.kind || "WORD"}
Part of speech: ${vocabulary.partOfSpeech || "unknown"}
Target Vietnamese meaning: ${vocabulary.meaning}
Reference example: ${vocabulary.example || "none"}
Learning note: ${vocabulary.note || "none"}

LEARNER SENTENCE:
${answer}

EVALUATION RULES:

1. targetUsed
- True if the target word/phrase or a grammatically valid inflected form is actually used.
- Accept normal inflection such as approve/approves/approved or postpone/postponed.
- For phrases/collocations, evaluate the phrase as a unit.

2. meaningCorrect
- The learner must use the SAME MEANING that is being learned.
- A grammatically correct sentence using another sense of the word is NOT meaningCorrect.

Example:
Target: branch = chi nhánh
"The tree has a large branch."
Grammar is correct, but meaningCorrect must be false.

3. grammarCorrect
- Evaluate the whole sentence for important grammar errors.

4. natural
- Decide whether the sentence sounds reasonably natural in normal English.
- Do not penalize harmless stylistic differences.

5. collocationCorrect
- Check whether surrounding words naturally combine with the target.

Example:
"work overtime" = correct.
"make overtime" = incorrect.

6. verdict

CORRECT:
- targetUsed = true
- meaningCorrect = true
- grammar is acceptable
- usage/collocation is natural enough

PARTIAL:
- target meaning is basically correct
- but there is a fixable grammar, form, article, preposition, collocation, or naturalness problem

INCORRECT:
- target is missing
- OR target meaning is wrong
- OR the usage is fundamentally incorrect
- OR the sentence is too broken to demonstrate correct usage

7. correctedSentence
- If CORRECT, return the learner sentence unchanged unless a tiny correction is genuinely necessary.
- If PARTIAL or INCORRECT, provide one natural corrected sentence that preserves the learner's intended idea and correctly uses the target meaning.

8. vietnameseExplanation
- Explain the key problem in concise, easy Vietnamese.
- If correct, explain briefly why the usage is good.
- Focus on the target vocabulary and the most useful correction.
- Do not give a long grammar lecture.

9. shortFeedback
Return one short Vietnamese sentence such as:
"Dùng từ đúng và tự nhiên."
"Đúng nghĩa nhưng cần sửa thì quá khứ."
"Sai collocation: dùng 'work overtime', không dùng 'make overtime'."

10. confidence
Return confidence from 0 to 1.

Be strict but learner-friendly.
Do not invent errors.
`;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",

  properties: {
    verdict: {
      type: "STRING",
      enum: ["CORRECT", "PARTIAL", "INCORRECT"],
    },

    targetUsed: {
      type: "BOOLEAN",
    },

    meaningCorrect: {
      type: "BOOLEAN",
    },

    grammarCorrect: {
      type: "BOOLEAN",
    },

    natural: {
      type: "BOOLEAN",
    },

    collocationCorrect: {
      type: "BOOLEAN",
    },

    correctedSentence: {
      type: "STRING",
    },

    vietnameseExplanation: {
      type: "STRING",
    },

    shortFeedback: {
      type: "STRING",
    },

    confidence: {
      type: "NUMBER",
    },
  },

  required: [
    "verdict",
    "targetUsed",
    "meaningCorrect",
    "grammarCorrect",
    "natural",
    "collocationCorrect",
    "correctedSentence",
    "vietnameseExplanation",
    "shortFeedback",
    "confidence",
  ],
};

async function callGemini({ vocabulary, answer }) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      `${ENDPOINT}/models/${model}:generateContent`,
      {
        method: "POST",

        signal: controller.signal,

        headers: {
          "Content-Type": "application/json",

          "x-goog-api-key": apiKey,
        },

        body: JSON.stringify({
          contents: [
            {
              role: "user",

              parts: [
                {
                  text: buildPrompt({
                    vocabulary,
                    answer,
                  }),
                },
              ],
            },
          ],

          generationConfig: {
            temperature: 0.1,

            maxOutputTokens: 800,

            responseMimeType: "application/json",

            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      const message =
        data?.error?.message || `Gemini API error ${response.status}`;

      throw new Error(message);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Gemini returned no evaluation.");
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Gemini returned invalid JSON.");
    }

    return validateEvaluation(parsed);
  } finally {
    clearTimeout(timeout);
  }
}

export async function evaluateUsageWithAI({ vocabulary, answer }) {
  const cleanAnswer = String(answer || "").trim();

  if (!cleanAnswer) {
    throw new Error("Sentence is empty.");
  }

  return callGemini({
    vocabulary,
    answer: cleanAnswer,
  });
}
