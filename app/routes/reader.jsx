import { json } from "@remix-run/node";

import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";

import { useRef, useState } from "react";

import {
  ArrowRight,
  BookOpenText,
  Brain,
  CheckCircle2,
  Circle,
  GraduationCap,
  Headphones,
  Eye,
  Lightbulb,
  RotateCcw,
  Pencil,
} from "lucide-react";

import { prisma } from "../utils/db.server";

import DesktopHeader from "../components/DesktopHeader";
import TtsButton from "../components/TtsButton";

import { getDailyLearningQueue } from "../services/daily-learning.server";

import { markReadingCompleted } from "../services/daily-session.server";

import { buildReadingTestQuestions } from "../services/reading-learning.server";

import { gradeAdaptiveAnswer } from "../services/adaptive-learning.server";
import { evaluateAndRecordUsageAttempt } from "../services/usage-learning.server";
import { speakText } from "../utils/tts";
const MODES = [
  {
    key: "learn",
    label: "Học",
  },

  {
    key: "read",
    label: "Đọc",
  },

  {
    key: "listen",
    label: "Nghe",
  },

  {
    key: "use",
    label: "Dùng",
  },

  {
    key: "test",
    label: "Kiểm tra",
  },
];

export async function loader({ request }) {
  const daily = await getDailyLearningQueue();

  const lessonIds = daily.lessons.map((lesson) => lesson.id);

  const url = new URL(request.url);
  const preview = url.searchParams.get("preview") === "1";

  const requestedId = url.searchParams.get("readingId");

  const requestedMode = url.searchParams.get("mode");

  const mode = MODES.some((item) => item.key === requestedMode)
    ? requestedMode
    : "learn";

  const requestedQuestion = Number(url.searchParams.get("q") || 0);

  if (!lessonIds.length && !preview) {
    return json({
      readings: [],
      reading: null,
      sessionId: daily.sessionId,
      completedReadingIds: [],
      mode,
      questions: [],
      questionIndex: 0,
      progress: daily.progress,
      preview,
    });
  }

  const readings = await prisma.reading.findMany({
    where: preview
      ? {}
      : {
          lessonId: {
            in: lessonIds,
          },
        },

    include: {
      lesson: {
        include: {
          week: true,
          vocabulary: true,
        },
      },
    },

    orderBy: {
      createdAt: preview ? "desc" : "asc",
    },

    ...(preview
      ? {
          take: 10,
        }
      : {}),
  });

  const session = await prisma.dailySession.findUnique({
    where: {
      id: daily.sessionId,
    },

    select: {
      completedReadingTargets: true,
    },
  });

  const completedReadingIds = Array.isArray(session?.completedReadingTargets)
    ? session.completedReadingTargets
    : [];

  let reading = null;

  if (requestedId) {
    reading = readings.find((item) => item.id === requestedId) || null;
  }

  /**
   * Ưu tiên reading chưa hoàn thành.
   */
  if (!reading) {
    reading =
      readings.find((item) => !completedReadingIds.includes(item.id)) ||
      readings[0] ||
      null;
  }

  const questions = reading
    ? buildReadingTestQuestions({
        content: reading.content,

        vocabulary: reading.lesson.vocabulary,
      })
    : [];

  const questionIndex = questions.length
    ? Math.min(Math.max(0, requestedQuestion), questions.length - 1)
    : 0;

  return json({
    readings,
    reading,
    sessionId: daily.sessionId,
    completedReadingIds,
    progress: daily.progress,
    mode,
    questions,
    questionIndex,
    preview,
  });
}

