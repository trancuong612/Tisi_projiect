const STORAGE_KEY = "bright-english-tts-settings-v1";

export const TTS_SETTINGS_EVENT = "bright-english-tts-settings-changed";
export const DEFAULT_TTS_SETTINGS = {
  accent: "en-US",
  voiceURI: "",
  rate: 0.9,
  pitch: 1,
};

export const TTS_ACCENTS = [
  {
    value: "auto",
    label: "Tự động",
  },
  {
    value: "en-US",
    label: "🇺🇸 English (US)",
  },
  {
    value: "en-GB",
    label: "🇬🇧 English (UK)",
  },
  {
    value: "en-AU",
    label: "🇦🇺 English (Australia)",
  },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getTtsSettings() {
  if (typeof window === "undefined") {
    return DEFAULT_TTS_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return DEFAULT_TTS_SETTINGS;
    }

    const saved = JSON.parse(raw);

    return {
      ...DEFAULT_TTS_SETTINGS,
      ...saved,
    };
  } catch {
    return DEFAULT_TTS_SETTINGS;
  }
}
export function saveTtsSettings(settings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

  /**
   * storage event không tự chạy
   * trong cùng một browser tab.
   *
   * Vì vậy tự phát custom event
   * để mọi TtsButton đồng bộ ngay.
   */
  window.dispatchEvent(
    new CustomEvent(TTS_SETTINGS_EVENT, {
      detail: settings,
    }),
  );
}

export function getEnglishVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return [];
  }

  return window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang?.toLowerCase().startsWith("en"));
}

export function chooseVoice({ voices, settings }) {
  if (!voices.length) {
    return null;
  }

  /**
   * 1. Voice người dùng
   * đã chọn chính xác.
   */
  if (settings.voiceURI) {
    const selected = voices.find(
      (voice) => voice.voiceURI === settings.voiceURI,
    );

    if (selected) {
      return selected;
    }
  }

  /**
   * 2. Voice theo accent.
   */
  if (settings.accent && settings.accent !== "auto") {
    const exact = voices.find(
      (voice) => voice.lang?.toLowerCase() === settings.accent.toLowerCase(),
    );

    if (exact) {
      return exact;
    }

    const approximate = voices.find((voice) =>
      voice.lang
        ?.toLowerCase()
        .startsWith(settings.accent.toLowerCase().split("-")[0]),
    );

    if (approximate) {
      return approximate;
    }
  }

  /**
   * 3. Ưu tiên US nếu Auto.
   */
  const usVoice = voices.find((voice) =>
    voice.lang?.toLowerCase().startsWith("en-us"),
  );

  if (usVoice) {
    return usVoice;
  }

  /**
   * 4. English voice bất kỳ.
   */
  return voices[0];
}

export function speakText(text, overrides = {}) {
  if (
    !text ||
    typeof window === "undefined" ||
    !window.speechSynthesis ||
    typeof SpeechSynthesisUtterance === "undefined"
  ) {
    return false;
  }

  const settings = {
    ...getTtsSettings(),
    ...overrides,
  };

  const voices = getEnglishVoices();

  const voice = chooseVoice({
    voices,
    settings,
  });

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  if (voice) {
    utterance.voice = voice;

    utterance.lang = voice.lang;
  } else {
    utterance.lang = settings.accent === "auto" ? "en-US" : settings.accent;
  }

  utterance.rate = clamp(Number(settings.rate) || 0.9, 0.5, 1.5);

  utterance.pitch = clamp(Number(settings.pitch) || 1, 0.5, 1.5);

  window.speechSynthesis.speak(utterance);

  return true;
}
