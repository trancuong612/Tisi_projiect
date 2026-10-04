import { json } from "@remix-run/node";

import { Link, useLoaderData } from "@remix-run/react";

import {
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock3,
  Lightbulb,
  Sparkles,
  Target,
  Trophy,
  TriangleAlert,
  Zap,
} from "lucide-react";

import DesktopHeader from "../components/DesktopHeader";

import {
  getDailySummary,
  getVietnamDateKey,
} from "../services/daily-summary.server";

export async function loader({ request }) {
  const url = new URL(request.url);

  const dateKey = url.searchParams.get("date") || getVietnamDateKey();

  return json({
    summary: await getDailySummary({
      dateKey,
    }),
  });
}

function getExerciseIcon(type) {
  switch (type) {
    case "DICTATION":
    case "LISTENING":
      return "🎧";

    case "CLOZE":
      return "🧩";

    case "REVERSE_RECALL":
      return "🧠";

    case "SPELLING":
      return "✍️";

    default:
      return "🌱";
  }
}

export default function Summary() {
  const { summary } = useLoaderData();

  if (!summary) {
    return (
      <>
        <DesktopHeader />

        <main className="page-shell max-w-3xl pb-28">
          <div className="soft-card rounded-[2rem] p-8 text-center">
            <Sparkles size={42} className="mx-auto text-emerald-400" />

            <h1 className="mt-4 text-2xl font-black text-slate-900">
              Chưa có buổi học hôm nay
            </h1>

            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              Bắt đầu Daily Session trước để hệ thống có dữ liệu tổng kết.
            </p>

            <Link
              to="/"
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white">
              Về Hôm nay
              <ArrowRight size={18} />
            </Link>
          </div>
        </main>
      </>
    );
  }

  const { overview, progress, exercises, hardestWords, strongestWords, focus } =
    summary;

  return (
    <>
      <DesktopHeader />

      <main className="page-shell max-w-3xl pb-28">
        {/* BACK */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-black text-emerald-700">
          <ArrowLeft size={17} />
          Hôm nay
        </Link>

        {/* HERO */}
        <section className="mt-4 overflow-hidden rounded-[2rem] bg-slate-900 p-6 text-white sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
            Daily Summary
          </p>

          <h1 className="mt-2 text-3xl font-black">
            Hôm nay bạn đã học như thế nào?
          </h1>

          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <div className="text-5xl font-black">{progress.percent}%</div>

              <div className="mt-2 text-sm font-semibold text-slate-300">
                lộ trình đã hoàn thành
              </div>
            </div>

            <div className="text-right">
              <div className="font-black">
                {progress.completed}/{progress.total}
              </div>

              <div className="text-xs text-slate-400">mục học</div>
            </div>
          </div>

          <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-400"
              style={{
                width: `${progress.percent}%`,
              }}
            />
          </div>
        </section>

        {/* CORE METRICS */}
        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            icon={Target}
            value={`${overview.accuracy}%`}
            label="Chính xác"
          />

          <Metric
            icon={Brain}
            value={`${overview.noHintRate}%`}
            label="Không cần hint"
          />

          <Metric
            icon={Clock3}
            value={
              overview.averageResponseSeconds === null
                ? "—"
                : `${overview.averageResponseSeconds}s`
            }
            label="Phản hồi TB"
          />

          <Metric icon={Zap} value={overview.totalReviews} label="Lượt luyện" />
        </section>

        {/* SESSION FACTS */}
        <section className="soft-card mt-5 rounded-[2rem] p-5">
          <h2 className="font-black text-slate-900">Buổi học hôm nay</h2>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniStat value={overview.uniqueWords} label="Từ đã luyện" />

            <MiniStat value={overview.correct} label="Lần trả lời đúng" />

            <MiniStat value={`${overview.hintRate}%`} label="Có dùng hint" />

            <MiniStat
              value={
                overview.readingsTotal
                  ? `${overview.readingsCompleted}/${overview.readingsTotal}`
                  : "—"
              }
              label="Bài đọc"
            />
          </div>
        </section>

        {/* EXERCISE PERFORMANCE */}
        {exercises.length > 0 && (
          <section className="mt-7">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-600">
              Retrieval
            </p>

            <h2 className="mt-1 text-2xl font-black text-slate-900">
              Hiệu suất theo dạng bài
            </h2>

            <div className="mt-4 space-y-3">
              {exercises.map((exercise) => (
                <div key={exercise.type} className="soft-card rounded-3xl p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">
                        {getExerciseIcon(exercise.type)}
                      </div>

                      <div>
                        <div className="font-black text-slate-800">
                          {exercise.label}
                        </div>

                        <div className="mt-1 text-xs font-semibold text-slate-400">
                          {exercise.total} lượt
                        </div>
                      </div>
                    </div>

                    <div className="text-xl font-black text-emerald-700">
                      {exercise.accuracy}%
                    </div>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{
                        width: `${exercise.accuracy}%`,
                      }}
                    />
                  </div>

                  <div className="mt-3 flex gap-4 text-xs font-bold text-slate-400">
                    <span>Hint {exercise.hintRate}%</span>

                    {exercise.averageResponseSeconds !== null && (
                      <span>TB {exercise.averageResponseSeconds}s</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* HARD WORDS */}
        <section className="mt-7">
          <div className="flex items-center gap-2">
            <TriangleAlert size={20} className="text-amber-600" />

            <h2 className="text-xl font-black text-slate-900">Từ cần chú ý</h2>
          </div>

          {hardestWords.length ? (
            <div className="mt-4 space-y-3">
              {hardestWords.map((word) => (
                <div
                  key={word.id}
                  className="rounded-3xl border border-amber-100 bg-amber-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-black text-slate-900">
                        {word.word}
                      </div>

                      <div className="mt-1 text-sm font-semibold text-slate-500">
                        {word.meaning}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-black text-amber-700">
                        {word.accuracy}%
                      </div>

                      <div className="text-[10px] font-bold text-slate-400">
                        chính xác
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                    {word.wrong > 0 && (
                      <span className="rounded-full bg-white px-3 py-1 text-rose-600">
                        Sai {word.wrong} lần
                      </span>
                    )}

                    {word.hints > 0 && (
                      <span className="rounded-full bg-white px-3 py-1 text-amber-700">
                        Hint {word.hints} lần
                      </span>
                    )}

                    {word.averageResponseSeconds !== null && (
                      <span className="rounded-full bg-white px-3 py-1 text-slate-500">
                        {word.averageResponseSeconds}s TB
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-3xl bg-emerald-50 p-5 text-sm font-bold text-emerald-700">
              Chưa có từ nào nổi bật là khó trong buổi học này.
            </div>
          )}
        </section>

        {/* STRONG WORDS */}
        {strongestWords.length > 0 && (
          <section className="mt-7">
            <div className="flex items-center gap-2">
              <Trophy size={20} className="text-emerald-600" />

              <h2 className="text-xl font-black text-slate-900">
                Recall tốt hôm nay
              </h2>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {strongestWords.map((word) => (
                <div
                  key={word.id}
                  className="rounded-2xl bg-emerald-50 px-4 py-3">
                  <div className="font-black text-emerald-800">{word.word}</div>

                  {word.averageResponseSeconds !== null && (
                    <div className="mt-1 text-[10px] font-bold text-emerald-600">
                      {word.averageResponseSeconds}s · không hint
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* NEXT FOCUS */}
        <section className="mt-7 overflow-hidden rounded-[2rem] bg-violet-50 p-6">
          <div className="flex items-center gap-2 text-violet-700">
            <Lightbulb size={21} />

            <span className="text-xs font-black uppercase tracking-[0.15em]">
              Hệ thống ghi nhận
            </span>
          </div>

          <h2 className="mt-3 text-2xl font-black text-slate-900">
            Trọng tâm tiếp theo: {focus.skillLabel}
          </h2>

          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
            {focus.message}
          </p>

          {(focus.weak > 0 || focus.relearning > 0) && (
            <div className="mt-5 flex gap-3">
              <div className="rounded-2xl bg-white px-4 py-3">
                <div className="text-xl font-black text-amber-600">
                  {focus.weak}
                </div>

                <div className="text-[10px] font-bold text-slate-400">
                  từ yếu
                </div>
              </div>

              <div className="rounded-2xl bg-white px-4 py-3">
                <div className="text-xl font-black text-rose-600">
                  {focus.relearning}
                </div>

                <div className="text-[10px] font-bold text-slate-400">
                  học lại
                </div>
              </div>
            </div>
          )}
        </section>

        {/* FINISH */}
        <div className="mt-7">
          {progress.completedAll ? (
            <div className="rounded-[2rem] bg-emerald-600 p-6 text-center text-white">
              <CheckCircle2 size={38} className="mx-auto" />

              <h2 className="mt-3 text-2xl font-black">
                Hoàn thành hôm nay 🎉
              </h2>

              <p className="mt-2 text-sm font-semibold text-emerald-100">
                Daily Learning Engine sẽ tiếp tục điều chỉnh từ dữ liệu bạn vừa
                tạo.
              </p>
            </div>
          ) : (
            <Link
              to="/"
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white">
              Tiếp tục lộ trình
              <ArrowRight size={18} />
            </Link>
          )}
        </div>
      </main>
    </>
  );
}

function Metric({ icon: Icon, value, label }) {
  return (
    <div className="soft-card rounded-2xl p-4">
      <Icon size={20} className="text-emerald-600" />

      <div className="mt-3 text-2xl font-black text-slate-900">{value}</div>

      <div className="mt-1 text-xs font-semibold text-slate-500">{label}</div>
    </div>
  );
}

function MiniStat({ value, label }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-xl font-black text-slate-800">{value}</div>

      <div className="mt-1 text-xs font-semibold text-slate-400">{label}</div>
    </div>
  );
}
