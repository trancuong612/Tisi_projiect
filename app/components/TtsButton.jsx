import { useEffect, useMemo, useState } from "react";

import { Headphones, Play, Settings2, Volume2, X } from "lucide-react";

import {
  DEFAULT_TTS_SETTINGS,
  TTS_ACCENTS,
  TTS_SETTINGS_EVENT,
  getEnglishVoices,
  getTtsSettings,
  saveTtsSettings,
  speakText,
} from "../utils/tts";

export default function TtsButton({ text, label = null, showSettings = true }) {
  const [settings, setSettings] = useState(DEFAULT_TTS_SETTINGS);

  const [voices, setVoices] = useState([]);

  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    function loadVoices() {
      setVoices(getEnglishVoices());
    }

    function syncSettings(event) {
      /**
       * Nếu event có detail,
       * dùng ngay.
       *
       * Nếu không thì đọc lại
       * localStorage.
       */
      setSettings(event?.detail || getTtsSettings());
    }

    /**
     * Load setting lúc component mount.
     */
    syncSettings();

    /**
     * Load browser voices.
     */
    loadVoices();

    if (typeof window === "undefined") {
      return;
    }

    /**
     * Khi user đổi voice ở
     * một TtsButton bất kỳ,
     * tất cả TtsButton khác
     * update ngay.
     */
    window.addEventListener(TTS_SETTINGS_EVENT, syncSettings);

    if (window.speechSynthesis) {
      window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    }

    return () => {
      window.removeEventListener(TTS_SETTINGS_EVENT, syncSettings);

      if (window.speechSynthesis) {
        window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      }
    };
  }, []);

  const filteredVoices = useMemo(() => {
    if (settings.accent === "auto") {
      return voices;
    }

    const result = voices.filter((voice) =>
      voice.lang?.toLowerCase().startsWith(settings.accent.toLowerCase()),
    );

    /**
     * Nếu browser không có đúng accent,
     * vẫn cho xem English voices.
     */
    return result.length ? result : voices;
  }, [voices, settings.accent]);

  function updateSettings(changes) {
    const next = {
      ...settings,
      ...changes,
    };

    /**
     * Khi đổi accent,
     * reset voice cũ để tránh
     * voice UK nhưng accent US.
     */
    if (Object.prototype.hasOwnProperty.call(changes, "accent")) {
      next.voiceURI = "";
    }

    setSettings(next);
    saveTtsSettings(next);
  }
  function play() {
    /**
     * Luôn đọc setting mới nhất
     * từ localStorage.
     */
    speakText(text);
  }

  function testVoice() {
    speakText("Hello. This is your English learning voice.", settings);
  }

  return (
    <>
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={play}
          disabled={!text}
          title="Nghe phát âm"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40">
          <Volume2 size={18} />

          {label && <span>{label}</span>}
        </button>

        {showSettings && (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Chọn giọng đọc"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <Settings2 size={16} />
          </button>
        )}
      </div>

      {settingsOpen && (
        <VoiceSettingsModal
          settings={settings}
          voices={filteredVoices}
          onChange={updateSettings}
          onTest={testVoice}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}

function VoiceSettingsModal({ settings, voices, onChange, onTest, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-emerald-600">
              <Headphones size={16} />
              Voice Settings
            </div>

            <h2 className="mt-2 text-2xl font-black text-slate-900">
              Chọn giọng đọc
            </h2>

            <p className="mt-1 text-sm font-semibold text-slate-400">
              Lựa chọn này sẽ được dùng chung cho toàn bộ ứng dụng.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <X size={18} />
          </button>
        </div>

        {/* ACCENT */}
        <label className="mt-6 block">
          <span className="text-sm font-black text-slate-700">Accent</span>

          <select
            value={settings.accent}
            onChange={(event) =>
              onChange({
                accent: event.target.value,
              })
            }
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 outline-none focus:border-emerald-400">
            {TTS_ACCENTS.map((accent) => (
              <option key={accent.value} value={accent.value}>
                {accent.label}
              </option>
            ))}
          </select>
        </label>

        {/* VOICE */}
        <label className="mt-5 block">
          <span className="text-sm font-black text-slate-700">Giọng đọc</span>

          <select
            value={settings.voiceURI}
            onChange={(event) =>
              onChange({
                voiceURI: event.target.value,
              })
            }
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 outline-none focus:border-emerald-400">
            <option value="">Tự động chọn giọng tốt nhất</option>

            {voices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name}
                {" · "}
                {voice.lang}
              </option>
            ))}
          </select>

          {!voices.length && (
            <p className="mt-2 text-xs font-semibold text-amber-600">
              Browser chưa trả danh sách voice. Bạn vẫn có thể dùng giọng mặc
              định.
            </p>
          )}
        </label>

        {/* RATE */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-black text-slate-700">Tốc độ</span>

            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
              {Number(settings.rate).toFixed(2)}×
            </span>
          </div>

          <input
            type="range"
            min="0.7"
            max="1.15"
            step="0.05"
            value={settings.rate}
            onChange={(event) =>
              onChange({
                rate: Number(event.target.value),
              })
            }
            className="mt-3 w-full accent-emerald-600"
          />

          <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-300">
            <span>Chậm</span>

            <span>Tự nhiên</span>

            <span>Nhanh</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onTest}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white">
          <Play size={18} />
          Nghe thử giọng này
        </button>
      </div>
    </div>
  );
}
