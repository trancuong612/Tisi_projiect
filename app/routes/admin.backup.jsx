import { json } from "@remix-run/node";

import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  Download,
  FileCheck2,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";

import DesktopHeader from "../components/DesktopHeader";

import {
  getDatabaseCounts,
  restoreBackup,
  validateBackup,
} from "../services/backup.server";

export async function loader() {
  return json({
    counts: await getDatabaseCounts(),
  });
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;

async function readBackupFile(request) {
  const formData = await request.formData();

  const file = formData.get("backupFile");

  if (!file || typeof file.text !== "function") {
    throw new Error("Bạn chưa chọn file backup.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File backup lớn hơn 50 MB.");
  }

  if (!file.name.toLowerCase().endsWith(".json")) {
    throw new Error("Chỉ chấp nhận file .json.");
  }

  const raw = await file.text();

  let backup;

  try {
    backup = JSON.parse(raw);
  } catch {
    throw new Error("Không thể đọc JSON. File có thể bị hỏng.");
  }

  return {
    backup,
    formData,
    filename: file.name,
  };
}

export async function action({ request }) {
  try {
    const { backup, formData, filename } = await readBackupFile(request);

    const intent = formData.get("intent");

    /**
     * VALIDATE ONLY
     */
    if (intent === "validate") {
      const result = validateBackup(backup);

      return json({
        ok: true,
        type: "validated",
        filename,
        result,
      });
    }

    /**
     * RESTORE
     */
    if (intent === "restore") {
      const confirmed = formData.get("confirmReplace");

      if (confirmed !== "yes") {
        return json(
          {
            ok: false,
            error: "Bạn cần xác nhận rằng dữ liệu hiện tại sẽ bị thay thế.",
          },
          {
            status: 400,
          },
        );
      }

      /**
       * Validate lại + restore.
       */
      const result = await restoreBackup(backup);

      return json({
        ok: true,
        type: "restored",
        filename,
        result,
      });
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
  } catch (error) {
    console.error("BACKUP ACTION ERROR", error);

    return json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : "Không thể xử lý file backup.",
      },
      {
        status: 400,
      },
    );
  }
}

const LABELS = {
  weeks: "Tuần",
  lessons: "Bài học",
  vocabulary: "Từ vựng",
  vocabularyInsights: "Word Connections",
  readings: "Bài đọc",
  memoryStates: "FSRS Memory",
  skillStates: "Skill State",
  reviewLogs: "Review Logs",
  dailySessions: "Daily Sessions",
};

