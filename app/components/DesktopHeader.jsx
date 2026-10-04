import { NavLink } from "@remix-run/react";

const items = [
  ["/learn", "Học"],
  ["/review", "Ôn"],
  ["/practice", "Luyện"],
  ["/reader", "Đọc"],
  ["/words", "Từ vựng"],
  ["/stats", "Thống kê"],
  ["/admin/import", "Nhập từ"],
];

export default function DesktopHeader() {
  return (
    <header className="hidden border-b border-emerald-100 bg-white/85 backdrop-blur md:block">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
        <NavLink
          to="/"
          className="shrink-0 text-xl font-black text-emerald-800">
          Tisi
        </NavLink>

        <nav className="flex items-center gap-1">
          {items.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  "rounded-xl px-3 py-2 text-sm font-bold transition",
                  isActive
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                ].join(" ")
              }>
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
