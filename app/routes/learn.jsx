import { json, redirect } from "@remix-run/node";

import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";

import {
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle2,
  Ear,
  Keyboard,
  Leaf,
  Link2,
  PenLine,
  Shuffle,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";

import { useEffect, useMemo, useState } from "react";

import DesktopHeader from "../components/DesktopHeader";
import FlashCard from "../components/FlashCard";
import TtsButton from "../components/TtsButton";

import { getDailyLearningQueue } from "../services/daily-learning.server";

import {
  getNewLearningState,
  gradeNewLearningAnswer,
  gradeNewLearningUsage,
  markNewWordExposed,
} from "../services/new-learning.server";

export async function loader() {
  const daily = await getDailyLearningQueue();
  const learning = await getNewLearningState(daily.sessionId);

  return json({
    sessionId: daily.sessionId,
    learning,
    workload: daily.workload,
  });
}

export async function action({ request }) {
  const form = await request.formData();

  const intent = String(form.get("intent") || "");
  const sessionId = String(form.get("sessionId") || "");
  const vocabularyId = String(form.get("vocabularyId") || "");

  if (!sessionId || !vocabularyId) {
    throw new Response("Missing session or vocabulary.", {
      status: 400,
    });
  }

  if (intent === "expose") {
    await markNewWordExposed({
      sessionId,
      vocabularyId,
    });

    return redirect("/learn");
  }

  if (intent === "answer") {
    const exerciseType = String(form.get("exerciseType") || "");
    const stage = String(form.get("stage") || "CORE");
    const answer = String(form.get("answer") || "").trim();
    const responseTime = Math.max(0, Number(form.get("responseTime") || 0));
    const hintsUsed = Math.max(0, Number(form.get("hintsUsed") || 0));

    if (!exerciseType || !answer) {
      throw new Response("Missing learning answer.", {
        status: 400,
      });
    }

    if (exerciseType === "USAGE") {
      try {
        const result = await gradeNewLearningUsage({
          sessionId,
          vocabularyId,
          answer,
          responseTime,
          hintsUsed,
        });

        return json({
          kind: "RESULT",
          ...result,
        });
      } catch (error) {
        console.error("New-learning usage evaluation failed:", error);

        return json(
          {
            kind: "USAGE_ERROR",
            error:
              "AI hiện chưa chấm được câu này. Tiến độ chưa bị mất, hãy thử lại sau một chút.",
          },
          {
            status: 503,
          },
        );
      }
    }

    const result = await gradeNewLearningAnswer({
      sessionId,
      vocabularyId,
      exerciseType,
      stage,
      answer,
      responseTime,
      hintsUsed,
    });

    return json({
      kind: "RESULT",
      ...result,
    });
  }

  throw new Response("Unknown learning action.", {
    status: 400,
  });
}

function getExerciseLabel(type) {
  switch (type) {
    case "RECOGNITION":
      return "NHẬN DIỆN";
    case "REVERSE_RECALL":
      return "TỰ NHỚ LẠI";
    case "SPELLING":
      return "GHI NHỚ MẶT CHỮ";
    case "LISTENING":
      return "NGHE NHẬN DIỆN";
    case "DICTATION":
      return "NGHE & VIẾT";
    case "CLOZE":
      return "ĐIỀN NGỮ CẢNH";
    case "COLLOCATION":
      return "COLLOCATION / CHUNK";
    case "CONFUSION":
      return "PHÂN BIỆT TỪ DỄ NHẦM";
    case "USAGE":
      return "TỰ ĐẶT CÂU";
    default:
      return type;
  }
}

function getExerciseIcon(type) {
  if (type === "LISTENING" || type === "DICTATION") {
    return <Ear size={17} />;
  }

  if (type === "SPELLING") {
    return <Keyboard size={17} />;
  }

  if (type === "COLLOCATION") {
    return <Link2 size={17} />;
  }

  if (type === "CONFUSION") {
    return <Shuffle size={17} />;
  }

  if (type === "USAGE") {
    return <PenLine size={17} />;
  }

  return <Target size={17} />;
}

function buildHints(word, exercise) {
  if (!word || !exercise || exercise.isFinal) {
    return [];
  }

  const hints = [];

  if (exercise.type === "COLLOCATION") {
    if (exercise.collocation?.meaning) {
      hints.push(exercise.collocation.meaning);
    }

    if (exercise.collocation?.example) {
      hints.push(exercise.collocation.example);
    }

    return hints;
  }

  if (exercise.type === "CONFUSION") {
    if (exercise.confusion?.difference) {
      hints.push(exercise.confusion.difference);
    }

    if (exercise.confusion?.otherExample) {
      hints.push(exercise.confusion.otherExample);
    }

    return hints;
  }

  if (exercise.type === "USAGE") {
    if (exercise.scaffold) {
      hints.push(`Bạn có thể dùng cụm: ${exercise.scaffold}`);
    }

    if (word.example) {
      hints.push(`Ví dụ tham khảo: ${word.example}`);
    }

    return hints;
  }

  if (word.word?.length > 1) {
    hints.push(
      `${word.word[0]}${" _".repeat(Math.max(1, word.word.length - 1))}`,
    );
  }

  if (word.ipa) {
    hints.push(word.ipa);
  }

  if (
    word.example &&
    exercise.type !== "CLOZE" &&
    exercise.type !== "RECOGNITION"
  ) {
    hints.push(word.example);
  }

  return hints;
}

function SkillChecks({ progress }) {
  if (!progress?.checks?.length) {
    return null;
  }

  return (
    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {progress.checks.map((item) => (
        <div
          key={item.key}
          className={[
            "rounded-2xl px-3 py-3 text-xs font-black",
            !item.required
              ? "bg-slate-50 text-slate-300"
              : item.passed
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-500",
          ].join(" ")}>
          <div className="flex items-center gap-2">
            <span>{item.passed ? "✓" : "○"}</span>
            <span>{item.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionProgress({ learning }) {
  const summary = learning.summary;

  if (!summary?.total) {
    return null;
  }

  const finalPhase = summary.phase === "FINAL";

  return (
    <div className="mb-5 rounded-[1.75rem] border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.12em] text-emerald-600">
            New Word Acquisition
          </div>

          <div className="mt-1 text-sm font-black text-slate-800">
            {finalPhase
              ? "Final Challenge"
              : `Nhóm ${summary.batchNumber}/${summary.batchCount}`}
          </div>

          <div className="mt-1 text-[11px] font-bold text-slate-400">
            {summary.coreReady}/{summary.total} từ đã qua phần luyện chính
          </div>
        </div>

        <div className="text-right">
          <div className="text-xl font-black text-emerald-700">
            {summary.mastered}/{summary.total}
          </div>
          <div className="text-[10px] font-bold text-slate-400">
            từ đã vượt Final Check
          </div>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-emerald-50">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${summary.percent}%` }}
        />
      </div>

      <div className="mt-2 text-right text-[11px] font-black text-emerald-600">
        {summary.percent}%
      </div>
    </div>
  );
}

function ResultCard({ result }) {
  const evaluation = result.usageEvaluation;

  return (
    <div
      className={[
        "soft-card rounded-[2rem] border p-7 text-center",
        result.correct ? "border-emerald-200" : "border-rose-200",
      ].join(" ")}>
      <div className="text-5xl">
        {result.wordMastered
          ? "🏆"
          : result.finalChallenge
          ? "🎯"
          : result.correct
          ? "🌱"
          : "🧠"}
      </div>

      <h1 className="mt-4 text-2xl font-black text-slate-900">
        {result.wordMastered
          ? "Final Challenge đã vượt qua"
          : result.finalChallenge
          ? result.correct
            ? "Checkpoint cuối đã đạt"
            : "Final Check chưa đạt"
          : result.correct
          ? result.independentPass
            ? "Tự nhớ được rồi"
            : "Đúng, nhưng vẫn cần hỏi lại"
          : "Chưa nhớ chắc"}
      </h1>

      <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
        {result.message}
      </p>

      {evaluation ? (
        <div className="mt-6 rounded-3xl bg-emerald-50 p-5 text-left">
          <div className="text-xs font-black uppercase tracking-wide text-emerald-700">
            AI Usage Feedback · {evaluation.verdict}
          </div>

          <div className="mt-3 text-sm font-black text-slate-800">
            {evaluation.shortFeedback}
          </div>

          {evaluation.vietnameseExplanation && (
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {evaluation.vietnameseExplanation}
            </p>
          )}

          {evaluation.correctedSentence && (
            <div className="mt-4 rounded-2xl bg-white p-4">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Câu gợi ý
              </div>
              <div className="mt-2 font-bold leading-6 text-slate-800">
                {evaluation.correctedSentence}
              </div>
              <div className="mt-3">
                <TtsButton
                  text={evaluation.correctedSentence}
                  label="Nghe câu"
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-3xl bg-emerald-50 p-5">
          <div className="text-xs font-black uppercase tracking-wide text-emerald-700">
            Đáp án
          </div>

          <div className="mt-2 text-3xl font-black text-slate-900">
            {result.correctAnswer}
          </div>

          <div className="mt-2 font-semibold text-slate-600">
            {result.meaning}
          </div>

          {result.example && (
            <div className="mt-4 text-sm font-semibold leading-6 text-slate-500">
              {result.example}
            </div>
          )}

          <div className="mt-4">
            <TtsButton text={result.word} label="Nghe lại" />
          </div>
        </div>
      )}

      {result.correct && Number.isFinite(result.quality) && (
        <div className="mt-4 text-xs font-bold text-slate-400">
          Chất lượng lần nhớ này: {Math.round(result.quality * 100)}%
        </div>
      )}

      <Link
        to="/learn"
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white">
        Câu tiếp theo
        <ArrowRight size={18} />
      </Link>
    </div>
  );
}

function ExposureCard({ learning, sessionId, submitting }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
  }, [learning.word?.id]);

  return (
    <>
      <div className="rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-bold leading-6 text-indigo-700">
        <strong>Vòng làm quen.</strong> Nhìn mặt chữ, nghe phát âm, thử đoán
        nghĩa rồi mới lật thẻ. Sau bước này Tisi còn bắt bạn tự gọi lại từ bằng
        nhiều dạng bài khác nhau.
      </div>

      <FlashCard word={learning.word} onReveal={() => setRevealed(true)} />

      <SkillChecks progress={learning.wordProgress} />

      {revealed ? (
        <Form method="post" className="mt-4">
          <input type="hidden" name="intent" value="expose" />
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="vocabularyId" value={learning.word.id} />

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white shadow-lg shadow-emerald-100 disabled:opacity-50">
            <Sparkles size={18} />
            {submitting ? "Đang chuẩn bị..." : "Đã xem kỹ · Bắt đầu luyện"}
            <ArrowRight size={18} />
          </button>
        </Form>
      ) : (
        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-400">
          Lật thẻ để xem nghĩa và ví dụ trước.
        </div>
      )}
    </>
  );
}

function ExerciseCard({ learning, sessionId, submitting, usageError }) {
  const exercise = learning.exercise;
  const word = learning.word;
  const exerciseKey = `${word.id}:${exercise.type}:${exercise.stage}:${
    learning.turn ?? 0
  }`;

  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [hintsUsed, setHintsUsed] = useState(0);
  const [spellingVisible, setSpellingVisible] = useState(
    exercise.type === "SPELLING",
  );

  const hints = useMemo(() => buildHints(word, exercise), [word, exercise]);

  useEffect(() => {
    setStartedAt(Date.now());
    setHintsUsed(0);

    if (exercise.type !== "SPELLING") {
      setSpellingVisible(false);
      return undefined;
    }

    setSpellingVisible(true);

    const timer = window.setTimeout(() => {
      setSpellingVisible(false);
      setStartedAt(Date.now());
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [exerciseKey, exercise.type]);

  function captureResponseTime(event) {
    const input = event.currentTarget.querySelector('[name="responseTime"]');

    if (input) {
      input.value = String(Math.max(0, Date.now() - startedAt));
    }
  }

  const choiceExercise = ["RECOGNITION", "LISTENING", "CONFUSION"].includes(
    exercise.type,
  );

  const typedExercise = [
    "REVERSE_RECALL",
    "SPELLING",
    "DICTATION",
    "CLOZE",
    "COLLOCATION",
  ].includes(exercise.type);

  return (
    <div className="soft-card rounded-[2rem] p-6 sm:p-7">
      {exercise.isFinal && (
        <div className="mb-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black leading-6 text-amber-800">
          <div className="flex items-center gap-2">
            <Trophy size={18} />
            FINAL CHALLENGE · Không gợi ý
          </div>
          <div className="mt-1 text-xs font-bold opacity-80">
            Nếu sai, kỹ năng tương ứng sẽ được mở lại để luyện thêm rồi mới kiểm
            tra lại.
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
          {getExerciseIcon(exercise.type)}
          {getExerciseLabel(exercise.type)}
        </div>

        <div className="text-xs font-black text-slate-400">
          {learning.wordProgress?.passed}/{learning.wordProgress?.total}
        </div>
      </div>

      {exercise.type === "RECOGNITION" && (
        <div className="mt-7 text-center">
          <div className="text-3xl font-black text-slate-900">{word.word}</div>
          {word.ipa && (
            <div className="mt-2 font-semibold text-slate-400">{word.ipa}</div>
          )}
          <div className="mt-5 text-sm font-black text-slate-500">
            Chọn nghĩa đúng
          </div>
        </div>
      )}

      {exercise.type === "REVERSE_RECALL" && (
        <div className="mt-7 text-center">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
            Không có đáp án lựa chọn
          </div>
          <div className="mt-3 text-2xl font-black leading-9 text-slate-900">
            {exercise.prompt}
          </div>
          <div className="mt-3 text-sm font-bold text-slate-500">
            Từ hoặc cụm tiếng Anh là gì?
          </div>
        </div>
      )}

      {exercise.type === "SPELLING" && (
        <div className="mt-7 text-center">
          {spellingVisible ? (
            <>
              <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                Nhìn kỹ rồi ghi nhớ
              </div>
              <div className="mt-3 text-4xl font-black text-slate-900">
                {word.word}
              </div>
              {word.ipa && (
                <div className="mt-2 font-semibold text-slate-400">
                  {word.ipa}
                </div>
              )}
              <div className="mt-5 text-sm font-bold text-slate-400">
                Từ sẽ ẩn sau một lát...
              </div>
            </>
          ) : (
            <>
              <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                Không nhìn đáp án
              </div>
              <div className="mt-3 text-xl font-black text-slate-900">
                Gõ lại từ vừa nhìn thấy
              </div>
            </>
          )}
        </div>
      )}

      {exercise.type === "LISTENING" && (
        <div className="mt-7 text-center">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
            Không nhìn từ
          </div>
          <div className="mt-3 text-xl font-black text-slate-900">
            Nghe và chọn mặt chữ đúng
          </div>
          <div className="mt-5">
            <TtsButton text={word.word} label="Nghe từ" />
          </div>
        </div>
      )}

      {exercise.type === "DICTATION" && (
        <div className="mt-7 text-center">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
            Dictation
          </div>
          <div className="mt-3 text-xl font-black text-slate-900">
            Nghe và gõ lại chính xác
          </div>
          <div className="mt-5">
            <TtsButton text={word.word} label="Nghe từ" />
          </div>
        </div>
      )}

      {exercise.type === "CLOZE" && (
        <div className="mt-7 text-center">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
            Dùng từ trong ngữ cảnh
          </div>
          <div className="mt-3 text-xl font-black leading-9 text-slate-900">
            {exercise.prompt}
          </div>
        </div>
      )}

      {exercise.type === "COLLOCATION" && (
        <div className="mt-7 text-center">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
            Hoàn thành collocation / chunk
          </div>
          <div className="mt-3 text-2xl font-black leading-9 text-slate-900">
            {exercise.prompt}
          </div>
          <div className="mt-3 text-sm font-bold text-slate-500">
            Điền phần còn thiếu để tạo cụm từ tự nhiên.
          </div>
        </div>
      )}

      {exercise.type === "CONFUSION" && (
        <div className="mt-7 text-center">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
            Phân biệt từ gần nghĩa / dễ nhầm
          </div>
          <div className="mt-3 text-xl font-black leading-9 text-slate-900">
            {exercise.prompt}
          </div>
        </div>
      )}

      {exercise.type === "USAGE" && (
        <div className="mt-7">
          <div className="text-center text-xs font-black uppercase tracking-[0.12em] text-slate-400">
            Productive Usage
          </div>
          <div className="mt-3 text-center text-xl font-black leading-9 text-slate-900">
            {exercise.prompt}
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-600">
            Không chép lại nguyên câu ví dụ. Hãy tạo một câu mới để chứng minh
            bạn thật sự gọi được từ ra khi cần dùng.
          </div>
        </div>
      )}

      {choiceExercise && (
        <Form method="post" className="mt-7" onSubmit={captureResponseTime}>
          <input type="hidden" name="intent" value="answer" />
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="vocabularyId" value={word.id} />
          <input type="hidden" name="exerciseType" value={exercise.type} />
          <input type="hidden" name="stage" value={exercise.stage || "CORE"} />
          <input type="hidden" name="responseTime" defaultValue="0" />
          <input type="hidden" name="hintsUsed" value="0" />

          <div className="grid gap-3">
            {exercise.options.map((option) => (
              <button
                key={option}
                type="submit"
                name="answer"
                value={option}
                disabled={submitting}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left font-black text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50">
                {option}
              </button>
            ))}
          </div>
        </Form>
      )}

      {typedExercise && !spellingVisible && (
        <Form method="post" className="mt-7" onSubmit={captureResponseTime}>
          <input type="hidden" name="intent" value="answer" />
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="vocabularyId" value={word.id} />
          <input type="hidden" name="exerciseType" value={exercise.type} />
          <input type="hidden" name="stage" value={exercise.stage || "CORE"} />
          <input type="hidden" name="responseTime" defaultValue="0" />
          <input type="hidden" name="hintsUsed" value={hintsUsed} />

          {hintsUsed > 0 && (
            <div className="mb-4 space-y-2">
              {hints.slice(0, hintsUsed).map((hint, index) => (
                <div
                  key={`${hint}-${index}`}
                  className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                  <strong>Gợi ý {index + 1}:</strong> {hint}
                </div>
              ))}
            </div>
          )}

          <input
            name="answer"
            required
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="w-full rounded-2xl border-2 border-emerald-100 bg-emerald-50/40 px-5 py-4 text-center text-xl font-black outline-none focus:border-emerald-400"
            placeholder="Gõ câu trả lời..."
          />

          <div className="mt-4 flex gap-3">
            {!exercise.isFinal && hintsUsed < hints.length && (
              <button
                type="button"
                onClick={() => setHintsUsed((current) => current + 1)}
                className="flex-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 font-black text-amber-800">
                💡 Gợi ý
              </button>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex-[1.4] rounded-2xl bg-emerald-600 px-4 py-4 font-black text-white disabled:opacity-50">
              {submitting ? "Đang chấm..." : "Kiểm tra"}
            </button>
          </div>

          {!exercise.isFinal && (
            <p className="mt-3 text-center text-[11px] font-semibold leading-5 text-slate-400">
              Đúng khi dùng gợi ý vẫn được ghi nhận, nhưng chưa tính là vượt
              checkpoint. Từ này sẽ quay lại sau.
            </p>
          )}
        </Form>
      )}

      {exercise.type === "USAGE" && (
        <Form method="post" className="mt-7" onSubmit={captureResponseTime}>
          <input type="hidden" name="intent" value="answer" />
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="vocabularyId" value={word.id} />
          <input type="hidden" name="exerciseType" value="USAGE" />
          <input type="hidden" name="stage" value="CORE" />
          <input type="hidden" name="responseTime" defaultValue="0" />
          <input type="hidden" name="hintsUsed" value={hintsUsed} />

          {usageError && (
            <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {usageError}
            </div>
          )}

          {hintsUsed > 0 && (
            <div className="mb-4 space-y-2">
              {hints.slice(0, hintsUsed).map((hint, index) => (
                <div
                  key={`${hint}-${index}`}
                  className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                  <strong>Gợi ý {index + 1}:</strong> {hint}
                </div>
              ))}
            </div>
          )}

          <textarea
            name="answer"
            required
            autoFocus
            autoComplete="off"
            autoCapitalize="sentences"
            spellCheck={false}
            rows={4}
            className="w-full resize-none rounded-2xl border-2 border-emerald-100 bg-emerald-50/40 px-5 py-4 text-base font-bold leading-7 outline-none focus:border-emerald-400"
            placeholder={`Viết một câu mới có “${word.word}”...`}
          />

          <div className="mt-4 flex gap-3">
            {hintsUsed < hints.length && (
              <button
                type="button"
                onClick={() => setHintsUsed((current) => current + 1)}
                className="flex-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 font-black text-amber-800">
                💡 Gợi ý
              </button>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex-[1.4] rounded-2xl bg-emerald-600 px-4 py-4 font-black text-white disabled:opacity-50">
              {submitting ? "AI đang chấm..." : "Chấm câu"}
            </button>
          </div>

          <p className="mt-3 text-center text-[11px] font-semibold leading-5 text-slate-400">
            Gemini chỉ chấm. Tisi mới là phần quyết định checkpoint và tiến độ.
            Dùng gợi ý thì câu đúng vẫn chưa qua Usage checkpoint.
          </p>
        </Form>
      )}

      <SkillChecks progress={learning.wordProgress} />
    </div>
  );
}

export default function Learn() {
  const { sessionId, learning, workload } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();

  const submitting = navigation.state === "submitting";
  const result = actionData?.kind === "RESULT" ? actionData : null;
  const usageError =
    actionData?.kind === "USAGE_ERROR" ? actionData.error : null;

  return (
    <>
      <DesktopHeader />

      <main className="page-shell max-w-xl pb-28">
        <div className="mb-5">
          <p className="text-sm font-black text-emerald-700">
            HỌC TỪ MỚI · INTENSIVE
          </p>

          <h1 className="mt-1 text-2xl font-black text-slate-900">
            Nhớ nghĩa, nhớ chữ, nghe ra và dùng được.
          </h1>

          <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
            Tisi trộn retrieval, spelling, listening, dictation, cloze,
            collocation, phân biệt từ dễ nhầm và tự đặt câu. Khi toàn bộ phần
            luyện chính hoàn tất, bạn còn phải vượt Final Challenge trước khi từ
            được bàn giao cho FSRS.
          </p>
        </div>

        <SessionProgress learning={learning} />

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

        {result ? (
          <ResultCard result={result} />
        ) : learning.mode === "EXPOSURE" ? (
          <ExposureCard
            learning={learning}
            sessionId={sessionId}
            submitting={submitting}
          />
        ) : learning.mode === "EXERCISE" || learning.mode === "FINAL" ? (
          <ExerciseCard
            learning={learning}
            sessionId={sessionId}
            submitting={submitting}
            usageError={usageError}
          />
        ) : learning.mode === "COMPLETE" ? (
          <div className="soft-card rounded-[2rem] p-8 text-center">
            <div className="text-5xl">🏁</div>

            <h2 className="mt-4 text-2xl font-black text-slate-900">
              Hoàn thành Intensive Acquisition
            </h2>

            <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
              Các từ hôm nay đã vượt cả phần học chính và Final Challenge. Từ
              đây FSRS tiếp quản việc nhắc lại dài hạn, còn SkillState giữ lại
              điểm yếu để Practice tiếp tục đánh đúng kỹ năng cần củng cố.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-3xl bg-emerald-50 p-5">
                <div className="text-3xl font-black text-emerald-700">
                  {learning.summary.coreReady}/{learning.summary.total}
                </div>
                <div className="mt-1 text-xs font-black text-emerald-600">
                  qua luyện chính
                </div>
              </div>

              <div className="rounded-3xl bg-amber-50 p-5">
                <div className="text-3xl font-black text-amber-700">
                  {learning.summary.mastered}/{learning.summary.total}
                </div>
                <div className="mt-1 text-xs font-black text-amber-600">
                  qua Final Check
                </div>
              </div>
            </div>

            <Link
              to="/"
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white">
              <CheckCircle2 size={18} />
              Tiếp tục lộ trình hôm nay
            </Link>
          </div>
        ) : (
          <div className="soft-card rounded-[2rem] p-8 text-center">
            <div className="text-4xl">🌿</div>

            <h2 className="mt-3 text-xl font-black text-slate-900">
              Hôm nay không có từ mới
            </h2>

            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              Daily Session hiện không giao thêm từ mới. Bạn có thể tiếp tục ôn
              hoặc luyện các từ yếu.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <Link
                to="/review"
                className="rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white">
                Sang phần ôn
              </Link>

              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-5 py-4 font-black text-slate-600">
                <ArrowLeft size={18} />
                Về hôm nay
              </Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
