import { json, redirect } from "@remix-run/node";

import { Form, Link, useLoaderData, useNavigation } from "@remix-run/react";

import {
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle2,
  Leaf,
  Sparkles,
} from "lucide-react";

import { useEffect, useState } from "react";

import DesktopHeader from "../components/DesktopHeader";
import FlashCard from "../components/FlashCard";

import { getDailyLearningQueue } from "../services/daily-learning.server";

import {
  activateSessionNewWord,
  getNextSessionNewWord,
} from "../services/daily-session.server";

export async function loader() {
  const daily = await getDailyLearningQueue();

  const word = await getNextSessionNewWord(daily.sessionId);

  const newStep = daily.queue.find((item) => item.key === "NEW");

  return json({
    word,

    sessionId: daily.sessionId,

    newStep,

    workload: daily.workload,
  });
}

export async function action({ request }) {
  const form = await request.formData();

  const sessionId = String(form.get("sessionId") || "");

  const vocabularyId = String(form.get("vocabularyId") || "");

  if (!sessionId || !vocabularyId) {
    throw new Response("Missing session or vocabulary.", {
      status: 400,
    });
  }

  await activateSessionNewWord({
    sessionId,
    vocabularyId,
  });

  /**
   * Load lại /learn.
   * Loader sẽ tự lấy
   * newTarget tiếp theo.
   */
  return redirect("/learn");
}

export default function Learn() {
  const { word, sessionId, newStep, workload } = useLoaderData();

  const navigation = useNavigation();

  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
  }, [word?.id]);

  const submitting = navigation.state === "submitting";

  const remaining = newStep?.remaining || 0;

  return (
    <>
      <DesktopHeader />

      <main className="page-shell max-w-xl pb-28">
        {/* HEADER */}
        <div className="mb-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black text-emerald-700">HỌC TỪ MỚI</p>

              <h1 className="mt-1 text-2xl font-black text-slate-900">
                Làm quen trước, tự nhớ sau.
              </h1>
            </div>

            {newStep && newStep.total > 0 && (
              <div className="shrink-0 rounded-2xl bg-emerald-50 px-4 py-3 text-center">
                <div className="text-lg font-black text-emerald-700">
                  {newStep.completed}/{newStep.total}
                </div>

                <div className="text-[10px] font-bold text-emerald-600">
                  hôm nay
                </div>
              </div>
            )}
          </div>

          <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
            Nhìn từ trước và thử đoán. Sau đó lật thẻ để xem nghĩa và ví dụ.
          </p>
        </div>

        {/* WORKLOAD INFO */}
        {workload.mode !== "NORMAL" && (
          <div
            className={[
              "mb-5 rounded-3xl p-4",
              workload.mode === "RECOVERY"
                ? "bg-violet-50 text-violet-800"
                : "bg-amber-50 text-amber-800",
            ].join(" ")}>
            <div className="flex items-center gap-2 font-black">
              {workload.mode === "RECOVERY" ? (
                <Leaf size={18} />
              ) : (
                <Brain size={18} />
              )}

              {workload.mode === "RECOVERY" ? "Recovery Mode" : "Busy Mode"}
            </div>

            <p className="mt-2 text-sm font-semibold leading-6 opacity-80">
              {workload.reason}
            </p>
          </div>
        )}

        {/* WORD */}
        {word ? (
          <>
            <FlashCard word={word} onReveal={() => setRevealed(true)} />

            {revealed ? (
              <Form method="post" className="mt-4">
                <input type="hidden" name="sessionId" value={sessionId} />

                <input type="hidden" name="vocabularyId" value={word.id} />

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white shadow-lg shadow-emerald-100 transition active:scale-[0.99] disabled:opacity-50">
                  <CheckCircle2 size={19} />

                  {submitting
                    ? "Đang lưu..."
                    : remaining > 1
                    ? "Đã hiểu · Từ tiếp theo"
                    : "Đã hiểu từ này"}

                  <ArrowRight size={18} />
                </button>
              </Form>
            ) : (
              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-400">
                Lật thẻ trước khi xác nhận đã học từ này.
              </div>
            )}

            <p className="mt-4 text-center text-xs font-semibold leading-5 text-slate-400">
              Đây là bước làm quen. Hệ thống chưa tính đây là một lượt ôn đúng
              hoặc sai.
            </p>
          </>
        ) : newStep?.total === 0 ? (
          <NoNewWords />
        ) : (
          <CompletedNewWords />
        )}
      </main>
    </>
  );
}

function CompletedNewWords() {
  return (
    <div className="soft-card rounded-[2rem] p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 mx-auto text-emerald-700">
        <CheckCircle2 size={27} />
      </div>

      <h2 className="mt-4 text-xl font-black text-slate-900">
        Hoàn thành từ mới hôm nay
      </h2>

      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
        Các từ vừa học đã chuyển sang giai đoạn Learning. Hệ thống sẽ quyết định
        lúc phù hợp để hỏi lại.
      </p>

      <Link
        to="/"
        className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white">
        Tiếp tục lộ trình
        <ArrowRight size={18} />
      </Link>
    </div>
  );
}

function NoNewWords() {
  return (
    <div className="soft-card rounded-[2rem] p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 mx-auto text-violet-700">
        <Sparkles size={26} />
      </div>

      <h2 className="mt-4 text-xl font-black text-slate-900">
        Hôm nay không cần học thêm từ mới
      </h2>

      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
        Workload Engine đang ưu tiên những kiến thức đã học thay vì tăng thêm
        tải từ mới.
      </p>

      <Link
        to="/"
        className="mt-5 inline-flex items-center gap-2 font-black text-emerald-700">
        <ArrowLeft size={18} />
        Về lộ trình hôm nay
      </Link>
    </div>
  );
}