export default function BackupAdmin() {
  const data = useLoaderData();

  const actionData = useActionData();

  const navigation = useNavigation();

  const submitting = navigation.state === "submitting";

  return (
    <>
      <DesktopHeader />

      <main className="page-shell max-w-4xl pb-28">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-black text-slate-500">
          <ArrowLeft size={17} />
          Trang chủ
        </Link>

        <div className="mt-5">
          <p className="text-sm font-black text-emerald-600">DATA SAFETY</p>

          <h1 className="mt-1 text-3xl font-black text-slate-900">
            Backup & Restore
          </h1>

          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
            Sao lưu toàn bộ dữ liệu học tập hoặc khôi phục lại hệ thống từ một
            bản sao lưu đã tạo trước đó.
          </p>
        </div>

        {/* CURRENT DB */}
        <section className="soft-card mt-6 rounded-[2rem] p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Database size={20} />
            </div>

            <div>
              <div className="text-xs font-black uppercase tracking-[0.14em] text-emerald-600">
                Database hiện tại
              </div>

              <h2 className="mt-1 text-xl font-black text-slate-900">
                Dữ liệu đang được lưu
              </h2>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(data.counts).map(([key, value]) => (
              <div key={key} className="rounded-2xl bg-slate-50 p-4">
                <div className="text-2xl font-black text-slate-900">
                  {value}
                </div>

                <div className="mt-1 text-xs font-bold text-slate-400">
                  {LABELS[key] || key}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* DOWNLOAD */}
        <section className="mt-6 rounded-[2rem] bg-slate-900 p-6 text-white">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
              <Download size={21} />
            </div>

            <div className="flex-1">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-emerald-300">
                Backup
              </div>

              <h2 className="mt-1 text-2xl font-black">Tải bản sao lưu</h2>

              <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                File JSON chứa toàn bộ tiến trình học, từ vựng, bài đọc, FSRS,
                kỹ năng và lịch sử luyện tập.
              </p>

              <a
                href="/admin/backup/download"
                className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 font-black text-white">
                <Download size={18} />
                Tải backup ngay
              </a>
            </div>
          </div>
        </section>

        {/* RESTORE */}
        <section className="soft-card mt-6 rounded-[2rem] p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
              <Upload size={20} />
            </div>

            <div>
              <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-600">
                Restore
              </div>

              <h2 className="mt-1 text-xl font-black text-slate-900">
                Khôi phục dữ liệu
              </h2>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-amber-50 p-4">
            <div className="flex gap-3">
              <AlertTriangle
                size={20}
                className="mt-0.5 shrink-0 text-amber-600"
              />

              <p className="text-sm font-bold leading-6 text-amber-800">
                Restore sẽ thay thế toàn bộ dữ liệu hiện tại. Hãy tải một bản
                backup mới trước khi thực hiện.
              </p>
            </div>
          </div>

          <Form method="post" encType="multipart/form-data" className="mt-5">
            <label className="block">
              <span className="text-sm font-black text-slate-700">
                Chọn file backup
              </span>

              <input
                type="file"
                name="backupFile"
                accept=".json,application/json"
                required
                className="mt-2 block w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm font-semibold"
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="submit"
                name="intent"
                value="validate"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-2xl bg-violet-100 px-5 py-3 font-black text-violet-700 disabled:opacity-50">
                <FileCheck2 size={18} />
                Kiểm tra file
              </button>
            </div>

            <label className="mt-6 flex items-start gap-3 rounded-2xl bg-rose-50 p-4">
              <input
                type="checkbox"
                name="confirmReplace"
                value="yes"
                className="mt-1 h-4 w-4"
              />

              <span className="text-sm font-bold leading-6 text-rose-700">
                Tôi hiểu rằng thao tác Restore sẽ xóa dữ liệu hiện tại và thay
                thế bằng dữ liệu trong file backup.
              </span>
            </label>

            <button
              type="submit"
              name="intent"
              value="restore"
              disabled={submitting}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-4 font-black text-white disabled:opacity-50">
              <RotateCcw size={18} />

              {submitting ? "Đang xử lý..." : "Khôi phục dữ liệu"}
            </button>
          </Form>
        </section>

        {/* RESULT */}
        {actionData && <ResultCard data={actionData} />}

        {/* SAFETY */}
        <section className="mt-6 rounded-[2rem] bg-emerald-50 p-5">
          <div className="flex gap-3">
            <ShieldCheck
              className="mt-0.5 shrink-0 text-emerald-600"
              size={21}
            />

            <div>
              <div className="font-black text-emerald-900">Restore an toàn</div>

              <p className="mt-1 text-sm font-semibold leading-6 text-emerald-700">
                Dữ liệu được kiểm tra relation trước khi restore và toàn bộ thao
                tác chạy trong một database transaction. Nếu restore thất bại,
                transaction sẽ rollback.
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function ResultCard({ data }) {
  if (!data.ok) {
    return (
      <section className="mt-6 rounded-[2rem] bg-rose-50 p-5">
        <div className="flex gap-3">
          <AlertTriangle size={21} className="shrink-0 text-rose-600" />

          <div>
            <div className="font-black text-rose-800">Không thể xử lý</div>

            <div className="mt-1 text-sm font-semibold leading-6 text-rose-700">
              {data.error}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-[2rem] bg-emerald-50 p-5">
      <div className="flex gap-3">
        <CheckCircle2 size={21} className="shrink-0 text-emerald-600" />

        <div className="min-w-0 flex-1">
          <div className="font-black text-emerald-900">
            {data.type === "restored"
              ? "Khôi phục thành công"
              : "File backup hợp lệ"}
          </div>

          <div className="mt-1 break-all text-xs font-bold text-emerald-700">
            {data.filename}
          </div>

          {data.result?.exportedAt && (
            <div className="mt-2 text-xs font-semibold text-emerald-700">
              Backup tạo lúc: {data.result.exportedAt}
            </div>
          )}

          {data.result?.counts && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(data.result.counts).map(([key, value]) => (
                <div key={key} className="rounded-xl bg-white/70 p-3">
                  <div className="font-black text-emerald-900">{value}</div>

                  <div className="mt-1 text-[10px] font-bold text-emerald-600">
                    {LABELS[key] || key}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
