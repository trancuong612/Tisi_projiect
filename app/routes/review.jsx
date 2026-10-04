import { json, redirect } from "@remix-run/node";
import { useEffect, useState } from "react";

import { Form, Link, useLoaderData } from "@remix-run/react";

import { ArrowLeft, Brain, Leaf } from "lucide-react";

import { prisma } from "../utils/db.server";

import { scheduleReview } from "../services/fsrs.server";

import { getDailyLearningQueue } from "../services/daily-learning.server";

import { getNextSessionReviewWord } from "../services/daily-session.server";

import DesktopHeader from "../components/DesktopHeader";
import FlashCard from "../components/FlashCard";
import RatingButtons from "../components/RatingButtons";

export async function loader() {
  const daily = await getDailyLearningQueue();

  const word = await getNextSessionReviewWord(daily.sessionId);

  const dueStep = daily.queue.find((item) => item.key === "DUE");

  return json({
    word,

    sessionId: daily.sessionId,

    dueStep,

    workload: daily.workload,
  });
}

export async function action({ request }) {
  const form = await request.formData();

  const vocabularyId = String(form.get("vocabularyId"));

  const rating = Number(form.get("rating"));

  const vocabulary = await prisma.vocabulary.findUnique({
    where: {
      id: vocabularyId,
    },

    include: {
      memory: true,
      skill: true,
    },
  });

  if (!vocabulary) {
    throw new Response("Vocabulary not found", {
      status: 404,
    });
  }

  const next = scheduleReview(vocabulary.memory, rating, new Date());

  const skillDelta = next.isCorrect ? 0.06 : -0.08;

  await prisma.$transaction([
    prisma.memoryState.update({
      where: {
        vocabularyId,
      },

      data: {
        state: next.state,

        due: next.due,

        stability: next.stability,

        difficulty: next.difficulty,

        elapsedDays: next.elapsedDays,

        scheduledDays: next.scheduledDays,

        reps: next.reps,

        lapses: next.lapses,

        learningSteps: next.learningSteps,

        lastReview: next.lastReview,

        totalReviews: {
          increment: 1,
        },

        ...(next.isCorrect
          ? {
              correctReviews: {
                increment: 1,
              },
            }
          : {
              wrongReviews: {
                increment: 1,
              },
            }),
      },
    }),

    prisma.skillState.update({
      where: {
        vocabularyId,
      },

      data: {
        recognition: {
          increment: skillDelta,
        },

        meaningRecall: {
          increment: skillDelta * 0.8,
        },
      },
    }),

    prisma.reviewLog.create({
      data: {
        vocabularyId,

        exerciseType: "FLASHCARD",

        rating,

        correct: next.isCorrect,
      },
    }),
  ]);

  return redirect("/review");
}

export default function Review() {
  const { word, dueStep, workload } = useLoaderData();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
  }, [word?.id]);
  const remaining = dueStep?.remaining || 0;

  return (
    <>
      <DesktopHeader />

      <main className="page-shell max-w-xl pb-28">
        <div className="mb-5">
          <p className="text-sm font-black text-emerald-700">ÔN ĐÚNG LÚC</p>

          <h1 className="text-2xl font-black">Lấy từ ra khỏi trí nhớ.</h1>

          {dueStep && dueStep.total > 0 && (
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Đã hoàn thành {dueStep.completed}/{dueStep.total} lượt ôn hôm nay
            </p>
          )}
        </div>

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

        {word ? (
          <Form method="post">
            <input type="hidden" name="vocabularyId" value={word.id} />

            <FlashCard word={word} onReveal={() => setRevealed(true)} />

            {revealed ? (
              <RatingButtons />
            ) : (
              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-400">
                Lật thẻ để xem đáp án trước khi tự đánh giá.
              </div>
            )}
          </Form>
        ) : remaining > 0 ? (
          <div className="soft-card rounded-[2rem] p-8 text-center">
            <div className="text-4xl">🌱</div>

            <h2 className="mt-3 text-xl font-black">
              Tạm thời chưa có từ cần hỏi lại
            </h2>

            <p className="mt-2 leading-6 text-slate-500">
              Một số từ bạn vừa chọn Again đang được FSRS giãn ra một khoảng
              ngắn. Hãy làm phần khác rồi quay lại.
            </p>

            <Link
              to="/"
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white">
              <ArrowLeft size={18} />
              Về lộ trình
            </Link>
          </div>
        ) : (
          <div className="soft-card rounded-[2rem] p-8 text-center">
            <div className="text-4xl">🌿</div>

            <h2 className="mt-3 text-xl font-black">
              Hoàn thành phần ôn hôm nay
            </h2>

            <p className="mt-2 text-slate-500">
              Workload Engine không còn review nào được giao trong Daily Session
              này.
            </p>

            <Link
              to="/"
              className="mt-5 inline-flex items-center gap-2 font-black text-emerald-700">
              Tiếp tục lộ trình
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
