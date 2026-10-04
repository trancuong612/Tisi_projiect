import { json, redirect } from "@remix-run/node";

import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";

import { ArrowRight, Brain, Link2, RefreshCcw, Sparkles } from "lucide-react";

import DesktopHeader from "../components/DesktopHeader";
import TtsButton from "../components/TtsButton";

import { prisma } from "../utils/db.server";

import { getDailyLearningQueue } from "../services/daily-learning.server";

import { generateVocabularyInsight } from "../services/lexical-insight.server";

export async function loader({ request }) {
  const url = new URL(request.url);

  const preview = url.searchParams.get("preview") === "1";

  const requestedId = url.searchParams.get("vocabularyId");

  const daily = await getDailyLearningQueue();

  const lessonIds = daily.lessons.map((lesson) => lesson.id);

  let vocabulary;

  if (preview || !lessonIds.length) {
    vocabulary = await prisma.vocabulary.findMany({
      where: {
        lessonId: {
          not: null,
        },
      },

      include: {
        lesson: {
          include: {
            week: true,
          },
        },

        insight: true,
      },

      orderBy: {
        createdAt: "desc",
      },

      take: 30,
    });
  } else {
    vocabulary = await prisma.vocabulary.findMany({
      where: {
        lessonId: {
          in: lessonIds,
        },
      },

      include: {
        lesson: {
          include: {
            week: true,
          },
        },

        insight: true,
      },

      orderBy: {
        createdAt: "asc",
      },
    });
  }

  let current = requestedId
    ? vocabulary.find((item) => item.id === requestedId)
    : null;

  if (!current) {
    current = vocabulary[0] || null;
  }

  const index = current
    ? vocabulary.findIndex((item) => item.id === current.id)
    : -1;

  const next =
    index >= 0 && vocabulary.length > 1
      ? vocabulary[(index + 1) % vocabulary.length]
      : null;

  return json({
    vocabulary,
    current,
    next,
    preview,
  });
}

