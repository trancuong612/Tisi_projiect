import { useEffect, useState } from "react";

import { BookOpenText, RotateCcw, Sparkles } from "lucide-react";

import TtsButton from "./TtsButton";

export default function FlashCard({ word, onReveal }) {
  const [flipped, setFlipped] = useState(false);

  /**
   * Khi Review chuyển sang
   * vocabulary tiếp theo,
   * luôn quay lại mặt trước.
   */
  useEffect(() => {
    setFlipped(false);
  }, [word?.id]);

  if (!word) {
    return null;
  }
  function revealCard() {
    setFlipped(true);

    if (onReveal) {
      onReveal();
    }
  }
  return (
    <div
      className="relative mt-4 min-h-[390px] w-full"
      style={{
        perspective: "1200px",
      }}>
      <div
        className="relative min-h-[390px] w-full transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",

          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}>
        {/* FRONT */}
        <div
          className="absolute inset-0 overflow-hidden rounded-[2rem] border border-emerald-100 bg-white shadow-sm"
          style={{
            backfaceVisibility: "hidden",

            pointerEvents: flipped ? "none" : "auto",
          }}>
          <div
            role="button"
            tabIndex={0}
            onClick={revealCard}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();

                revealCard();
              }
            }}
            className="flex min-h-[390px] cursor-pointer flex-col items-center justify-center p-7 text-center outline-none sm:p-10">
            <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-600">
              Recall
            </div>

            <h2 className="mt-8 break-words text-4xl font-black leading-tight text-slate-900 sm:text-5xl">
              {word.word}
            </h2>

            {word.ipa && (
              <div className="mt-4 text-base font-semibold text-slate-400">
                {word.ipa}
              </div>
            )}

            {word.partOfSpeech && (
              <div className="mt-3 rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-500">
                {word.partOfSpeech}
              </div>
            )}

            <div className="mt-7" onClick={(event) => event.stopPropagation()}>
              <TtsButton text={word.word} label="Nghe từ" />
            </div>

            <div className="mt-8 flex items-center gap-2 text-xs font-black text-emerald-600">
              <RotateCcw size={15} />
              Chạm vào thẻ để xem đáp án
            </div>
          </div>
        </div>

        {/* BACK */}
        <div
          className="absolute inset-0 overflow-y-auto rounded-[2rem] border border-indigo-100 bg-indigo-50 shadow-sm"
          style={{
            backfaceVisibility: "hidden",

            transform: "rotateY(180deg)",

            pointerEvents: flipped ? "auto" : "none",
          }}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setFlipped(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();

                setFlipped(false);
              }
            }}
            className="min-h-[390px] cursor-pointer p-6 outline-none sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-500">
                  Answer
                </div>

                <h2 className="mt-2 text-3xl font-black text-slate-900">
                  {word.word}
                </h2>

                {word.ipa && (
                  <div className="mt-1 text-sm font-semibold text-slate-400">
                    {word.ipa}
                  </div>
                )}
              </div>

              <div onClick={(event) => event.stopPropagation()}>
                <TtsButton text={word.word} />
              </div>
            </div>

            {/* MEANING */}
            <div className="mt-7 rounded-2xl bg-white p-5">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-indigo-500">
                <Sparkles size={15} />
                Nghĩa
              </div>

              <div className="mt-2 text-xl font-black leading-8 text-slate-800">
                {word.meaning}
              </div>
            </div>

            {/* EXAMPLE */}
            {word.example && (
              <div className="mt-4 rounded-2xl bg-white p-5">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-emerald-600">
                  <BookOpenText size={15} />
                  Ví dụ
                </div>

                <div className="mt-2 text-base font-semibold leading-7 text-slate-700">
                  {word.example}
                </div>

                <div
                  className="mt-4"
                  onClick={(event) => event.stopPropagation()}>
                  <TtsButton text={word.example} label="Nghe câu" />
                </div>
              </div>
            )}

            {word.note && (
              <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-100/50 p-4 text-sm font-semibold leading-6 text-indigo-800">
                💡 {word.note}
              </div>
            )}

            <div className="mt-5 flex items-center justify-center gap-2 text-xs font-black text-indigo-500">
              <RotateCcw size={14} />
              Chạm để quay lại mặt trước
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
