import { Link, useLoaderData } from "@remix-run/react";

import { json } from "@remix-run/node";

import {
  Brain,
  BookOpenText,
  Sparkles,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  Circle,
  CalendarDays,
  Activity,
  MinusCircle,
  Link2,
  BarChart3,
  CalendarRange,
} from "lucide-react";

import DesktopHeader from "../components/DesktopHeader";

import { getDailyLearningQueue } from "../services/daily-learning.server";
import { getAdaptiveRecommendation } from "../services/adaptive-recommendation.server";
export async function loader() {
  const [daily, recommendation] = await Promise.all([
    getDailyLearningQueue(),

    getAdaptiveRecommendation(),
  ]);

  return json({
    ...daily,
    recommendation,
  });
}

function getQueueIcon(key) {
  switch (key) {
    case "DUE":
      return RotateCcw;

    case "RELEARNING":
      return Brain;

    case "NEW":
      return Sparkles;

    case "WEAK":
      return Activity;

    case "READING":
      return BookOpenText;

    default:
      return Circle;
  }
}

function getQueueStyle(key) {
  switch (key) {
    case "DUE":
      return {
        icon: "bg-blue-100 text-blue-700",

        count: "text-blue-700",
      };

    case "RELEARNING":
      return {
        icon: "bg-rose-100 text-rose-700",

        count: "text-rose-700",
      };

    case "NEW":
      return {
        icon: "bg-emerald-100 text-emerald-700",

        count: "text-emerald-700",
      };

    case "WEAK":
      return {
        icon: "bg-amber-100 text-amber-700",

        count: "text-amber-700",
      };

    case "READING":
      return {
        icon: "bg-violet-100 text-violet-700",

        count: "text-violet-700",
      };

    default:
      return {
        icon: "bg-slate-100 text-slate-600",

        count: "text-slate-700",
      };
  }
}

function getStatusLabel(status) {
  switch (status) {
    case "DONE":
      return "Hoàn thành";

    case "IN_PROGRESS":
      return "Đang học";

    case "NOT_REQUIRED":
      return "Không cần";

    default:
      return "Chưa bắt đầu";
  }
}