export async function action({ request }) {
  const form = await request.formData();

  const intent = String(form.get("intent") || "");

  /**
   * MARK READING COMPLETE
   */
  if (intent === "complete-reading") {
    const sessionId = String(form.get("sessionId") || "");

    const readingId = String(form.get("readingId") || "");

    if (!sessionId || !readingId) {
      return json(
        {
          ok: false,
        },
        {
          status: 400,
        },
      );
    }

    await markReadingCompleted({
      sessionId,
      readingId,
    });

    return json({
      ok: true,
      type: "complete-reading",
    });
  }
  /**
   * LISTENING DICTATION
   */
  if (intent === "listening-answer") {
    const vocabularyId = String(form.get("vocabularyId") || "");

    const answer = String(form.get("answer") || "");

    const expectedAnswer = String(form.get("expectedAnswer") || "");

    const responseTime = Number(form.get("responseTime") || 0);

    const hintsUsed = Number(form.get("hintsUsed") || 0);

    if (!vocabularyId || !expectedAnswer) {
      return json(
        {
          ok: false,
        },
        {
          status: 400,
        },
      );
    }

    const result = await gradeAdaptiveAnswer({
      vocabularyId,

      /**
       * Listening + spelling.
       */
      exerciseType: "DICTATION",

      answer,

      expectedAnswer,

      responseTime,

      hintsUsed,
    });

    return json({
      ok: true,
      type: "listening-answer",
      vocabularyId,
      result,
    });
  }

  /**
   * AI USAGE EVALUATION
   */
  if (intent === "usage-evaluate") {
    const vocabularyId = String(form.get("vocabularyId") || "");

    const answer = String(form.get("answer") || "");

    const responseTime = Number(form.get("responseTime") || 0);

    if (!vocabularyId || !answer.trim()) {
      return json(
        {
          ok: false,
          type: "usage-error",
          error: "Hãy viết một câu trước.",
        },
        {
          status: 400,
        },
      );
    }

    try {
      const result = await evaluateAndRecordUsageAttempt({
        vocabularyId,
        answer,
        responseTime,
      });
      return json({
        ok: true,
        type: "usage-evaluated",
        vocabularyId,
        result,
      });
    } catch (error) {
      console.error("Gemini usage evaluation failed:", error);

      return json(
        {
          ok: false,
          type: "usage-error",
          vocabularyId,
          error: "AI hiện chưa chấm được câu này. Hãy thử lại.",
        },
        {
          status: 503,
        },
      );
    }
  }
  /**
   * READING CLOZE TEST
   */
  if (intent === "test-answer") {
    const vocabularyId = String(form.get("vocabularyId") || "");

    const answer = String(form.get("answer") || "");

    const expectedAnswer = String(form.get("expectedAnswer") || "");

    const responseTime = Number(form.get("responseTime") || 0);

    const hintsUsed = Number(form.get("hintsUsed") || 0);

    if (!vocabularyId || !expectedAnswer) {
      return json(
        {
          ok: false,
        },
        {
          status: 400,
        },
      );
    }

    const result = await gradeAdaptiveAnswer({
      vocabularyId,

      exerciseType: "CLOZE",

      answer,

      expectedAnswer,

      responseTime,

      hintsUsed,
    });

    return json({
      ok: true,
      type: "test-answer",
      vocabularyId,
      result,
    });
  }

  return json(
    {
      ok: false,
    },
    {
      status: 400,
    },
  );
}

