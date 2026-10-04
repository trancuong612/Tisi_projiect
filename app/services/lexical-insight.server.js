import { prisma } from "../utils/db.server";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";

const RESPONSE_SCHEMA = {
  type: "OBJECT",

  properties: {
    collocations: {
      type: "ARRAY",

      items: {
        type: "OBJECT",

        properties: {
          phrase: {
            type: "STRING",
          },

          meaning: {
            type: "STRING",
          },

          example: {
            type: "STRING",
          },
        },

        required: ["phrase", "meaning", "example"],
      },
    },

    chunks: {
      type: "ARRAY",

      items: {
        type: "OBJECT",

        properties: {
          phrase: {
            type: "STRING",
          },

          meaning: {
            type: "STRING",
          },

          example: {
            type: "STRING",
          },
        },

        required: ["phrase", "meaning", "example"],
      },
    },

    confusions: {
      type: "ARRAY",

      items: {
        type: "OBJECT",

        properties: {
          word: {
            type: "STRING",
          },

          meaning: {
            type: "STRING",
          },

          difference: {
            type: "STRING",
          },

          targetExample: {
            type: "STRING",
          },

          otherExample: {
            type: "STRING",
          },
        },

        required: [
          "word",
          "meaning",
          "difference",
          "targetExample",
          "otherExample",
        ],
      },
    },
  },

  required: ["collocations", "chunks", "confusions"],
};

function buildPrompt(vocabulary) {
  return `
You are designing lexical learning material for a Vietnamese English learner.

TARGET VOCABULARY

Word or phrase:
${vocabulary.word}

Vietnamese meaning being learned:
${vocabulary.meaning}

Part of speech:
${vocabulary.partOfSpeech || "unknown"}

Vocabulary type:
${vocabulary.kind}

Reference example:
${vocabulary.example || "none"}

Learning note:
${vocabulary.note || "none"}

Generate useful lexical connections for THIS SPECIFIC MEANING.

COLLOCATIONS

Return 3 to 5 common natural collocations involving the target.

Example:
overtime
→ work overtime
→ overtime pay

Do not invent unusual combinations.

CHUNKS

Return 2 to 4 useful chunks or sentence patterns that a learner can reuse directly in real communication.

Example:
submit
→ submit a report to...
→ submit something by Friday

Chunks should be practical rather than dictionary-like.

CONFUSIONS

Return up to 3 words or expressions that Vietnamese learners could realistically confuse with the target.

Only include genuinely useful confusions.

Examples:
invoice vs receipt
job vs work
say vs tell
approve vs accept

If there is no useful confusion, return an empty array.

IMPORTANT:

- Use the target meaning provided above.
- Do not change to another sense of the word.
- English examples must sound natural.
- Vietnamese explanations must be concise and practical.
- Avoid obscure academic vocabulary.
- Prefer everyday/workplace English when relevant.
`;
}

function validateArray(value) {
  return Array.isArray(value) ? value : [];
}

async function askGemini(vocabulary) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const response = await fetch(`${ENDPOINT}/models/${model}:generateContent`, {
    method: "POST",

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
              text: buildPrompt(vocabulary),
            },
          ],
        },
      ],

      generationConfig: {
        temperature: 0.2,

        maxOutputTokens: 1600,

        responseMimeType: "application/json",

        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Gemini lexical insight failed.");
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned empty lexical insight.");
  }

  const parsed = JSON.parse(text);

  return {
    collocations: validateArray(parsed.collocations),

    chunks: validateArray(parsed.chunks),

    confusions: validateArray(parsed.confusions),
  };
}

export async function generateVocabularyInsight(
  vocabularyId,
  { force = false } = {},
) {
  const vocabulary = await prisma.vocabulary.findUnique({
    where: {
      id: vocabularyId,
    },

    include: {
      insight: true,
    },
  });

  if (!vocabulary) {
    throw new Response("Vocabulary not found", {
      status: 404,
    });
  }

  /**
   * Có rồi thì dùng lại.
   * Không gọi Gemini lần nữa.
   */
  if (vocabulary.insight && !force) {
    return vocabulary.insight;
  }

  const generated = await askGemini(vocabulary);

  return prisma.vocabularyInsight.upsert({
    where: {
      vocabularyId,
    },

    update: {
      collocations: generated.collocations,

      chunks: generated.chunks,

      confusions: generated.confusions,

      generatedAt: new Date(),
    },

    create: {
      vocabularyId,

      collocations: generated.collocations,

      chunks: generated.chunks,

      confusions: generated.confusions,
    },
  });
}