export default function Home() {
  const data = useLoaderData();
  const {
    progress,
    nextTask,
    queue,
    week,
    date,
    activity,
    workload,
    recommendation,
  } = data;

  return (
    <>
      <DesktopHeader />

      <main className="page-shell pb-28">
        {/* HERO */}
        <section className="overflow-hidden rounded-[2rem] bg-emerald-700 p-6 text-white shadow-xl shadow-emerald-100 sm:p-8">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-100">
            <CalendarDays size={17} />

            <span>
              {date.dayLabel}

              {week ? ` · Tuần ${week.number}` : ""}
            </span>
          </div>

          <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
            Hôm nay mình học một chút nhé. 🌱
          </h1>

          {/* DAILY PROGRESS */}
          <div className="mt-6 rounded-3xl bg-white/10 p-4 backdrop-blur">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-100">
                  Tiến độ hôm nay
                </div>

                <div className="mt-2 text-3xl font-black">
                  {progress.percent}%
                </div>
              </div>

              <div className="text-right text-sm font-bold text-emerald-100">
                {progress.completed}/{progress.total} mục
              </div>
            </div>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/15">
              <div
                className="h-full rounded-full bg-white transition-all duration-500"
                style={{
                  width: `${progress.percent}%`,
                }}
              />
            </div>
          </div>

          {/* NEXT TASK */}
          <div className="mt-4 rounded-3xl bg-white p-5 text-slate-900">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-600">
              Tiếp theo
            </div>

            <div className="mt-2 text-xl font-black">{nextTask.title}</div>

            <div className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              {nextTask.description}
            </div>

            {nextTask.remaining > 0 && (
              <div className="mt-2 text-sm font-black text-emerald-700">
                {nextTask.remaining} mục còn lại
              </div>
            )}

            <Link
              to={nextTask.path}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white">
              {progress.completedAll ? "Xem tổng kết" : "Tiếp tục học"}

              <ArrowRight size={18} />
            </Link>
          </div>
        </section>
        {workload.mode !== "NORMAL" && (
          <section
            className={[
              "mt-5 rounded-[2rem] p-5",
              workload.mode === "RECOVERY" ? "bg-violet-50" : "bg-amber-50",
            ].join(" ")}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div
                  className={[
                    "text-xs font-black uppercase tracking-[0.16em]",
                    workload.mode === "RECOVERY"
                      ? "text-violet-700"
                      : "text-amber-700",
                  ].join(" ")}>
                  {workload.mode === "RECOVERY"
                    ? "🌿 Recovery Mode"
                    : "🧠 Busy Mode"}
                </div>

                <h2 className="mt-2 text-xl font-black text-slate-900">
                  Hôm nay hệ thống đã điều chỉnh khối lượng học
                </h2>

                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  {workload.reason}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-4">
                <div className="text-2xl font-black text-emerald-700">
                  {workload.selected.total}
                </div>

                <div className="mt-1 text-xs font-bold text-slate-400">
                  giao hôm nay
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4">
                <div className="text-2xl font-black text-slate-500">
                  {workload.deferred.total}
                </div>

                <div className="mt-1 text-xs font-bold text-slate-400">
                  để xử lý sau
                </div>
              </div>
            </div>

            {workload.mode === "RECOVERY" && (
              <p className="mt-4 text-xs font-bold leading-5 text-violet-700">
                Từ mới có thể được tạm hoãn để ưu tiên phục hồi kiến thức đã
                học.
              </p>
            )}
          </section>
        )}

        {/* ADAPTIVE RECOMMENDATION */}
        {recommendation?.hasData && recommendation.primaryFocus && (
          <section className="mt-5 rounded-[2rem] bg-indigo-50 p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                <Brain size={22} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600">
                  Ưu tiên kỹ năng hôm nay
                </div>

                <h2 className="mt-2 text-xl font-black text-slate-900">
                  {recommendation.primaryFocus.label}
                </h2>

                <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                  Learning Engine nhận thấy đây là kỹ năng cần được củng cố
                  nhiều hơn.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {recommendation.focus.map((item, index) => (
                    <span
                      key={item.key}
                      className={[
                        "rounded-full px-3 py-1.5 text-xs font-black",
                        index === 0
                          ? "bg-indigo-600 text-white"
                          : "bg-white text-indigo-700",
                      ].join(" ")}>
                      {index + 1}. {item.label}
                    </span>
                  ))}
                </div>

                <Link
                  to={recommendation.primaryFocus.action.path}
                  className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white">
                  {recommendation.primaryFocus.action.title}

                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* QUEUE */}
        <section className="mt-7">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-600">
            Daily Session
          </p>

          <h2 className="mt-1 text-2xl font-black text-slate-900">
            Lộ trình hôm nay
          </h2>

          <div className="mt-4 space-y-3">
            {queue.map((item, index) => (
              <QueueItem
                key={item.key}
                item={item}
                index={index}
                isNext={item.key === nextTask.key}
              />
            ))}
          </div>
        </section>

        {/* TODAY ACTIVITY */}
        <section className="mt-7 rounded-[2rem] bg-slate-900 p-5 text-white">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
            Hoạt động hôm nay
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-2xl font-black">{activity.reviewsToday}</div>

              <div className="mt-1 text-xs font-semibold text-slate-300">
                lượt luyện
              </div>
            </div>

            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-2xl font-black">
                {activity.uniqueWordsToday}
              </div>

              <div className="mt-1 text-xs font-semibold text-slate-300">
                từ đã luyện
              </div>
            </div>
          </div>
        </section>
        {/* WORD CONNECTIONS */}
        <section className="mt-7">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">
            Học mở rộng
          </p>

          <h2 className="mt-1 text-2xl font-black text-slate-900">
            Hiểu từ sâu hơn
          </h2>

          <Link
            to="/connections"
            className="soft-card mt-4 flex items-center gap-4 rounded-3xl p-5 transition hover:-translate-y-0.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <Link2 size={22} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="font-black text-slate-900">Word Connections</div>

              <div className="mt-1 text-sm font-semibold leading-5 text-slate-500">
                Collocation · Chunk · Từ dễ nhầm
              </div>
            </div>

            <ArrowRight size={19} className="shrink-0 text-slate-300" />
          </Link>
        </section>
        {/* QUICK LINKS */}
        <section className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Quick to="/practice" icon={Brain} title="Luyện thích ứng" />

          <Quick to="/weak-words" icon={Activity} title="Từ cần củng cố" />

          <Quick to="/reader" icon={BookOpenText} title="Đọc & nghe" />

          <Quick
            to="/skill-history"
            icon={BarChart3}
            title="Phân tích kỹ năng"
          />
          <Quick
            to="/weekly-summary"
            icon={CalendarRange}
            title="Tổng kết tuần"
          />

          <Quick to="/stats" icon={Sparkles} title="Tiến độ dài hạn" />
        </section>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link
            to="/admin/import"
            className="text-sm font-bold text-emerald-700">
            + Nhập bộ từ mới
          </Link>

          <Link to="/admin/backup" className="text-sm font-bold text-slate-500">
            Backup & Restore
          </Link>
        </div>
      </main>
    </>
  );
}

function QueueItem({ item, index, isNext }) {
  const Icon = getQueueIcon(item.key);

  const style = getQueueStyle(item.key);

  return (
    <Link
      to={item.path}
      className={[
        "soft-card flex items-center gap-4 rounded-3xl p-4 transition",
        isNext ? "ring-2 ring-emerald-300" : "",
      ].join(" ")}>
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${style.icon}`}>
        {item.status === "DONE" ? (
          <CheckCircle2 size={21} />
        ) : item.status === "NOT_REQUIRED" ? (
          <MinusCircle size={21} />
        ) : (
          <Icon size={21} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-slate-300">
            0{index + 1}
          </span>

          {isNext && item.status !== "DONE" && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">
              Tiếp theo
            </span>
          )}
        </div>

        <div className="mt-1 font-black text-slate-800">{item.title}</div>

        <div className="mt-1 text-xs font-semibold text-slate-400">
          {getStatusLabel(item.status)}
        </div>
      </div>

      <div className="shrink-0 text-right">
        {item.status === "NOT_REQUIRED" ? (
          <div className="text-xs font-black text-slate-400">—</div>
        ) : (
          <>
            <div className={`text-lg font-black ${style.count}`}>
              {item.completed}/{item.total}
            </div>

            {item.status !== "DONE" && (
              <div className="mt-1 text-[10px] font-bold text-slate-400">
                còn {item.remaining}
              </div>
            )}
          </>
        )}
      </div>
    </Link>
  );
}

function Quick({ to, icon: Icon, title }) {
  return (
    <Link to={to} className="soft-card flex items-center gap-3 rounded-2xl p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
        <Icon size={19} />
      </div>

      <span className="text-sm font-black text-slate-700">{title}</span>
    </Link>
  );
}
