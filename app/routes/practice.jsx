import { json } from "@remix-run/node";

import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";

import { useEffect, useState } from "react";

import DesktopHeader from "../components/DesktopHeader";
import TtsButton from "../components/TtsButton";

import {
  getAdaptiveExercise,
  gradeAdaptiveAnswer,
} from "../services/adaptive-learning.server";

export async function loader() {
  const exercise = await getAdaptiveExercise();

  return json({
    exercise,
  });
}

export async function action({ request }) {
  const form = await request.formData();

  const vocabularyId = String(form.get("vocabularyId") || "");

  const exerciseType = String(form.get("exerciseType") || "REVERSE_RECALL");

  const answer = String(form.get("answer") || "").trim();

  const expectedAnswer = String(form.get("expectedAnswer") || "");

  const responseTime = Math.max(0, Number(form.get("responseTime") || 0));

  const hintsUsed = Math.max(0, Number(form.get("hintsUsed") || 0));

  const result = await gradeAdaptiveAnswer({
    vocabularyId,
    exerciseType,
    answer,
    expectedAnswer,
    responseTime,
    hintsUsed,
  });

  return json(result);
}

function getExerciseLabel(type) {
  switch (type) {
    case "REVERSE_RECALL":
      return "NHỚ LẠI TỪ";

    case "DICTATION":
      return "NGHE & VIẾT";

    case "CLOZE":
      return "ĐIỀN NGỮ CẢNH";

    default:
      return type;
  }
}

function getSkillLabel(skill) {
  switch (skill) {
    case "meaningRecall":
      return "Khả năng nhớ nghĩa";

    case "spelling":
      return "Chính tả";

    case "listening":
      return "Nghe";

    case "usage":
      return "Sử dụng từ";

    default:
      return skill;
  }
}

function buildHints(exercise) {
  const hints = [];

  if (!exercise) return hints;

  const word = exercise.word;

  /**
   * Hint 1:
   * chữ đầu + độ dài tương đối
   */
  if (word?.length > 1) {
    hints.push(`${word[0]}${" _".repeat(Math.max(1, word.length - 1))}`);
  }

  /**
   * Hint 2:
   * IPA
   */
  if (exercise.ipa) {
    hints.push(exercise.ipa);
  }

  /**
   * Hint 3:
   * example
   */
  if (exercise.example) {
    hints.push(exercise.example);
  }

  return hints;
}

export default function Practice() {
  const { exercise } = useLoaderData();

  const result = useActionData();

  const navigation = useNavigation();

  const [startedAt, setStartedAt] = useState(() => Date.now());

  const [hintsUsed, setHintsUsed] = useState(0);

  const hints = buildHints(exercise);

  useEffect(() => {
    setStartedAt(Date.now());
    setHintsUsed(0);
  }, [exercise?.id]);

  if (!exercise) {
    return (
      <>
        <DesktopHeader />

        <main className="page-shell max-w-xl">
          <div className="soft-card rounded-3xl p-8 text-center">
            Chưa có từ để luyện.
          </div>
        </main>
      </>
    );
  }

  const submitting = navigation.state === "submitting";

  /**
   * Sau khi submit thì hiển thị kết quả.
   * User chủ động bấm câu tiếp theo.
   */
  if (result) {
    return (
      <>
        <DesktopHeader />

        <main className="page-shell max-w-xl pb-28">
          <div
            className={`soft-card rounded-[2rem] p-7 text-center ${
              result.correct
                ? "border border-emerald-200"
                : "border border-rose-200"
            }`}>
            <div className="text-5xl">{result.correct ? "🌱" : "🧠"}</div>

            <h1 className="mt-4 text-2xl font-black">
              {result.correct ? "Chính xác!" : "Chưa nhớ chắc."}
            </h1>

            {result.correct ? (
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Chất lượng ghi nhớ:{" "}
                <strong className="text-emerald-700">
                  {Math.round(result.quality * 100)}%
                </strong>
              </p>
            ) : (
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Không sao, từ này sẽ được hệ thống ưu tiên luyện lại.
              </p>
            )}

            <div className="mt-7 rounded-3xl bg-emerald-50 p-5">
              <div className="text-xs font-black uppercase tracking-wide text-emerald-700">
                Đáp án
              </div>

              <div className="mt-2 text-3xl font-black">
                {result.correctAnswer}
              </div>

              <div className="mt-2 font-semibold text-slate-600">
                {result.meaning}
              </div>

              {result.example && (
                <div className="mt-4 text-sm leading-6 text-slate-500">
                  {result.example}
                </div>
              )}

              <div className="mt-4">
                <TtsButton text={result.word} />
              </div>
            </div>

            <Link
              to="/practice"
              className="mt-6 block w-full rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white">
              Câu tiếp theo →
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <DesktopHeader />

      <main className="page-shell max-w-xl pb-28">
        <p className="text-sm font-black text-emerald-700">ADAPTIVE PRACTICE</p>

        <h1 className="mt-1 text-2xl font-black">Gọi lại từ từ trí nhớ</h1>

        <p className="mt-2 text-sm font-semibold text-slate-500">
          Hệ thống đang ưu tiên:{" "}
          <span className="text-emerald-700">
            {getSkillLabel(exercise.weakestSkill)}
          </span>
        </p>

        <Form
          method="post"
          className="soft-card mt-5 rounded-[2rem] p-6"
          onSubmit={(event) => {
            const elapsed = Date.now() - startedAt;

            const input = event.currentTarget.querySelector(
              '[name="responseTime"]',
            );

            if (input) {
              input.value = String(elapsed);
            }
          }}>
          <input type="hidden" name="vocabularyId" value={exercise.id} />

          <input type="hidden" name="exerciseType" value={exercise.type} />

          <input
            type="hidden"
            name="expectedAnswer"
            value={exercise.expectedAnswer}
          />

          <input type="hidden" name="responseTime" defaultValue="0" />

          <input type="hidden" name="hintsUsed" value={hintsUsed} />

          <div className="text-center">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
              {getExerciseLabel(exercise.type)}
            </span>

            <div className="mt-7 text-2xl font-black leading-9">
              {exercise.prompt}
            </div>

            {exercise.type === "DICTATION" && (
              <div className="mt-6">
                <TtsButton text={exercise.word} />
              </div>
            )}
          </div>

          {hintsUsed > 0 && (
            <div className="mt-7 space-y-3">
              {hints.slice(0, hintsUsed).map((hint, index) => (
                <div
                  key={index}
                  className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                  <span className="mr-2 font-black">Gợi ý {index + 1}:</span>

                  {hint}
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
            className="mt-8 w-full rounded-2xl border-2 border-emerald-100 bg-emerald-50/40 px-5 py-4 text-center text-xl font-black outline-none focus:border-emerald-400"
            placeholder="Gõ câu trả lời..."
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
              disabled={submitting}
              className="flex-[2] rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white disabled:opacity-60">
              {submitting ? "Đang kiểm tra..." : "Kiểm tra"}
            </button>
          </div>
        </Form>

        <div className="mt-4 text-center text-xs font-semibold text-slate-400">
          Trả lời nhanh và không dùng gợi ý sẽ được đánh giá cao hơn.
        </div>
      </main>
    </>
  );
}
