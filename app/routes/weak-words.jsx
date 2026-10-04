import { json } from "@remix-run/node";

import { Link, useLoaderData } from "@remix-run/react";

import { useState } from "react";

import { Brain, RotateCcw, Dumbbell, ArrowRight } from "lucide-react";

import DesktopHeader from "../components/DesktopHeader";

import { getWeakWords, getWeakWordStats } from "../services/weak-words.server";

export async function loader() {
  const [words, stats] = await Promise.all([
    getWeakWords({
      limit: 100,
    }),

    getWeakWordStats(),
  ]);

  return json({
    words,
    stats,
  });
}

function getSkillName(skill) {
  switch (skill) {
    case "meaningRecall":
      return "Nhớ nghĩa";

    case "spelling":
      return "Chính tả";

    case "listening":
      return "Nghe";

    case "usage":
      return "Sử dụng";

    default:
      return skill;
  }
}

function getStatusInfo(status) {
  if (status === "RELEARNING") {
    return {
      label: "ĐANG HỌC LẠI",

      className: "bg-rose-100 text-rose-700",
    };
  }

  return {
    label: "TỪ YẾU",

    className: "bg-amber-100 text-amber-800",
  };
}

export default function WeakWords() {
  const { words, stats } = useLoaderData();

  const [filter, setFilter] = useState("ALL");

  const filteredWords =
    filter === "ALL"
      ? words
      : words.filter((word) => word.weakProfile.status === filter);

  return (
    <>
      <DesktopHeader />

      <main className="page-shell max-w-3xl pb-28">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-emerald-700">
            Learning Engine
          </p>

          <h1 className="mt-1 text-3xl font-black text-slate-900">
            Từ cần củng cố 🧠
          </h1>

          <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-500">
            Những từ hệ thống nhận thấy bạn đang nhớ chưa ổn định hoặc đã từng
            nhớ nhưng gần đây bắt đầu quên.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="soft-card rounded-3xl p-4">
            <div className="flex items-center gap-2">
              <Brain size={18} className="text-amber-600" />

              <div className="text-2xl font-black">{stats.weak}</div>
            </div>

            <div className="mt-2 text-xs font-bold text-slate-500">Từ yếu</div>
          </div>

          <div className="soft-card rounded-3xl p-4">
            <div className="flex items-center gap-2">
              <RotateCcw size={18} className="text-rose-600" />

              <div className="text-2xl font-black text-rose-600">
                {stats.relearning}
              </div>
            </div>

            <div className="mt-2 text-xs font-bold text-slate-500">
              Đang học lại
            </div>
          </div>

          <div className="soft-card rounded-3xl p-4">
            <div className="flex items-center gap-2">
              <Dumbbell size={18} className="text-emerald-600" />

              <div className="text-2xl font-black text-emerald-600">
                {stats.strong}
              </div>
            </div>

            <div className="mt-2 text-xs font-bold text-slate-500">Từ mạnh</div>
          </div>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {[
            {
              key: "ALL",
              label: "Tất cả",
            },

            {
              key: "WEAK",
              label: "Từ yếu",
            },

            {
              key: "RELEARNING",
              label: "Đang học lại",
            },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={[
                "whitespace-nowrap rounded-full px-4 py-2 text-sm font-black transition",
                filter === item.key
                  ? "bg-emerald-600 text-white"
                  : "border border-slate-200 bg-white text-slate-500",
              ].join(" ")}>
              {item.label}
            </button>
          ))}
        </div>

        {filteredWords.length === 0 ? (
          <div className="soft-card mt-6 rounded-[2rem] p-8 text-center">
            <div className="text-4xl">🌱</div>

            <h2 className="mt-3 text-xl font-black">
              Chưa có từ trong nhóm này
            </h2>

            <p className="mt-2 text-sm font-semibold text-slate-500">
              Tiếp tục luyện để Learning Engine có thêm dữ liệu đánh giá.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {filteredWords.map((word) => {
              const profile = word.weakProfile;

              const status = getStatusInfo(profile.status);

              return (
                <div key={word.id} className="soft-card rounded-3xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-black text-slate-900">
                          {word.word}
                        </h2>

                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black ${status.className}`}>
                          {status.label}
                        </span>
                      </div>

                      {word.ipa && (
                        <div className="mt-1 text-sm font-semibold text-slate-400">
                          {word.ipa}
                        </div>
                      )}

                      <div className="mt-2 font-bold text-slate-700">
                        {word.meaning}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-lg font-black text-amber-600">
                        {Math.round(profile.score * 100)}
                      </div>

                      <div className="text-[10px] font-bold uppercase text-slate-400">
                        Weak
                      </div>
                    </div>
                  </div>

                  {profile.status === "RELEARNING" && (
                    <div className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-semibold leading-6 text-rose-700">
                      Từ này từng được nhớ tốt hơn nhưng gần đây bạn đang trả
                      lời sai nhiều. Hệ thống sẽ tăng ưu tiên luyện lại.
                    </div>
                  )}

                  {profile.status === "WEAK" && (
                    <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-800">
                      Trí nhớ với từ này chưa ổn định. Hệ thống sẽ ưu tiên kỹ
                      năng yếu nhất.
                    </div>
                  )}

                  <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                    <div className="text-xs font-bold text-slate-400">
                      Cần luyện nhất
                    </div>

                    <div className="mt-1 font-black text-slate-700">
                      {getSkillName(profile.weakestSkill)}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-2xl bg-rose-50 p-3">
                      <div className="font-black text-rose-600">
                        {Math.round(profile.wrongRate * 100)}%
                      </div>

                      <div className="mt-1 text-[10px] font-bold text-slate-500">
                        Sai
                      </div>
                    </div>

                    <div className="rounded-2xl bg-amber-50 p-3">
                      <div className="font-black text-amber-700">
                        {Math.round(profile.hintRate * 100)}%
                      </div>

                      <div className="mt-1 text-[10px] font-bold text-slate-500">
                        Hint
                      </div>
                    </div>

                    <div className="rounded-2xl bg-blue-50 p-3">
                      <div className="font-black text-blue-700">
                        {Math.round(profile.mastery * 100)}%
                      </div>

                      <div className="mt-1 text-[10px] font-bold text-slate-500">
                        Mastery
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Link
          to="/practice"
          className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white">
          Luyện ngay
          <ArrowRight size={18} />
        </Link>
      </main>
    </>
  );
}