export async function action({ request }) {
  const form = await request.formData();

  const intent = String(form.get("intent") || "");

  const vocabularyId = String(form.get("vocabularyId") || "");

  const preview = String(form.get("preview") || "") === "1";

  if (!vocabularyId) {
    return json(
      {
        ok: false,
        error: "Vocabulary ID missing.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    if (intent === "generate") {
      await generateVocabularyInsight(vocabularyId);
    }

    if (intent === "regenerate") {
      await generateVocabularyInsight(vocabularyId, {
        force: true,
      });
    }

    return redirect(
      `/connections?vocabularyId=${vocabularyId}${preview ? "&preview=1" : ""}`,
    );
  } catch (error) {
    console.error("Lexical insight error:", error);

    return json(
      {
        ok: false,
        error: "AI chưa tạo được dữ liệu cho từ này.",
      },
      {
        status: 503,
      },
    );
  }
}

export default function Connections() {
  const { current, next, preview } = useLoaderData();

  const actionData = useActionData();

  const navigation = useNavigation();

  const submitting = navigation.state === "submitting";

  if (!current) {
    return (
      <>
        <DesktopHeader />

        <main className="page-shell max-w-3xl pb-28">
          <div className="soft-card rounded-3xl p-8 text-center">
            <Brain size={40} className="mx-auto text-violet-300" />

            <h1 className="mt-4 text-xl font-black">Chưa có từ vựng</h1>
          </div>
        </main>
      </>
    );
  }

  const insight = current.insight;

  const collocations = Array.isArray(insight?.collocations)
    ? insight.collocations
    : [];

  const chunks = Array.isArray(insight?.chunks) ? insight.chunks : [];

  const confusions = Array.isArray(insight?.confusions)
    ? insight.confusions
    : [];

  return (
    <>
      <DesktopHeader />

      <main className="page-shell max-w-3xl pb-28">
        <div>
          <p className="text-sm font-black text-violet-600">WORD CONNECTIONS</p>

          <h1 className="mt-1 text-3xl font-black">Học theo cụm</h1>

          <p className="mt-2 text-sm font-semibold text-slate-500">
            Collocation · Chunk · Từ dễ nhầm
          </p>
        </div>

        {/* TARGET */}
        <div className="soft-card mt-5 rounded-[2rem] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-3xl font-black text-slate-900">
                {current.word}
              </div>

              {current.ipa && (
                <div className="mt-1 font-semibold text-slate-400">
                  {current.ipa}
                </div>
              )}

              <div className="mt-3 font-semibold leading-7 text-slate-600">
                {current.meaning}
              </div>
            </div>

            <TtsButton text={current.word} />
          </div>
        </div>

        {actionData?.error && (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-700">
            {actionData.error}
          </div>
        )}

        {!insight ? (
          <Form method="post" className="mt-5">
            <input type="hidden" name="intent" value="generate" />

            <input type="hidden" name="vocabularyId" value={current.id} />

            <input type="hidden" name="preview" value={preview ? "1" : "0"} />

            <button
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-4 font-black text-white disabled:opacity-60">
              <Sparkles size={19} />

              {submitting ? "AI đang tạo..." : "Tạo Word Connections bằng AI"}
            </button>
          </Form>
        ) : (
          <>
            {/* COLLOCATIONS */}
            <section className="soft-card mt-5 rounded-[2rem] p-6">
              <div className="flex items-center gap-2">
                <Link2 size={20} className="text-emerald-600" />

                <h2 className="text-xl font-black">Collocations</h2>
              </div>

              <p className="mt-1 text-xs font-semibold text-slate-400">
                Những từ thường đi cùng nhau.
              </p>

              <div className="mt-5 space-y-3">
                {collocations.map((item, index) => (
                  <ConnectionCard
                    key={index}
                    phrase={item.phrase}
                    meaning={item.meaning}
                    example={item.example}
                  />
                ))}
              </div>
            </section>

            {/* CHUNKS */}
            <section className="soft-card mt-5 rounded-[2rem] p-6">
              <h2 className="text-xl font-black">🧩 Chunks</h2>

              <p className="mt-1 text-xs font-semibold text-slate-400">
                Cụm có thể lấy ra và dùng ngay.
              </p>

              <div className="mt-5 space-y-3">
                {chunks.map((item, index) => (
                  <ConnectionCard
                    key={index}
                    phrase={item.phrase}
                    meaning={item.meaning}
                    example={item.example}
                  />
                ))}
              </div>
            </section>

            {/* CONFUSIONS */}
            <section className="soft-card mt-5 rounded-[2rem] p-6">
              <h2 className="text-xl font-black">⚡ Từ dễ nhầm</h2>

              <p className="mt-1 text-xs font-semibold text-slate-400">
                Phân biệt các từ gần nhau nhưng không dùng giống nhau.
              </p>

              {confusions.length ? (
                <div className="mt-5 space-y-4">
                  {confusions.map((item, index) => (
                    <ConfusionCard
                      key={index}
                      target={current.word}
                      item={item}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                  Không có cặp dễ nhầm đáng chú ý.
                </div>
              )}
            </section>

            {/* REGENERATE */}
            <Form method="post" className="mt-5">
              <input type="hidden" name="intent" value="regenerate" />

              <input type="hidden" name="vocabularyId" value={current.id} />

              <input type="hidden" name="preview" value={preview ? "1" : "0"} />

              <button
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-500">
                <RefreshCcw size={16} />
                Tạo lại dữ liệu AI
              </button>
            </Form>
          </>
        )}

        {/* NEXT */}
        {next && (
          <Link
            to={`/connections?vocabularyId=${next.id}${
              preview ? "&preview=1" : ""
            }`}
            className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-4 font-black text-white">
            Từ tiếp theo
            <ArrowRight size={18} />
          </Link>
        )}
      </main>
    </>
  );
}

function ConnectionCard({ phrase, meaning, example }) {
  return (
    <div className="rounded-3xl bg-slate-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="font-black text-slate-900">{phrase}</div>

        <TtsButton text={phrase} />
      </div>

      <div className="mt-2 text-sm font-semibold text-slate-500">{meaning}</div>

      <div className="mt-3 border-l-2 border-emerald-200 pl-3 text-sm font-semibold italic leading-6 text-slate-600">
        {example}
      </div>
    </div>
  );
}

function ConfusionCard({ target, item }) {
  return (
    <div className="rounded-3xl bg-amber-50 p-5">
      <div className="flex flex-wrap items-center gap-2 text-lg font-black text-slate-900">
        <span>{target}</span>

        <span className="text-slate-300">VS</span>

        <span>{item.word}</span>
      </div>

      <div className="mt-2 text-sm font-semibold text-amber-800">
        {item.meaning}
      </div>

      <p className="mt-3 font-semibold leading-7 text-slate-700">
        {item.difference}
      </p>

      <div className="mt-4 space-y-2 text-sm font-semibold">
        <div className="rounded-xl bg-white/70 p-3">✓ {item.targetExample}</div>

        <div className="rounded-xl bg-white/70 p-3">✓ {item.otherExample}</div>
      </div>
    </div>
  );
}
