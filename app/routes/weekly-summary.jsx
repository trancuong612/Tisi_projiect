import { json } from "@remix-run/node";

import { Link, useLoaderData } from "@remix-run/react";

import {
  Activity,
  ArrowRight,
  Brain,
  CheckCircle2,
  Headphones,
  Keyboard,
  MessageSquareText,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import DesktopHeader from "../components/DesktopHeader";

import { getWeeklySummary } from "../services/weekly-summary.server";

export async function loader() {
  return json(await getWeeklySummary());
}

const SKILL_ICONS = {
  recognition: Brain,
  meaningRecall: Target,
  spelling: Keyboard,
  listening: Headphones,
  usage: MessageSquareText,
};

export default function WeeklySummary() {
  const data = useLoaderData();

  return (
    <>
      <DesktopHeader />

      <main className="page-shell max-w-4xl pb-28">
        {/* HEADER */}
        <div>
          <p className="text-sm font-black text-violet-600">
            WEEKLY CONSOLIDATION
          </p>

          <h1 className="mt-1 text-3xl font-black text-slate-900">
            Tổng kết tuần
          </h1>

          <p className="mt-2 text-sm font-semibold text-slate-500">
            {data.currentWeek.start}
            {" → "}
            {data.currentWeek.end}
          </p>
        </div>

        {/* TOTALS */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            value={data.totals.reviews}
            label="Lượt luyện"
            change={data.comparison.reviews}
          />

          <Metric
            value={data.totals.uniqueWords}
            label="Từ đã luyện"
            change={data.comparison.uniqueWords}
          />

          <Metric
            value={`${data.totals.accuracy}%`}
            label="Accuracy"
            change={data.comparison.accuracy}
            suffix="%"
          />

          <Metric
            value={`${data.totals.hintRate}%`}
            label="Dùng gợi ý"
            change={data.comparison.hintRate}
            suffix="%"
            reverse
          />
        </section>

        {/* WEEK COMPARE */}
        <section className="soft-card mt-6 rounded-[2rem] p-6">
          <p className="text-xs font-black uppercase tracking-[0.15em] text-violet-600">
            So với tuần trước
          </p>

          <h2 className="mt-1 text-2xl font-black text-slate-900">
            Xu hướng kỹ năng
          </h2>

          <div className="mt-6 space-y-4">
            {data.skills.map((skill) => {
              const Icon = SKILL_ICONS[skill.key];

              return <SkillCompare key={skill.key} icon={Icon} skill={skill} />;
            })}
          </div>
        </section>

        {/* NEXT WEEK FOCUS */}
        <section className="mt-6 rounded-[2rem] bg-slate-900 p-6 text-white">
          <div className="flex items-center gap-2 text-violet-300">
            <Sparkles size={19} />

            <span className="text-xs font-black uppercase tracking-[0.15em]">
              Tuần tới
            </span>
          </div>

          <h2 className="mt-2 text-2xl font-black">Nên tập trung vào gì?</h2>

          <div className="mt-5 space-y-3">
            {data.focus.map((item, index) => (
              <div
                key={item.key}
                className="flex items-center gap-4 rounded-2xl bg-white/10 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-sm font-black">
                  {index + 1}
                </div>

                <div className="flex-1">
                  <div className="font-black">{item.label}</div>

                  <div className="mt-1 text-xs font-semibold text-slate-400">
                    Điểm tổng hợp {item.score}%
                  </div>
                </div>

                {item.change !== null && item.change < 0 && (
                  <div className="text-xs font-black text-rose-300">
                    ↓ {Math.abs(item.change)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* HARD WORDS */}
        <section className="soft-card mt-6 rounded-[2rem] p-6">
          <div className="flex items-center gap-2">
            <Activity size={20} className="text-amber-500" />

            <h2 className="text-xl font-black">Mang sang tuần tới</h2>
          </div>

          <p className="mt-1 text-sm font-semibold text-slate-400">
            Những từ vẫn chưa ổn định trong tuần này.
          </p>

          {data.hardWords.length ? (
            <div className="mt-5 space-y-3">
              {data.hardWords.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black text-slate-300">
                    {String(index + 1).padStart(2, "0")}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-black text-slate-900">{item.word}</div>

                    <div className="mt-1 truncate text-xs font-semibold text-slate-400">
                      {item.meaning}
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={[
                        "font-black",
                        item.accuracy < 50 ? "text-rose-600" : "text-amber-600",
                      ].join(" ")}>
                      {item.accuracy}%
                    </div>

                    <div className="mt-1 text-[10px] font-bold text-slate-400">
                      {item.attempts} lượt
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl bg-emerald-50 p-5 font-semibold text-emerald-700">
              Chưa có từ nào cần đặc biệt mang sang tuần tới.
            </div>
          )}

          <Link
            to="/weak-words"
            className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 py-4 font-black text-white">
            Luyện lại các từ này
            <ArrowRight size={18} />
          </Link>
        </section>

        {/* DAILY ACTIVITY */}
        <section className="soft-card mt-6 rounded-[2rem] p-6">
          <h2 className="text-xl font-black">Nhịp học trong tuần</h2>

          <div className="mt-6 grid grid-cols-7 gap-2">
            {data.dailyActivity.map((day, index) => (
              <DayActivity key={day.dateKey} day={day} index={index} />
            ))}
          </div>
        </section>

        {/* NEXT */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            to="/skill-history"
            className="soft-card flex items-center justify-between rounded-3xl p-5">
            <div>
              <div className="font-black text-slate-900">Phân tích kỹ năng</div>

              <div className="mt-1 text-xs font-semibold text-slate-400">
                Xem xu hướng 7 / 30 / 90 ngày
              </div>
            </div>

            <ArrowRight size={18} className="text-slate-300" />
          </Link>

          <Link
            to="/practice"
            className="soft-card flex items-center justify-between rounded-3xl p-5">
            <div>
              <div className="font-black text-slate-900">Luyện thích ứng</div>

              <div className="mt-1 text-xs font-semibold text-slate-400">
                Tiếp tục cải thiện điểm yếu
              </div>
            </div>

            <ArrowRight size={18} className="text-slate-300" />
          </Link>
        </div>
      </main>
    </>
  );
}

function Metric({ value, label, change, suffix = "", reverse = false }) {
  let good = change >= 0;

  if (reverse) {
    good = change <= 0;
  }

  return (
    <div className="soft-card rounded-3xl p-4">
      <div className="text-2xl font-black text-slate-900">{value}</div>

      <div className="mt-1 text-xs font-bold text-slate-400">{label}</div>

      <div
        className={[
          "mt-3 flex items-center gap-1 text-xs font-black",
          change === 0
            ? "text-slate-400"
            : good
            ? "text-emerald-600"
            : "text-rose-600",
        ].join(" ")}>
        {change > 0 ? (
          <TrendingUp size={14} />
        ) : change < 0 ? (
          <TrendingDown size={14} />
        ) : (
          <CheckCircle2 size={14} />
        )}

        {change > 0 ? "+" : ""}
        {change}
        {suffix}
      </div>
    </div>
  );
}

function SkillCompare({ icon: Icon, skill }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
        <Icon size={19} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="font-black text-slate-800">{skill.label}</div>

          <div className="flex items-center gap-2">
            <span className="font-black text-slate-900">
              {skill.percent === null ? "—" : `${skill.percent}%`}
            </span>

            {skill.change !== null && (
              <span
                className={[
                  "text-xs font-black",
                  skill.change > 0
                    ? "text-emerald-600"
                    : skill.change < 0
                    ? "text-rose-600"
                    : "text-slate-400",
                ].join(" ")}>
                {skill.change > 0 ? "+" : ""}
                {skill.change}%
              </span>
            )}
          </div>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-violet-500"
            style={{
              width: `${skill.percent || 0}%`,
            }}
          />
        </div>

        <div className="mt-1 text-[10px] font-bold text-slate-400">
          {skill.attempts} lượt tuần này
        </div>
      </div>
    </div>
  );
}

function DayActivity({ day, index }) {
  const labels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

  const active = day.reviews > 0;

  return (
    <div className="text-center">
      <div className="text-xs font-black text-slate-400">{labels[index]}</div>

      <div
        className={[
          "mt-2 flex h-12 items-center justify-center rounded-2xl text-sm font-black",
          active
            ? "bg-violet-100 text-violet-700"
            : "bg-slate-50 text-slate-300",
        ].join(" ")}>
        {day.reviews}
      </div>

      <div className="mt-1 text-[9px] font-bold text-slate-300">
        {day.accuracy === null ? "—" : `${day.accuracy}%`}
      </div>
    </div>
  );
}
