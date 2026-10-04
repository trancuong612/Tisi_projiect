import { json } from "@remix-run/node";

import { Link, useLoaderData } from "@remix-run/react";

import {
  Activity,
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock3,
  Headphones,
  Keyboard,
  MessageSquareText,
  Sparkles,
  Target,
} from "lucide-react";

import DesktopHeader from "../components/DesktopHeader";

import { getSkillAnalytics } from "../services/skill-analytics.server";

const SKILL_META = [
  {
    key: "recognition",
    label: "Nhận diện",
  },
  {
    key: "meaningRecall",
    label: "Nhớ nghĩa",
  },
  {
    key: "spelling",
    label: "Chính tả",
  },
  {
    key: "listening",
    label: "Nghe",
  },
  {
    key: "usage",
    label: "Sử dụng",
  },
];
export async function loader({ request }) {
  const url = new URL(request.url);

  const days = Number(url.searchParams.get("days") || 30);

  return json(
    await getSkillAnalytics({
      days,
    }),
  );
}

const SKILL_ICONS = {
  recognition: Brain,
  meaningRecall: Target,
  spelling: Keyboard,
  listening: Headphones,
  usage: MessageSquareText,
};

export default function SkillHistory() {
  const data = useLoaderData();

  const weakest = data.focus[0];

  const strongest = [...data.focus].sort((a, b) => b.score - a.score)[0];

  return (
    <>
      <DesktopHeader />

      <main className="page-shell max-w-4xl pb-28">
        {/* HEADER */}
        <div>
          <p className="text-sm font-black text-indigo-600">
            LEARNING ANALYTICS
          </p>

          <h1 className="mt-1 text-3xl font-black text-slate-900">
            Kỹ năng của tôi
          </h1>

          <p className="mt-2 text-sm font-semibold text-slate-500">
            Theo dõi năng lực hiện tại và hiệu suất luyện tập gần đây.
          </p>
        </div>

        {/* RANGE */}
        <div className="mt-5 flex gap-2">
          {[7, 30, 90].map((days) => (
            <Link
              key={days}
              to={`/skill-history?days=${days}`}
              className={[
                "rounded-full px-4 py-2 text-sm font-black",
                data.days === days
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-500",
              ].join(" ")}>
              {days} ngày
            </Link>
          ))}
        </div>

        {/* OVERVIEW */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard
            icon={Activity}
            value={data.totals.reviews}
            label="Lượt luyện"
          />

          <MetricCard
            icon={CheckCircle2}
            value={`${data.totals.accuracy}%`}
            label="Accuracy"
          />

          <MetricCard
            icon={Brain}
            value={data.totals.uniqueWords}
            label="Từ đã luyện"
          />

          <MetricCard
            icon={Clock3}
            value={
              data.totals.averageResponseTime
                ? `${(data.totals.averageResponseTime / 1000).toFixed(1)}s`
                : "—"
            }
            label="Phản hồi TB"
          />
        </section>

        {/* CURRENT SKILLS */}
        <section className="soft-card mt-6 rounded-[2rem] p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600">
              Current Skill State
            </p>

            <h2 className="mt-1 text-2xl font-black">Năng lực hiện tại</h2>
          </div>

          <div className="mt-6 space-y-5">
            {SKILL_META.map((skill) => {
              const Icon = SKILL_ICONS[skill.key];

              const current = data.currentSkill[skill.key];

              const recent = data.performance[skill.key];

              const trend = data.trends[skill.key];

              return (
                <SkillRow
                  key={skill.key}
                  icon={Icon}
                  label={skill.label}
                  value={current.percent}
                  recent={recent.percent}
                  trend={trend}
                  attempts={recent.attempts}
                />
              );
            })}
          </div>
        </section>

        {/* FOCUS */}
        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[2rem] bg-rose-50 p-6">
            <div className="text-xs font-black uppercase tracking-[0.15em] text-rose-600">
              Ưu tiên cải thiện
            </div>

            <div className="mt-3 text-2xl font-black text-slate-900">
              {weakest?.label}
            </div>

            <div className="mt-1 text-sm font-semibold text-slate-500">
              Điểm tổng hợp {weakest?.percent}%
            </div>
          </div>

          <div className="rounded-[2rem] bg-emerald-50 p-6">
            <div className="text-xs font-black uppercase tracking-[0.15em] text-emerald-600">
              Kỹ năng mạnh nhất
            </div>

            <div className="mt-3 text-2xl font-black text-slate-900">
              {strongest?.label}
            </div>

            <div className="mt-1 text-sm font-semibold text-slate-500">
              Điểm tổng hợp {strongest?.percent}%
            </div>
          </div>
        </section>

        {/* HARD WORDS */}
        <section className="soft-card mt-6 rounded-[2rem] p-6">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-amber-500" />

            <h2 className="text-xl font-black">Từ đang gây khó</h2>
          </div>

          {data.hardestWords.length ? (
            <div className="mt-5 space-y-3">
              {data.hardestWords.map((item, index) => (
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

                    <div className="text-[10px] font-bold text-slate-400">
                      {item.attempts} lượt
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-500">
              Chưa có đủ dữ liệu để xác định từ khó.
            </div>
          )}

          <Link
            to="/weak-words"
            className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 font-black text-white">
            Luyện từ yếu
            <ArrowRight size={17} />
          </Link>
        </section>

        {/* EXERCISES */}
        <section className="soft-card mt-6 rounded-[2rem] p-6">
          <h2 className="text-xl font-black">Hiệu suất theo dạng bài</h2>

          <div className="mt-5 space-y-3">
            {data.exerciseStats.map((item) => (
              <div
                key={item.type}
                className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                <div>
                  <div className="font-black text-slate-800">{item.type}</div>

                  <div className="mt-1 text-xs font-semibold text-slate-400">
                    {item.attempts} lượt
                  </div>
                </div>

                <div className="text-xl font-black text-indigo-600">
                  {item.accuracy}%
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function MetricCard({ icon: Icon, value, label }) {
  return (
    <div className="soft-card rounded-3xl p-4">
      <Icon size={19} className="text-indigo-500" />

      <div className="mt-3 text-2xl font-black text-slate-900">{value}</div>

      <div className="mt-1 text-xs font-bold text-slate-400">{label}</div>
    </div>
  );
}

function SkillRow({ icon: Icon, label, value, recent, trend, attempts }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Icon size={18} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="font-black text-slate-800">{label}</span>

            <span className="font-black text-slate-900">{value}%</span>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-500"
              style={{
                width: `${value}%`,
              }}
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold text-slate-400">
            <span>
              Gần đây: {recent === null ? "chưa đủ dữ liệu" : `${recent}%`}
            </span>

            {attempts > 0 && <span>{attempts} lượt</span>}

            {trend !== null && (
              <span
                className={
                  trend > 0
                    ? "text-emerald-600"
                    : trend < 0
                    ? "text-rose-600"
                    : "text-slate-400"
                }>
                {trend > 0 ? "↑ " : trend < 0 ? "↓ " : ""}
                {Math.abs(trend)}%
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
