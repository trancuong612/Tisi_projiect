function escapeRegex(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getWordRegex(word) {
  if (!word) {
    return null;
  }

  const escaped = escapeRegex(word);

  return new RegExp(`\\b(${escaped}(?:s|es|ed|ing)?)\\b`, "i");
}

function splitSentences(content = "") {
  return (
    content
      .match(/[^.!?\n]+[.!?]?/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) || []
  );
}

/**
 * Tạo Cloze Questions từ chính
 * nội dung bài đọc.
 */
export function buildReadingTestQuestions({ content, vocabulary }) {
  if (!content || !Array.isArray(vocabulary)) {
    return [];
  }

  const sentences = splitSentences(content);

  const questions = [];

  for (const word of vocabulary) {
    const regex = getWordRegex(word.word);

    if (!regex) {
      continue;
    }

    let matchedQuestion = null;

    for (const sentence of sentences) {
      const match = sentence.match(regex);

      if (!match) {
        continue;
      }

      const surface = match[1];

      matchedQuestion = {
        vocabularyId: word.id,

        word: word.word,

        meaning: word.meaning,

        ipa: word.ipa,

        partOfSpeech: word.partOfSpeech,

        /**
         * Câu gốc để Listening Mode phát âm.
         */
        sentence,

        prompt: sentence.replace(regex, "________"),

        expectedAnswer: surface,
      };

      break;
    }

    if (matchedQuestion) {
      questions.push(matchedQuestion);
    }
  }

  return questions;
}
