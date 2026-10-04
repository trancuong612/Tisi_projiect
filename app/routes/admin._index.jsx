import { Link } from "@remix-run/react";
import DesktopHeader from "../components/DesktopHeader";
export default function AdminIndex() {
  return (
    <>
      <DesktopHeader />
      <main className="page-shell pb-28">
        <p className="text-sm font-black text-emerald-700">CONTENT DESK</p>
        <h1 className="text-3xl font-black">Quản lý nội dung</h1>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link className="soft-card rounded-2xl p-5" to="/admin/import">
            <h2 className="font-black">Nhập từ hàng loạt</h2>
            <p className="mt-2 text-sm text-slate-500">
              Paste bộ từ theo tuần/ngày.
            </p>
          </Link>
          <Link className="soft-card rounded-2xl p-5" to="/admin/reading">
            <h2 className="font-black">Bài đọc</h2>
            <p className="mt-2 text-sm text-slate-500">
              Paste bài đọc AI tạo cho từng lesson.
            </p>
          </Link>
          <a className="soft-card rounded-2xl p-5" href="/api/backup">
            <h2 className="font-black">Backup JSON</h2>
            <p className="mt-2 text-sm text-slate-500">
              Xuất toàn bộ dữ liệu học tập.
            </p>
          </a>
        </div>
      </main>
    </>
  );
}
