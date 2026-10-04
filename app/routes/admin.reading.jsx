import { json, redirect } from "@remix-run/node";

import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";

import {
  BookOpenText,
  Check,
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { useState } from "react";

import { prisma } from "../utils/db.server";

import DesktopHeader from "../components/DesktopHeader";

function cleanOptional(value) {
  const text = String(value || "").trim();

  return text || null;
}

/**
 * DailySession lưu reading ID
 * trong JSON chứ không phải FK.
 */
function removeReadingFromTargets(value, readingId) {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.filter((item) => {
    if (typeof item === "string") {
      return item !== readingId;
    }

    if (item && typeof item === "object") {
      const id = item.id || item.readingId;

      return id !== readingId;
    }

    return true;
  });
}

async function cleanupReadingFromSessions(tx, readingId) {
  const sessions = await tx.dailySession.findMany({
    select: {
      id: true,
      readingTargets: true,
      completedReadingTargets: true,
    },
  });

  for (const session of sessions) {
    await tx.dailySession.update({
      where: {
        id: session.id,
      },

      data: {
        readingTargets: removeReadingFromTargets(
          session.readingTargets,
          readingId,
        ),

        completedReadingTargets: removeReadingFromTargets(
          session.completedReadingTargets,
          readingId,
        ),
      },
    });
  }
}

export async function loader({ request }) {
  const url = new URL(request.url);

  const q = url.searchParams.get("q")?.trim() || "";

  const [readings, lessons] = await Promise.all([
    prisma.reading.findMany({
      where: q
        ? {
            OR: [
              {
                title: {
                  contains: q,
                  mode: "insensitive",
                },
              },

              {
                content: {
                  contains: q,
                  mode: "insensitive",
                },
              },

              {
                translation: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {},

      include: {
        lesson: {
          include: {
            week: true,
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    }),

    prisma.lesson.findMany({
      include: {
        week: true,

        reading: {
          select: {
            id: true,
            title: true,
          },
        },
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
  ]);

  return json({
    readings,
    lessons,
    q,
  });
}

export async function action({ request }) {
  const form = await request.formData();

  const intent = String(form.get("intent") || "");

  /**
   * CREATE
   */
  if (intent === "create") {
    const lessonId = String(form.get("lessonId") || "");

    const title = String(form.get("title") || "").trim();

    const content = String(form.get("content") || "").trim();

    const translation = cleanOptional(form.get("translation"));

    if (!lessonId || !title || !content) {
      return json(
        {
          ok: false,
          error: "Vui lòng chọn lesson và nhập đầy đủ tiêu đề, nội dung.",
        },
        {
          status: 400,
        },
      );
    }

    const lesson = await prisma.lesson.findUnique({
      where: {
        id: lessonId,
      },

      include: {
        reading: true,
      },
    });

    if (!lesson) {
      return json(
        {
          ok: false,
          error: "Lesson không tồn tại.",
        },
        {
          status: 404,
        },
      );
    }

    /**
     * Reading.lessonId @unique
     */
    if (lesson.reading) {
      return json(
        {
          ok: false,
          error:
            "Lesson này đã có bài đọc. Hãy sửa bài hiện tại thay vì tạo thêm.",
        },
        {
          status: 400,
        },
      );
    }

    await prisma.reading.create({
      data: {
        lessonId,
        title,
        content,
        translation,
      },
    });

    return redirect("/admin/reading");
  }

  const readingId = String(form.get("readingId") || "");

  if (!readingId) {
    return json(
      {
        ok: false,
        error: "Thiếu Reading ID.",
      },
      {
        status: 400,
      },
    );
  }

  /**
   * UPDATE
   */
  if (intent === "update") {
    const lessonId = String(form.get("lessonId") || "");

    const title = String(form.get("title") || "").trim();

    const content = String(form.get("content") || "").trim();

    const translation = cleanOptional(form.get("translation"));

    if (!lessonId || !title || !content) {
      return json(
        {
          ok: false,
          error: "Lesson, tiêu đề và nội dung không được để trống.",
        },
        {
          status: 400,
        },
      );
    }

    const existing = await prisma.reading.findUnique({
      where: {
        id: readingId,
      },
    });

    if (!existing) {
      return json(
        {
          ok: false,
          error: "Không tìm thấy bài đọc.",
        },
        {
          status: 404,
        },
      );
    }

    /**
     * Chặn chuyển sang lesson
     * đã có Reading khác.
     */
    const occupied = await prisma.reading.findFirst({
      where: {
        lessonId,

        id: {
          not: readingId,
        },
      },

      select: {
        id: true,
        title: true,
      },
    });

    if (occupied) {
      return json(
        {
          ok: false,
          error: `Lesson được chọn đã có bài đọc "${occupied.title}".`,
        },
        {
          status: 400,
        },
      );
    }

    const lessonChanged = existing.lessonId !== lessonId;

    await prisma.$transaction(async (tx) => {
      await tx.reading.update({
        where: {
          id: readingId,
        },

        data: {
          lessonId,
          title,
          content,
          translation,
        },
      });

      /**
       * Nếu đổi lesson,
       * queue cũ không còn đúng.
       */
      if (lessonChanged) {
        await cleanupReadingFromSessions(tx, readingId);
      }
    });

    return redirect("/admin/reading");
  }

  /**
   * DELETE
   */
  if (intent === "delete") {
    const existing = await prisma.reading.findUnique({
      where: {
        id: readingId,
      },

      select: {
        id: true,
      },
    });

    if (!existing) {
      return json(
        {
          ok: false,
          error: "Không tìm thấy bài đọc.",
        },
        {
          status: 404,
        },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.reading.delete({
        where: {
          id: readingId,
        },
      });

      await cleanupReadingFromSessions(tx, readingId);
    });

    return redirect("/admin/reading");
  }

  return json(
    {
      ok: false,
      error: "Hành động không hợp lệ.",
    },
    {
      status: 400,
    },
  );
}

export default function AdminReading() {
  const { readings, lessons, q } = useLoaderData();

  const actionData = useActionData();

  const navigation = useNavigation();

  const submitting = navigation.state === "submitting";

  const [showCreate, setShowCreate] = useState(false);

  const availableLessons = lessons.filter((lesson) => !lesson.reading);

  return (
    <>
      <DesktopHeader />

      <main className="page-shell max-w-5xl pb-28">
        {/* HEADER */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-black text-emerald-700">READING ADMIN</p>

            <h1 className="text-3xl font-black text-slate-900">
              Quản lý bài đọc
            </h1>

            <p className="mt-2 text-sm font-semibold text-slate-400">
              {readings.length} bài đọc
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCreate((value) => !value)}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">
            {showCreate ? <X size={17} /> : <Plus size={17} />}

            {showCreate ? "Đóng" : "Thêm bài đọc"}
          </button>
        </div>

        {/* ACTION ERROR */}
        {actionData?.error && (
          <div className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700">
            {actionData.error}
          </div>
        )}

        {/* CREATE */}
        {showCreate && (
          <section className="soft-card mt-6 rounded-[2rem] p-6">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-emerald-600">
              Create Reading
            </div>

            <h2 className="mt-1 text-2xl font-black text-slate-900">
              Thêm bài đọc
            </h2>

            {availableLessons.length ? (
              <ReadingForm
                intent="create"
                lessons={availableLessons}
                submitting={submitting}
              />
            ) : (
              <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-700">
                Tất cả lesson hiện đã có bài đọc. Schema hiện tại chỉ cho phép
                một bài đọc cho mỗi lesson.
              </div>
            )}
          </section>
        )}

        {/* SEARCH */}
        <Form method="get" className="mt-6">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
            />

            <input
              name="q"
              defaultValue={q}
              placeholder="Tìm tiêu đề hoặc nội dung bài đọc..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-11 pr-4 font-semibold outline-none focus:border-emerald-400"
            />
          </div>
        </Form>

        {q && (
          <Link
            to="/admin/reading"
            className="mt-3 inline-block text-sm font-black text-slate-400">
            × Xóa tìm kiếm
          </Link>
        )}

        {/* EMPTY */}
        {!readings.length && (
          <section className="soft-card mt-6 rounded-[2rem] p-8 text-center">
            <BookOpenText size={38} className="mx-auto text-emerald-300" />

            <h2 className="mt-4 text-xl font-black">Chưa có bài đọc</h2>
          </section>
        )}

        {/* LIST */}
        <div className="mt-6 space-y-4">
          {readings.map((reading) => (
            <ReadingCard
              key={reading.id}
              reading={reading}
              lessons={lessons}
              submitting={submitting}
            />
          ))}
        </div>
      </main>
    </>
  );
}

function ReadingCard({ reading, lessons, submitting }) {
  const [editing, setEditing] = useState(false);

  const [deleting, setDeleting] = useState(false);

  return (
    <article className="soft-card rounded-[2rem] p-5 sm:p-6">
      {!editing ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-emerald-600">
                Tuần {reading.lesson.week.number}
                {" · "}
                {reading.lesson.dayLabel || reading.lesson.day}
              </div>

              <h2 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">
                {reading.title}
              </h2>

              <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-500">
                {reading.content}
              </p>

              {reading.translation && (
                <div className="mt-3 text-xs font-bold text-blue-500">
                  🇻🇳 Có bản dịch tiếng Việt
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
            <Link
              to={`/reader?preview=1&readingId=${reading.id}&mode=learn`}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-3 text-sm font-black text-emerald-700">
              <Eye size={15} />
              Xem
            </Link>

            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setDeleting(false);
              }}
              className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-3 text-sm font-black text-slate-600">
              <Pencil size={15} />
              Sửa
            </button>

            <button
              type="button"
              onClick={() => {
                setDeleting(true);
                setEditing(false);
              }}
              className="flex items-center justify-center gap-2 rounded-xl bg-rose-50 px-3 py-3 text-sm font-black text-rose-600">
              <Trash2 size={15} />
              Xóa
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.14em] text-emerald-600">
                Edit Reading
              </div>

              <h3 className="mt-1 font-black text-slate-900">
                {reading.title}
              </h3>
            </div>

            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <X size={16} />
            </button>
          </div>

          <ReadingForm
            intent="update"
            reading={reading}
            lessons={lessons}
            submitting={submitting}
          />
        </>
      )}

      {deleting && !editing && (
        <div className="mt-5 rounded-2xl bg-rose-50 p-4">
          <div className="font-black text-rose-800">
            Xóa bài đọc “{reading.title}”?
          </div>

          <p className="mt-2 text-sm font-semibold leading-6 text-rose-700">
            Bài đọc sẽ bị xóa khỏi lesson và các DailySession liên quan. Từ
            vựng, ReviewLog và điểm kỹ năng sẽ không bị xóa.
          </p>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setDeleting(false)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-black text-slate-600">
              <X size={16} />
              Hủy
            </button>

            <Form method="post" className="flex-1">
              <input type="hidden" name="intent" value="delete" />

              <input type="hidden" name="readingId" value={reading.id} />

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 font-black text-white disabled:opacity-50">
                <Trash2 size={16} />
                Xóa bài đọc
              </button>
            </Form>
          </div>
        </div>
      )}
    </article>
  );
}

function ReadingForm({ intent, reading = null, lessons, submitting }) {
  return (
    <Form method="post" className="mt-5 space-y-4">
      <input type="hidden" name="intent" value={intent} />

      {reading && <input type="hidden" name="readingId" value={reading.id} />}

      {/* LESSON */}
      <label className="block">
        <span className="text-sm font-black text-slate-700">Lesson</span>

        <select
          name="lessonId"
          required
          defaultValue={reading?.lessonId || ""}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none focus:border-emerald-400">
          <option value="">Chọn lesson</option>

          {lessons.map((lesson) => {
            const occupied =
              lesson.reading && lesson.reading.id !== reading?.id;

            return (
              <option key={lesson.id} value={lesson.id} disabled={occupied}>
                Tuần {lesson.week.number}
                {" · "}
                {lesson.dayLabel || lesson.day}
                {lesson.title ? ` · ${lesson.title}` : ""}
                {occupied ? " · Đã có bài đọc" : ""}
              </option>
            );
          })}
        </select>
      </label>

      {/* TITLE */}
      <label className="block">
        <span className="text-sm font-black text-slate-700">Tiêu đề</span>

        <input
          name="title"
          required
          defaultValue={reading?.title || ""}
          placeholder="A Busy Monday Morning"
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none focus:border-emerald-400"
        />
      </label>

      {/* ENGLISH */}
      <label className="block">
        <span className="text-sm font-black text-slate-700">
          Nội dung tiếng Anh
        </span>

        <textarea
          name="content"
          required
          rows={10}
          defaultValue={reading?.content || ""}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 font-medium leading-7 outline-none focus:border-emerald-400"
        />
      </label>

      {/* TRANSLATION */}
      <label className="block">
        <span className="text-sm font-black text-slate-700">
          Bản dịch tiếng Việt
        </span>

        <textarea
          name="translation"
          rows={8}
          defaultValue={reading?.translation || ""}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 font-medium leading-7 outline-none focus:border-emerald-400"
        />
      </label>

      <div className="rounded-2xl bg-blue-50 p-4 text-xs font-semibold leading-5 text-blue-700">
        Sửa tiêu đề hoặc nội dung không ảnh hưởng Vocabulary, SkillState hay
        ReviewLog. Nếu đổi sang lesson khác, các DailySession cũ của bài đọc này
        sẽ được dọn để tránh sai lịch học.
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white disabled:opacity-50">
        <Check size={18} />

        {submitting
          ? "Đang lưu..."
          : intent === "create"
          ? "Thêm bài đọc"
          : "Lưu thay đổi"}
      </button>
    </Form>
  );
}
