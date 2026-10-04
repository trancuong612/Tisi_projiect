import { json, redirect } from "@remix-run/node";

import { Form, Link, useLoaderData, useNavigation } from "@remix-run/react";

import { BookOpenText, Check, Pencil, Search, Trash2, X } from "lucide-react";

import { useState } from "react";

import { prisma } from "../utils/db.server";

import DesktopHeader from "../components/DesktopHeader";
import TtsButton from "../components/TtsButton";

const VOCABULARY_KINDS = [
  "WORD",
  "PHRASE",
  "PHRASAL_VERB",
  "COLLOCATION",
  "IDIOM",
];

const KIND_LABELS = {
  WORD: "Từ",
  PHRASE: "Cụm từ",
  PHRASAL_VERB: "Phrasal verb",
  COLLOCATION: "Collocation",
  IDIOM: "Idiom",
};

function normalizeWord(value = "") {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function cleanOptional(value) {
  const text = String(value || "").trim();

  return text || null;
}

function safeReturnTo(value) {
  const path = String(value || "");

  return path.startsWith("/words") ? path : "/words";
}

/**
 * DailySession lưu target bằng JSON,
 * không có foreign key.
 *
 * Vì vậy khi xóa vocabulary,
 * cần loại ID khỏi queue.
 */
function removeVocabularyFromTargets(value, vocabularyId) {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.filter((item) => {
    if (typeof item === "string") {
      return item !== vocabularyId;
    }

    if (item && typeof item === "object") {
      const id = item.id || item.vocabularyId;

      return id !== vocabularyId;
    }

    return true;
  });
}

export async function loader({ request }) {
  const url = new URL(request.url);

  const q = url.searchParams.get("q")?.trim() || "";

  const requestedKind = url.searchParams.get("kind") || "ALL";

  const kind = VOCABULARY_KINDS.includes(requestedKind) ? requestedKind : "ALL";

  const where = {
    AND: [
      q
        ? {
            OR: [
              {
                word: {
                  contains: q,
                  mode: "insensitive",
                },
              },

              {
                meaning: {
                  contains: q,
                  mode: "insensitive",
                },
              },

              {
                example: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {},

      kind !== "ALL"
        ? {
            kind,
          }
        : {},
    ],
  };

  const [words, lessons, total] = await Promise.all([
    prisma.vocabulary.findMany({
      where,

      include: {
        skill: true,
        memory: true,

        lesson: {
          include: {
            week: true,
          },
        },

        _count: {
          select: {
            reviews: true,
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },

      take: 300,
    }),

    prisma.lesson.findMany({
      include: {
        week: true,
      },

      orderBy: [
        {
          week: {
            number: "asc",
          },
        },

        {
          position: "asc",
        },
      ],
    }),

    prisma.vocabulary.count(),
  ]);

  return json({
    words,
    lessons,
    q,
    kind,
    total,
  });
}

export async function action({ request }) {
  const form = await request.formData();

  const intent = String(form.get("intent") || "");

  const vocabularyId = String(form.get("vocabularyId") || "");

  const returnTo = safeReturnTo(form.get("returnTo"));

  if (!vocabularyId) {
    throw new Response("Vocabulary ID is required.", {
      status: 400,
    });
  }

  /**
   * UPDATE
   */
  if (intent === "update") {
    const word = String(form.get("word") || "").trim();

    const meaning = String(form.get("meaning") || "").trim();

    if (!word) {
      throw new Response("Word is required.", {
        status: 400,
      });
    }

    if (!meaning) {
      throw new Response("Meaning is required.", {
        status: 400,
      });
    }

    const requestedKind = String(form.get("kind") || "WORD");

    const kind = VOCABULARY_KINDS.includes(requestedKind)
      ? requestedKind
      : "WORD";

    const requestedImportance = Number(form.get("importance") || 1);

    const importance = Math.max(
      1,
      Math.min(
        5,
        Number.isFinite(requestedImportance) ? requestedImportance : 1,
      ),
    );

    const lessonValue = String(form.get("lessonId") || "");

    const lessonId = lessonValue || null;

    const existing = await prisma.vocabulary.findUnique({
      where: {
        id: vocabularyId,
      },

      select: {
        normalized: true,
        meaning: true,
      },
    });

    if (!existing) {
      throw new Response("Vocabulary not found.", {
        status: 404,
      });
    }

    const normalized = normalizeWord(word);

    /**
     * Nếu lexical identity
     * thay đổi thì AI insight
     * cũ không còn đáng tin.
     */
    const lexicalChanged =
      existing.normalized !== normalized || existing.meaning.trim() !== meaning;

    await prisma.$transaction(async (tx) => {
      await tx.vocabulary.update({
        where: {
          id: vocabularyId,
        },

        data: {
          word,
          normalized,

          kind,

          ipa: cleanOptional(form.get("ipa")),

          partOfSpeech: cleanOptional(form.get("partOfSpeech")),

          meaning,

          example: cleanOptional(form.get("example")),

          note: cleanOptional(form.get("note")),

          importance,

          lessonId,
        },
      });

      if (lexicalChanged) {
        await tx.vocabularyInsight.deleteMany({
          where: {
            vocabularyId,
          },
        });
      }
    });

    return redirect(returnTo);
  }

  /**
   * DELETE
   */
  if (intent === "delete") {
    await prisma.$transaction(async (tx) => {
      const word = await tx.vocabulary.findUnique({
        where: {
          id: vocabularyId,
        },

        select: {
          id: true,
        },
      });

      if (!word) {
        throw new Response("Vocabulary not found.", {
          status: 404,
        });
      }

      /**
       * Các relation:
       * MemoryState
       * SkillState
       * ReviewLog
       * VocabularyInsight
       *
       * được Prisma cascade.
       */
      await tx.vocabulary.delete({
        where: {
          id: vocabularyId,
        },
      });

      /**
       * DailySession là JSON,
       * nên phải cleanup thủ công.
       */
      const sessions = await tx.dailySession.findMany({
        select: {
          id: true,

          dueTargets: true,

          relearningTargets: true,

          newTargets: true,

          weakTargets: true,
        },
      });

      for (const session of sessions) {
        await tx.dailySession.update({
          where: {
            id: session.id,
          },

          data: {
            dueTargets: removeVocabularyFromTargets(
              session.dueTargets,
              vocabularyId,
            ),

            relearningTargets: removeVocabularyFromTargets(
              session.relearningTargets,
              vocabularyId,
            ),

            newTargets: removeVocabularyFromTargets(
              session.newTargets,
              vocabularyId,
            ),

            weakTargets: removeVocabularyFromTargets(
              session.weakTargets,
              vocabularyId,
            ),
          },
        });
      }
    });

    return redirect(returnTo);
  }

  throw new Response("Unknown intent.", {
    status: 400,
  });
}

export default function Words() {
  const { words, lessons, q, kind, total } = useLoaderData();

  const navigation = useNavigation();

  const currentUrl =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/words";

  return (
    <>
      <DesktopHeader />

      <main className="page-shell pb-28">
        {/* HEADER */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-black text-emerald-700">
              THƯ VIỆN CÁ NHÂN
            </p>

            <h1 className="text-3xl font-black text-slate-900">Từ vựng</h1>

            <p className="mt-2 text-sm font-semibold text-slate-400">
              Đang hiển thị {words.length} / {total} mục
            </p>
          </div>

          <Link
            to="/admin/import"
            className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">
            + Nhập từ
          </Link>
        </div>

        {/* SEARCH + FILTER */}
        <Form
          method="get"
          className="mt-5 grid gap-3 sm:grid-cols-[1fr_220px_auto]">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
            />

            <input
              name="q"
              defaultValue={q}
              placeholder="Tìm từ, nghĩa hoặc ví dụ..."
              className="w-full rounded-2xl border border-emerald-100 bg-white py-4 pl-11 pr-4 outline-none focus:border-emerald-400"
            />
          </div>

          <select
            name="kind"
            defaultValue={kind}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-4 font-bold text-slate-600 outline-none focus:border-emerald-400">
            <option value="ALL">Tất cả loại</option>

            {VOCABULARY_KINDS.map((item) => (
              <option key={item} value={item}>
                {KIND_LABELS[item]}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="rounded-2xl bg-slate-900 px-5 py-4 font-black text-white">
            Lọc
          </button>
        </Form>

        {(q || kind !== "ALL") && (
          <div className="mt-3">
            <Link
              to="/words"
              className="text-sm font-black text-slate-400 hover:text-emerald-700">
              × Xóa bộ lọc
            </Link>
          </div>
        )}

        {/* EMPTY */}
        {!words.length && (
          <div className="soft-card mt-6 rounded-[2rem] p-8 text-center">
            <BookOpenText size={32} className="mx-auto text-slate-300" />

            <h2 className="mt-4 text-xl font-black text-slate-800">
              Không tìm thấy từ
            </h2>

            <p className="mt-2 text-sm font-semibold text-slate-400">
              Thử từ khóa hoặc bộ lọc khác.
            </p>
          </div>
        )}

        {/* WORD CARDS */}
        <div className="mt-5 grid items-start gap-3 md:grid-cols-2">
          {words.map((word) => (
            <WordCard
              key={word.id}
              word={word}
              lessons={lessons}
              returnTo={currentUrl}
              submitting={navigation.state === "submitting"}
            />
          ))}
        </div>
      </main>
    </>
  );
}

function WordCard({ word, lessons, returnTo, submitting }) {
  const [editing, setEditing] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const mastery = Math.round(
    Math.max(0, Math.min(1, word.skill?.meaningRecall || 0)) * 100,
  );

  return (
    <article className="soft-card rounded-2xl p-5">
      {!editing ? (
        <>
          {/* WORD HEADER */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words text-xl font-black text-slate-900">
                  {word.word}
                </h2>

                <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase text-slate-500">
                  {KIND_LABELS[word.kind]}
                </span>
              </div>

              <p className="mt-1 text-sm text-slate-400">
                {word.ipa || ""}

                {word.partOfSpeech
                  ? `${word.ipa ? " · " : ""}${word.partOfSpeech}`
                  : ""}
              </p>
            </div>

            <TtsButton text={word.word} />
          </div>

          {/* MEANING */}
          <p className="mt-3 font-bold leading-6 text-emerald-800">
            {word.meaning}
          </p>

          {/* EXAMPLE */}
          {word.example && (
            <div className="mt-3 rounded-2xl bg-slate-50 p-4">
              <p className="text-sm leading-6 text-slate-600">{word.example}</p>

              <div className="mt-3">
                <TtsButton
                  text={word.example}
                  label="Nghe ví dụ"
                  showSettings={false}
                />
              </div>
            </div>
          )}

          {/* LESSON */}
          {word.lesson && (
            <div className="mt-3 text-xs font-bold text-slate-400">
              Tuần {word.lesson.week.number}
              {" · "}
              {word.lesson.dayLabel || word.lesson.day}
            </div>
          )}

          {/* MASTERY */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
              <span>Nhớ nghĩa</span>

              <span>{mastery}%</span>
            </div>

            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-emerald-500"
                style={{
                  width: `${Math.max(4, mastery)}%`,
                }}
              />
            </div>
          </div>

          {/* META */}
          <div className="mt-3 text-[10px] font-bold text-slate-300">
            {word._count.reviews} lượt luyện
          </div>

          {/* ACTIONS */}
          <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => {
                setEditing(true);

                setConfirmingDelete(false);
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-black text-slate-600 transition hover:bg-slate-200">
              <Pencil size={15} />
              Sửa
            </button>

            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(true);

                setEditing(false);
              }}
              className="flex items-center justify-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-black text-rose-600 transition hover:bg-rose-100">
              <Trash2 size={15} />
              Xóa
            </button>
          </div>
        </>
      ) : (
        <EditWordForm
          word={word}
          lessons={lessons}
          returnTo={returnTo}
          submitting={submitting}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* DELETE CONFIRM */}
      {confirmingDelete && !editing && (
        <div className="mt-4 rounded-2xl bg-rose-50 p-4">
          <div className="font-black text-rose-800">Xóa “{word.word}”?</div>

          <p className="mt-2 text-xs font-semibold leading-5 text-rose-700">
            Thao tác này cũng xóa tiến trình ghi nhớ, điểm kỹ năng, lịch sử
            luyện tập và Word Connections của từ này.
          </p>

          {word._count.reviews > 0 && (
            <p className="mt-2 text-xs font-black text-rose-700">
              Có {word._count.reviews} ReviewLog sẽ bị xóa.
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-black text-slate-600">
              <X size={15} />
              Hủy
            </button>

            <Form method="post" className="flex-1">
              <input type="hidden" name="intent" value="delete" />

              <input type="hidden" name="vocabularyId" value={word.id} />

              <input type="hidden" name="returnTo" value={returnTo} />

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-black text-white disabled:opacity-50">
                <Trash2 size={15} />
                Xóa từ
              </button>
            </Form>
          </div>
        </div>
      )}
    </article>
  );
}

function EditWordForm({ word, lessons, returnTo, submitting, onCancel }) {
  return (
    <Form method="post" className="space-y-4">
      <input type="hidden" name="intent" value="update" />

      <input type="hidden" name="vocabularyId" value={word.id} />

      <input type="hidden" name="returnTo" value={returnTo} />

      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.12em] text-emerald-600">
            Chỉnh sửa
          </div>

          <div className="mt-1 font-black text-slate-900">{word.word}</div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <X size={16} />
        </button>
      </div>

      <Field
        label="Từ / cụm từ"
        name="word"
        defaultValue={word.word}
        required
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="IPA" name="ipa" defaultValue={word.ipa || ""} />

        <Field
          label="Từ loại"
          name="partOfSpeech"
          defaultValue={word.partOfSpeech || ""}
        />
      </div>

      <label className="block">
        <span className="text-xs font-black text-slate-600">
          Loại vocabulary
        </span>

        <select
          name="kind"
          defaultValue={word.kind}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400">
          {VOCABULARY_KINDS.map((item) => (
            <option key={item} value={item}>
              {KIND_LABELS[item]}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-black text-slate-600">Nghĩa</span>

        <textarea
          name="meaning"
          defaultValue={word.meaning}
          required
          rows={2}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400"
        />
      </label>

      <label className="block">
        <span className="text-xs font-black text-slate-600">Ví dụ</span>

        <textarea
          name="example"
          defaultValue={word.example || ""}
          rows={3}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400"
        />
      </label>

      <label className="block">
        <span className="text-xs font-black text-slate-600">Ghi chú</span>

        <textarea
          name="note"
          defaultValue={word.note || ""}
          rows={2}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-black text-slate-600">Importance</span>

          <select
            name="importance"
            defaultValue={word.importance || 1}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none">
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-black text-slate-600">Lesson</span>

          <select
            name="lessonId"
            defaultValue={word.lessonId || ""}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none">
            <option value="">Không gắn lesson</option>

            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                Tuần {lesson.week.number}
                {" · "}
                {lesson.dayLabel || lesson.day}
                {lesson.title ? ` · ${lesson.title}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-xl bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-700">
        💡 Sửa nội dung từ sẽ không reset tiến trình FSRS hoặc điểm kỹ năng. Nếu
        từ/nghĩa thay đổi, Word Connections cũ sẽ được xóa để có thể tạo lại
        chính xác.
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-black text-white disabled:opacity-50">
        <Check size={17} />

        {submitting ? "Đang lưu..." : "Lưu thay đổi"}
      </button>
    </Form>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-slate-600">{label}</span>

      <input
        {...props}
        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400"
      />
    </label>
  );
}