export default function Reader() {
  const data = useLoaderData();

  const {
    readings,
    reading,
    sessionId,
    completedReadingIds,
    mode,
    questions,
    questionIndex,
    preview,
  } = data;

  const navigation = useNavigation();

  const completed = reading ? completedReadingIds.includes(reading.id) : false;

  const completedCount = readings.filter((item) =>
    completedReadingIds.includes(item.id),
  ).length;

  return (
    <>
      <DesktopHeader />

      <main className="page-shell max-w-3xl pb-28">
        {/* HEADER */}
        <div>
          <p className="text-sm font-black text-emerald-700">READ & LISTEN</p>

          <h1 className="mt-1 text-3xl font-black">
            {reading?.title || "Bài đọc hôm nay"}
          </h1>

          {reading && (
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Tuần {reading.lesson.week.number} ·{" "}
              {reading.lesson.dayLabel || reading.lesson.day}
            </p>
          )}
        </div>

        {/* READING SELECTOR */}
        {readings.length > 1 && (
          <div className="mt-5 flex gap-2 overflow-x-auto">
            {readings.map((item, index) => {
              const done = completedReadingIds.includes(item.id);

              return (
                <Link
                  key={item.id}
                  to={`/reader?readingId=${item.id}&mode=${mode}${
                    preview ? "&preview=1" : ""
                  }`}
                  className={[
                    "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-black",
                    reading?.id === item.id
                      ? "bg-emerald-600 text-white"
                      : "border border-slate-200 bg-white text-slate-500",
                  ].join(" ")}>
                  {done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                  Bài {index + 1}
                </Link>
              );
            })}
          </div>
        )}

        {reading ? (
          <>
            {/* MODES */}
            <ModeTabs readingId={reading.id} mode={mode} preview={preview} />

            {/* LEARN */}
            {mode === "learn" && <LearnMode reading={reading} />}

            {/* READ */}
            {mode === "read" && <ReadMode reading={reading} />}
            {/* LISTEN */}
            {mode === "listen" && (
              <ListeningMode
                reading={reading}
                questions={questions}
                questionIndex={questionIndex}
                preview={preview}
              />
            )}
            {/* USAGE */}
            {mode === "use" && (
              <UsageMode
                reading={reading}
                questions={questions}
                questionIndex={questionIndex}
              />
            )}
            {/* TEST */}
            {mode === "test" && (
              <TestMode
                reading={reading}
                questions={questions}
                questionIndex={questionIndex}
              />
            )}
            {/* COMPLETE READING */}
            {preview ? (
              <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-center text-sm font-black text-blue-700">
                <Eye size={18} />
                Chế độ xem trước · Không ghi nhận tiến độ học hôm nay
              </div>
            ) : (
              <div className="mt-5">
                {completed ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 font-black text-emerald-700">
                    <CheckCircle2 size={20} />
                    Đã hoàn thành bài đọc hôm nay
                  </div>
                ) : (
                  <Form method="post">
                    <input
                      type="hidden"
                      name="intent"
                      value="complete-reading"
                    />

                    <input type="hidden" name="sessionId" value={sessionId} />

                    <input type="hidden" name="readingId" value={reading.id} />

                    <button
                      type="submit"
                      disabled={navigation.state === "submitting"}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white disabled:opacity-60">
                      <CheckCircle2 size={20} />
                      Hoàn thành bài đọc
                    </button>
                  </Form>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="soft-card mt-5 rounded-3xl p-8 text-center">
            <BookOpenText size={38} className="mx-auto text-emerald-300" />

            <h2 className="mt-4 text-xl font-black">Hôm nay chưa có bài đọc</h2>

            <Link
              to="/admin/reading"
              className="mt-5 inline-block font-black text-emerald-700">
              + Thêm bài đọc
            </Link>
          </div>
        )}
      </main>
    </>
  );
}

/**
 * MODE NAVIGATION
 */
function ModeTabs({ readingId, mode, preview }) {
  const icons = {
    learn: GraduationCap,
    read: BookOpenText,
    listen: Headphones,
    use: Pencil,
    test: Brain,
  };

  return (
    <div className="mt-6 grid grid-cols-5 gap-2 rounded-2xl bg-slate-100 p-1.5">
      {MODES.map((item) => {
        const Icon = icons[item.key];

        const active = mode === item.key;

        return (
          <Link
            key={item.key}
            to={`/reader?readingId=${readingId}&mode=${item.key}${
              preview ? "&preview=1" : ""
            }`}
            className={[
              "flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-black transition",
              active ? "bg-white text-emerald-700 shadow-sm" : "text-slate-400",
            ].join(" ")}>
            <Icon size={17} />

            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * LEARN MODE
 *
 * Highlight vocabulary và
 * cho phép tap để xem nghĩa.
 */
function LearnMode({ reading }) {
  const [selectedWord, setSelectedWord] = useState(null);

  const [showTranslation, setShowTranslation] = useState(false);

  return (
    <>
      <article className="soft-card mt-5 rounded-[2rem] p-6 sm:p-8">
        {/* HEADER */}
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.14em] text-emerald-600">
              Learn Mode
            </div>

            <p className="mt-1 text-xs font-semibold text-slate-400">
              Chạm vào từ được tô để xem nghĩa.
            </p>
          </div>

          <TtsButton text={reading.content} />
        </div>

        {/* ENGLISH */}
        <HighlightedReading
          content={reading.content}
          vocabulary={reading.lesson.vocabulary}
          onSelect={setSelectedWord}
        />

        {/* SELECTED WORD */}
        {selectedWord && (
          <div className="mt-6 rounded-3xl bg-emerald-50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-black text-emerald-900">
                  {selectedWord.word}
                </div>

                {selectedWord.ipa && (
                  <div className="mt-1 text-sm font-semibold text-slate-400">
                    {selectedWord.ipa}
                  </div>
                )}

                {selectedWord.partOfSpeech && (
                  <div className="mt-2 text-xs font-black uppercase text-emerald-600">
                    {selectedWord.partOfSpeech}
                  </div>
                )}
              </div>

              <TtsButton text={selectedWord.word} />
            </div>

            <div className="mt-4 font-semibold leading-7 text-slate-700">
              {selectedWord.meaning}
            </div>

            {selectedWord.note && (
              <div className="mt-3 text-sm font-semibold text-slate-500">
                {selectedWord.note}
              </div>
            )}
          </div>
        )}

        {/* VIETNAMESE TRANSLATION */}
        {reading.translation && (
          <div className="mt-7 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={() => setShowTranslation((value) => !value)}
              className={[
                "flex w-full items-center justify-between rounded-2xl px-4 py-4 text-left transition",
                showTranslation
                  ? "bg-blue-50 text-blue-800"
                  : "bg-slate-50 text-slate-700",
              ].join(" ")}>
              <div>
                <div className="font-black">
                  🇻🇳{" "}
                  {showTranslation
                    ? "Ẩn bản dịch tiếng Việt"
                    : "Xem bản dịch tiếng Việt"}
                </div>

                {!showTranslation && (
                  <div className="mt-1 text-xs font-semibold text-slate-400">
                    Chỉ mở khi bạn cần kiểm tra cách hiểu.
                  </div>
                )}
              </div>

              <span className="text-lg font-black">
                {showTranslation ? "−" : "+"}
              </span>
            </button>

            {showTranslation && (
              <div className="mt-4 rounded-3xl bg-blue-50/60 p-5">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">
                  Bản dịch
                </div>

                <div className="mt-3 whitespace-pre-wrap text-[16px] font-medium leading-8 text-slate-700">
                  {reading.translation}
                </div>
              </div>
            )}
          </div>
        )}
      </article>
    </>
  );
}

/**
 * READ MODE
 *
 * Không highlight.
 * Không nghĩa.
 * Chỉ context thật.
 */
function ReadMode({ reading }) {
  return (
    <article className="soft-card mt-5 rounded-[2rem] p-6 sm:p-8">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">
            Read Mode
          </div>

          <p className="mt-1 text-xs font-semibold text-slate-400">
            Không trợ giúp. Hãy đọc bằng ngữ cảnh.
          </p>
        </div>

        <TtsButton text={reading.content} />
      </div>

      <div className="whitespace-pre-wrap text-[17px] leading-8 text-slate-700">
        {reading.content}
      </div>
    </article>
  );
}

/**
 * LISTENING MODE
 *
 * Không hiện transcript trước.
 * Người học nghe câu → gõ từ nghe được.
 */
function ListeningMode({ reading, questions, questionIndex, preview }) {
  const actionData = useActionData();

  if (!questions.length) {
    return (
      <div className="soft-card mt-5 rounded-[2rem] p-8 text-center">
        <Headphones size={40} className="mx-auto text-blue-400" />

        <h2 className="mt-4 text-xl font-black">Chưa tạo được bài nghe</h2>

        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          Bài đọc chưa chứa trực tiếp các từ mục tiêu của lesson.
        </p>
      </div>
    );
  }

  const question = questions[questionIndex];

  const isFeedback =
    actionData?.type === "listening-answer" &&
    actionData?.vocabularyId === question.vocabularyId;

  const isLast = questionIndex === questions.length - 1;

  return (
    <article className="soft-card mt-5 rounded-[2rem] p-6 sm:p-8">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">
            Listening Mode
          </div>

          <h2 className="mt-2 text-xl font-black text-slate-900">
            Nghe trước. Đừng nhìn chữ.
          </h2>

          <p className="mt-1 text-sm font-semibold text-slate-400">
            Câu {questionIndex + 1}/{questions.length}
          </p>
        </div>

        <div className="rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
          DICTATION
        </div>
      </div>

      {!isFeedback ? (
        <ListeningForm question={question} />
      ) : (
        <ListeningFeedback
          result={actionData.result}
          question={question}
          readingId={reading.id}
          questionIndex={questionIndex}
          isLast={isLast}
        />
      )}
    </article>
  );
}

function SentenceAudioButton({ text, plays, setPlays }) {
  const maxPlays = 3;

  function speak() {
    if (plays >= maxPlays) {
      return;
    }

    /**
     * Dùng chung TTS settings
     * toàn ứng dụng.
     */
    const success = speakText(text);

    if (success) {
      setPlays((value) => value + 1);
    }
  }

  const exhausted = plays >= maxPlays;

  return (
    <button
      type="button"
      onClick={speak}
      disabled={exhausted}
      className={[
        "flex w-full items-center justify-center gap-3 rounded-3xl px-5 py-6 font-black transition",

        exhausted
          ? "bg-slate-100 text-slate-400"
          : "bg-blue-600 text-white hover:bg-blue-700",
      ].join(" ")}>
      {plays === 0 ? <Headphones size={24} /> : <RotateCcw size={22} />}

      {plays === 0
        ? "Nghe câu"
        : exhausted
        ? "Đã nghe 3 lần"
        : `Nghe lại · ${plays}/3`}
    </button>
  );
}
function ListeningForm({ question }) {
  const startRef = useRef(Date.now());

  const responseTimeRef = useRef(null);

  const [plays, setPlays] = useState(0);

  const [showHint, setShowHint] = useState(false);

  const [hintsUsed, setHintsUsed] = useState(0);

  function prepareSubmit() {
    if (responseTimeRef.current) {
      responseTimeRef.current.value = String(Date.now() - startRef.current);
    }
  }

  const hint = question.expectedAnswer
    ? `${question.expectedAnswer.charAt(0)}… · ${
        question.expectedAnswer.length
      } ký tự`
    : "";

  return (
    <div className="mt-6">
      {/* AUDIO */}
      <SentenceAudioButton
        text={question.sentence}
        plays={plays}
        setPlays={setPlays}
      />

      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4 text-center">
        <p className="text-sm font-bold text-slate-500">
          Nghe câu và gõ
          <span className="font-black text-slate-800"> từ mục tiêu </span>
          bạn nghe được.
        </p>

        <p className="mt-1 text-xs font-semibold text-slate-400">
          Transcript đang được ẩn.
        </p>
      </div>

      <Form method="post" onSubmit={prepareSubmit} className="mt-5">
        <input type="hidden" name="intent" value="listening-answer" />

        <input
          type="hidden"
          name="vocabularyId"
          value={question.vocabularyId}
        />

        <input
          type="hidden"
          name="expectedAnswer"
          value={question.expectedAnswer}
        />

        <input
          ref={responseTimeRef}
          type="hidden"
          name="responseTime"
          defaultValue="0"
        />

        <input type="hidden" name="hintsUsed" value={hintsUsed} />

        <input
          name="answer"
          autoComplete="off"
          autoCapitalize="none"
          autoFocus
          placeholder="Gõ từ bạn nghe được..."
          className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-lg font-bold outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />

        {showHint && (
          <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-700">
            Gợi ý: {hint}
          </div>
        )}

        <div className="mt-4 flex gap-3">
          {!showHint && (
            <button
              type="button"
              onClick={() => {
                setShowHint(true);

                setHintsUsed(1);
              }}
              className="flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-700">
              <Lightbulb size={17} />
              Gợi ý
            </button>
          )}

          <button
            type="submit"
            disabled={plays === 0}
            className="flex flex-1 items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
            Kiểm tra
          </button>
        </div>

        {plays === 0 && (
          <p className="mt-3 text-center text-xs font-bold text-slate-400">
            Hãy nghe ít nhất một lần trước khi trả lời.
          </p>
        )}
      </Form>
    </div>
  );
}

function ListeningFeedback({
  result,
  question,
  readingId,
  questionIndex,
  isLast,
  preview,
}) {
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div className="mt-6">
      {/* RESULT */}
      <div
        className={[
          "rounded-3xl p-5",
          result.correct ? "bg-emerald-50" : "bg-rose-50",
        ].join(" ")}>
        <div
          className={[
            "font-black",
            result.correct ? "text-emerald-700" : "text-rose-700",
          ].join(" ")}>
          {result.correct ? "✓ Nghe đúng" : "Chưa nhận ra từ này"}
        </div>

        {!result.correct && (
          <>
            <div className="mt-3 text-xs font-bold uppercase text-slate-400">
              Đáp án
            </div>

            <div className="mt-1 text-xl font-black text-slate-900">
              {result.correctAnswer}
            </div>
          </>
        )}

        <div className="mt-3 text-sm font-semibold text-slate-600">
          {question.meaning}
        </div>
      </div>

      {/* TRANSCRIPT */}
      <button
        type="button"
        onClick={() => setShowTranscript((value) => !value)}
        className="mt-4 flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-4 text-left">
        <div className="flex items-center gap-2 font-black text-slate-700">
          <Eye size={18} />

          {showTranscript ? "Ẩn transcript" : "Xem transcript"}
        </div>

        <span className="font-black text-slate-400">
          {showTranscript ? "−" : "+"}
        </span>
      </button>

      {showTranscript && (
        <div className="mt-3 rounded-2xl border border-slate-100 bg-white p-5">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">
            Transcript
          </div>

          <div className="mt-3 text-lg font-semibold leading-8 text-slate-800">
            {question.sentence}
          </div>

          <div className="mt-4">
            <TtsButton text={question.sentence} />
          </div>
        </div>
      )}

      {/* NEXT */}
      {isLast ? (
        <Link
          to={`/reader?readingId=${readingId}&mode=test${
            preview ? "&preview=1" : ""
          }`}
          className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-4 font-black text-white">
          Sang phần kiểm tra
          <ArrowRight size={18} />
        </Link>
      ) : (
        <Link
          to={`/reader?readingId=${readingId}&mode=listen&q=${
            questionIndex + 1
          }${preview ? "&preview=1" : ""}`}
          className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 font-black text-white">
          Câu nghe tiếp theo
          <ArrowRight size={18} />
        </Link>
      )}
    </div>
  );
}
function UsageMode({ reading, questions, questionIndex }) {
  const actionData = useActionData();

  if (!questions.length) {
    return (
      <div className="soft-card mt-5 rounded-[2rem] p-8 text-center">
        <Pencil size={38} className="mx-auto text-orange-400" />

        <h2 className="mt-4 text-xl font-black">Chưa có từ để luyện dùng</h2>

        <p className="mt-2 text-sm font-semibold text-slate-500">
          Reading hiện chưa chứa từ mục tiêu phù hợp.
        </p>
      </div>
    );
  }

  const question = questions[questionIndex];

  const isLast = questionIndex === questions.length - 1;

  const sameQuestion = actionData?.vocabularyId === question.vocabularyId;

  const result =
    sameQuestion && actionData?.type === "usage-evaluated"
      ? actionData.result
      : null;

  const apiError =
    sameQuestion && actionData?.type === "usage-error"
      ? actionData.error
      : null;

  return (
    <article className="soft-card mt-5 rounded-[2rem] p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.14em] text-orange-600">
            Usage Mode
          </div>

          <h2 className="mt-2 text-xl font-black text-slate-900">
            Tự tạo một câu mới.
          </h2>

          <p className="mt-1 text-sm font-bold text-slate-400">
            Từ {questionIndex + 1}/{questions.length}
          </p>
        </div>

        <div className="rounded-full bg-orange-50 px-3 py-2 text-xs font-black text-orange-700">
          AI CHECK
        </div>
      </div>

      <div className="mt-6 rounded-3xl bg-orange-50 p-5">
        <div className="text-xs font-black uppercase tracking-[0.14em] text-orange-500">
          Từ mục tiêu
        </div>

        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-black text-slate-900">
              {question.word}
            </div>

            {question.ipa && (
              <div className="mt-1 text-sm font-semibold text-slate-400">
                {question.ipa}
              </div>
            )}
          </div>

          <TtsButton text={question.word} />
        </div>

        <div className="mt-3 font-semibold leading-7 text-slate-600">
          {question.meaning}
        </div>
      </div>

      {!result && <UsageAIForm question={question} apiError={apiError} />}

      {result && (
        <UsageAIFeedback
          result={result}
          readingId={reading.id}
          questionIndex={questionIndex}
          isLast={isLast}
        />
      )}
    </article>
  );
}
function UsageAIForm({ question, apiError }) {
  const navigation = useNavigation();

  const startRef = useRef(Date.now());

  const responseTimeRef = useRef(null);

  const submitting = navigation.state === "submitting";

  function prepareSubmit() {
    if (responseTimeRef.current) {
      responseTimeRef.current.value = String(Date.now() - startRef.current);
    }
  }

  return (
    <Form method="post" onSubmit={prepareSubmit} className="mt-6">
      <input type="hidden" name="intent" value="usage-evaluate" />

      <input type="hidden" name="vocabularyId" value={question.vocabularyId} />

      <input
        ref={responseTimeRef}
        type="hidden"
        name="responseTime"
        defaultValue="0"
      />

      <label className="text-sm font-black text-slate-700">
        Viết một câu của riêng bạn
      </label>

      <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">
        Dùng từ trên theo đúng nghĩa đang học. AI sẽ kiểm tra nghĩa, ngữ pháp,
        collocation và độ tự nhiên.
      </p>

      <textarea
        name="answer"
        rows={4}
        required
        autoFocus
        autoComplete="off"
        placeholder={`Viết câu với "${question.word}"...`}
        className="mt-3 w-full rounded-2xl border border-slate-200 p-4 text-lg font-semibold leading-8 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
      />

      {apiError && (
        <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {apiError}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-4 font-black text-white disabled:cursor-wait disabled:opacity-60">
        {submitting ? "AI đang chấm..." : "✨ Chấm câu bằng AI"}
      </button>
    </Form>
  );
}
function UsageAIFeedback({ result, readingId, questionIndex, isLast }) {
  const evaluation = result.evaluation;

  const verdict = evaluation.verdict;

  const verdictStyle =
    verdict === "CORRECT"
      ? {
          box: "bg-emerald-50",
          text: "text-emerald-700",
          title: "✓ Câu đúng",
        }
      : verdict === "PARTIAL"
      ? {
          box: "bg-amber-50",
          text: "text-amber-700",
          title: "Gần đúng",
        }
      : {
          box: "bg-rose-50",
          text: "text-rose-700",
          title: "Cần sửa",
        };

  return (
    <div className="mt-6">
      <div className={`rounded-3xl p-5 ${verdictStyle.box}`}>
        <div className={`text-lg font-black ${verdictStyle.text}`}>
          {verdictStyle.title}
        </div>

        <p className="mt-2 font-semibold leading-6 text-slate-700">
          {evaluation.shortFeedback}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <UsageCheck label="Đúng nghĩa" ok={evaluation.meaningCorrect} />

        <UsageCheck label="Ngữ pháp" ok={evaluation.grammarCorrect} />

        <UsageCheck label="Tự nhiên" ok={evaluation.natural} />

        <UsageCheck label="Collocation" ok={evaluation.collocationCorrect} />
      </div>

      <div className="mt-4 rounded-3xl bg-slate-50 p-5">
        <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
          AI giải thích
        </div>

        <p className="mt-3 font-semibold leading-7 text-slate-700">
          {evaluation.vietnameseExplanation}
        </p>
      </div>

      {evaluation.correctedSentence && (
        <div className="mt-4 rounded-3xl border border-blue-100 bg-blue-50/50 p-5">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">
            Câu chuẩn
          </div>

          <div className="mt-3 text-lg font-black leading-8 text-slate-900">
            {evaluation.correctedSentence}
          </div>

          <div className="mt-4">
            <TtsButton text={evaluation.correctedSentence} />
          </div>
        </div>
      )}

      {result.recorded && (
        <div className="mt-4 text-center text-xs font-bold text-slate-400">
          Usage skill {Math.round(result.usage.before * 100)}% →{" "}
          {Math.round(result.usage.after * 100)}%
        </div>
      )}

      {isLast ? (
        <Link
          to={`/reader?readingId=${readingId}&mode=use&q=${questionIndex + 1}${
            preview ? "&preview=1" : ""
          }`}
          className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-4 font-black text-white">
          Sang phần kiểm tra
          <ArrowRight size={18} />
        </Link>
      ) : (
        <Link
          to={`/reader?readingId=${readingId}&mode=use&q=${questionIndex + 1}${
            preview ? "&preview=1" : ""
          }`}
          className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-4 font-black text-white">
          Từ tiếp theo
          <ArrowRight size={18} />
        </Link>
      )}
    </div>
  );
}
function UsageCheck({ label, ok }) {
  return (
    <div
      className={[
        "rounded-2xl px-4 py-3 text-sm font-black",
        ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
      ].join(" ")}>
      {ok ? "✓" : "✗"} {label}
    </div>
  );
}
/**
 * TEST MODE
 */
function TestMode({ reading, questions, questionIndex }) {
  const actionData = useActionData();

  if (!questions.length) {
    return (
      <div className="soft-card mt-5 rounded-[2rem] p-8 text-center">
        <Brain size={38} className="mx-auto text-violet-400" />

        <h2 className="mt-4 text-xl font-black">Chưa tạo được câu kiểm tra</h2>

        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          Bài đọc hiện chưa chứa trực tiếp các từ thuộc lesson này.
        </p>
      </div>
    );
  }

  const question = questions[questionIndex];

  const isFeedback =
    actionData?.type === "test-answer" &&
    actionData?.vocabularyId === question.vocabularyId;

  const isLast = questionIndex === questions.length - 1;

  return (
    <article className="soft-card mt-5 rounded-[2rem] p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-600">
            Test Mode
          </div>

          <div className="mt-1 text-sm font-bold text-slate-400">
            Câu {questionIndex + 1}/{questions.length}
          </div>
        </div>

        <div className="rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">
          CLOZE
        </div>
      </div>

      <div className="mt-6 text-xl font-black leading-9 text-slate-800">
        {question.prompt}
      </div>

      {!isFeedback ? (
        <TestForm question={question} />
      ) : (
        <TestFeedback
          result={actionData.result}
          question={question}
          readingId={reading.id}
          questionIndex={questionIndex}
          isLast={isLast}
        />
      )}
    </article>
  );
}

function TestForm({ question }) {
  const startRef = useRef(Date.now());

  const responseTimeRef = useRef(null);

  const [hintsUsed, setHintsUsed] = useState(0);

  const [showHint, setShowHint] = useState(false);

  function prepareSubmit() {
    if (responseTimeRef.current) {
      responseTimeRef.current.value = String(Date.now() - startRef.current);
    }
  }

  const hint = question.expectedAnswer
    ? `${question.expectedAnswer.charAt(0)}… · ${
        question.expectedAnswer.length
      } ký tự`
    : "";

  return (
    <Form method="post" onSubmit={prepareSubmit} className="mt-6">
      <input type="hidden" name="intent" value="test-answer" />

      <input type="hidden" name="vocabularyId" value={question.vocabularyId} />

      <input
        type="hidden"
        name="expectedAnswer"
        value={question.expectedAnswer}
      />

      <input
        ref={responseTimeRef}
        type="hidden"
        name="responseTime"
        defaultValue="0"
      />

      <input type="hidden" name="hintsUsed" value={hintsUsed} />

      <input
        name="answer"
        autoComplete="off"
        autoFocus
        placeholder="Gõ từ còn thiếu..."
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-lg font-bold outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
      />

      {showHint && (
        <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-700">
          Gợi ý: {hint}
        </div>
      )}

      <div className="mt-4 flex gap-3">
        {!showHint && (
          <button
            type="button"
            onClick={() => {
              setShowHint(true);

              setHintsUsed(1);
            }}
            className="flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-700">
            <Lightbulb size={17} />
            Gợi ý
          </button>
        )}

        <button
          type="submit"
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 font-black text-white">
          Kiểm tra
        </button>
      </div>
    </Form>
  );
}

function TestFeedback({ result, question, readingId, questionIndex, isLast }) {
  return (
    <div className="mt-6">
      <div
        className={[
          "rounded-3xl p-5",
          result.correct ? "bg-emerald-50" : "bg-rose-50",
        ].join(" ")}>
        <div
          className={[
            "font-black",
            result.correct ? "text-emerald-700" : "text-rose-700",
          ].join(" ")}>
          {result.correct ? "✓ Chính xác" : "Chưa đúng"}
        </div>

        {!result.correct && (
          <>
            <div className="mt-3 text-sm font-semibold text-slate-500">
              Đáp án đúng
            </div>

            <div className="mt-1 text-xl font-black text-slate-900">
              {result.correctAnswer}
            </div>
          </>
        )}

        <div className="mt-3 text-sm font-semibold text-slate-600">
          {question.meaning}
        </div>
      </div>

      {isLast ? (
        <Link
          to={`/reader?readingId=${readingId}&mode=test&q=${questionIndex + 1}${
            preview ? "&preview=1" : ""
          }`}
          className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-4 font-black text-white">
          Hoàn thành kiểm tra
          <CheckCircle2 size={18} />
        </Link>
      ) : (
        <Link
          to={`/reader?readingId=${readingId}&mode=test&q=${questionIndex + 1}${
            preview ? "&preview=1" : ""
          }`}
          className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-4 font-black text-white">
          Câu tiếp theo
          <ArrowRight size={18} />
        </Link>
      )}
    </div>
  );
}

/**
 * Highlight vocabulary
 * mà không dùng dangerouslySetInnerHTML.
 */
function HighlightedReading({ content, vocabulary, onSelect }) {
  const words = vocabulary
    .filter((item) => item.word)
    .sort((a, b) => b.word.length - a.word.length);

  if (!words.length) {
    return (
      <div className="whitespace-pre-wrap text-[17px] leading-8 text-slate-700">
        {content}
      </div>
    );
  }

  const escaped = words.map((item) =>
    item.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );

  const regex = new RegExp(
    `\\b(${escaped.join("|")})(?:s|es|ed|ing)?\\b`,
    "gi",
  );

  const elements = [];

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      elements.push(content.slice(lastIndex, match.index));
    }

    const surface = match[0];

    const lower = surface.toLocaleLowerCase("en-US");

    const vocabularyItem = words.find((item) => {
      const base = item.word.toLocaleLowerCase("en-US");

      return lower === base || lower.startsWith(base);
    });

    if (vocabularyItem) {
      elements.push(
        <button
          key={`${match.index}-${surface}`}
          type="button"
          onClick={() => onSelect(vocabularyItem)}
          className="rounded bg-emerald-100 px-1 font-black text-emerald-800 underline decoration-emerald-300 decoration-2 underline-offset-2">
          {surface}
        </button>,
      );
    } else {
      elements.push(surface);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    elements.push(content.slice(lastIndex));
  }

  return (
    <div className="whitespace-pre-wrap text-[17px] leading-8 text-slate-700">
      {elements}
    </div>
  );
}
