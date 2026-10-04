import { NavLink, useLocation } from "@remix-run/react";

import { Home, Brain, BookOpenText, Library, BarChart3 } from "lucide-react";

const items = [
  ["/", "Hôm nay", Home],
  ["/learn", "Học", Brain],
  ["/reader", "Đọc", BookOpenText],
  ["/words", "Từ", Library],
  ["/stats", "Tiến độ", BarChart3],
];

export default function BottomNav() {
  const location = useLocation();

  const pathname = location.pathname;

  const learningSection =
    pathname === "/learn" ||
    pathname === "/review" ||
    pathname === "/practice" ||
    pathname === "/weak-words" ||
    pathname === "/connections";

  const progressSection =
    pathname === "/stats" ||
    pathname === "/skill-history" ||
    pathname === "/weekly-summary" ||
    pathname === "/summary";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-emerald-100 bg-white/95 backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5 px-1 pb-[env(safe-area-inset-bottom)]">
        {items.map(([to, label, Icon]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => {
              const active =
                isActive ||
                (to === "/learn" && learningSection) ||
                (to === "/stats" && progressSection);

              return [
                "relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold transition",
                active ? "text-emerald-700" : "text-slate-400",
              ].join(" ");
            }}>
            {({ isActive }) => {
              const active =
                isActive ||
                (to === "/learn" && learningSection) ||
                (to === "/stats" && progressSection);

              return (
                <>
                  <div
                    className={[
                      "flex h-8 w-11 items-center justify-center rounded-xl transition",
                      active ? "bg-emerald-50" : "",
                    ].join(" ")}>
                    <Icon size={20} />
                  </div>

                  <span>{label}</span>
                </>
              );
            }}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
