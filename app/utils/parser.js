const DAY_MAP = {
  monday: "MONDAY", mon: "MONDAY", "thứ 2": "MONDAY", "thu 2": "MONDAY",
  tuesday: "TUESDAY", tue: "TUESDAY", "thứ 3": "TUESDAY", "thu 3": "TUESDAY",
  wednesday: "WEDNESDAY", wed: "WEDNESDAY", "thứ 4": "WEDNESDAY", "thu 4": "WEDNESDAY",
  thursday: "THURSDAY", thu: "THURSDAY", "thứ 5": "THURSDAY", "thu 5": "THURSDAY",
  friday: "FRIDAY", fri: "FRIDAY", "thứ 6": "FRIDAY", "thu 6": "FRIDAY",
  saturday: "SATURDAY", sat: "SATURDAY", "thứ 7": "SATURDAY", "thu 7": "SATURDAY",
  sunday: "SUNDAY", sun: "SUNDAY", "chủ nhật": "SUNDAY", "chu nhat": "SUNDAY",
};

export function normalizeWord(value = "") {
  return value.trim().toLocaleLowerCase("en-US");
}

export function normalizeDay(value = "") {
  const key = value.trim().toLocaleLowerCase("vi-VN");
  return DAY_MAP[key] || value.toUpperCase() || "CUSTOM";
}

export function parseVocabularyText(text) {
  const errors = [];
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items = [];

  rows.forEach((line, index) => {
    const cols = line.split("|").map((x) => x.trim());
    if (cols.length < 4) {
      errors.push(`Dòng ${index + 1}: cần ít nhất 4 cột: từ | IPA | loại từ | nghĩa`);
      return;
    }
    const [word, ipa, partOfSpeech, meaning, example = "", note = ""] = cols;
    if (!word || !meaning) {
      errors.push(`Dòng ${index + 1}: thiếu từ hoặc nghĩa.`);
      return;
    }
    items.push({ word, normalized: normalizeWord(word), ipa: ipa || null, partOfSpeech: partOfSpeech || null, meaning, example: example || null, note: note || null });
  });

  return { items, errors };
}
