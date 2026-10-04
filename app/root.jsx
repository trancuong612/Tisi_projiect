import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useNavigation,
  useRouteError,
} from "@remix-run/react";

import { useEffect, useState } from "react";

import stylesheet from "./styles/tailwind.css?url";

import BottomNav from "./components/BottomNav";
import { requireUser } from "./utils/auth.server";
export const links = () => [
  {
    rel: "stylesheet",
    href: stylesheet,
  },

  {
    rel: "manifest",
    href: "/manifest.webmanifest",
  },

  {
    rel: "icon",
    href: "/tisi.png",
    type: "image/png",
  },
];

export const meta = () => [
  {
    title: "Tisi",
  },

  {
    name: "description",
    content: "Personal adaptive English learning system",
  },

  {
    name: "theme-color",
    content: "#62b77b",
  },

  {
    name: "viewport",
    content: "width=device-width, initial-scale=1, viewport-fit=cover",
  },

  {
    name: "mobile-web-app-capable",
    content: "yes",
  },

  {
    name: "apple-mobile-web-app-capable",
    content: "yes",
  },

  {
    name: "apple-mobile-web-app-status-bar-style",
    content: "default",
  },

  {
    name: "apple-mobile-web-app-title",
    content: "Tisi",
  },
];

export default function App() {
  const navigation = useNavigation();

  const loading = navigation.state !== "idle";

  /**
   * Service Worker chỉ register
   * ở production để tránh cache
   * gây khó chịu khi dev.
   */
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  }, []);

  return (
    <Document>
      {loading && <div className="route-loading-bar" aria-hidden="true" />}

      <OfflineBanner />

      <div className="safe-bottom">
        <Outlet />
      </div>

      <BottomNav />
    </Document>
  );
}

function Document({ children }) {
  return (
    <html lang="vi">
      <head>
        <Meta />
        <Links />
      </head>

      <body>
        {children}

        <ScrollRestoration />

        <Scripts />
      </body>
    </html>
  );
}

/**
 * NETWORK FEEDBACK
 */
function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    function updateStatus() {
      setOnline(navigator.onLine);
    }

    updateStatus();

    window.addEventListener("online", updateStatus);

    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);

      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  if (online) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[9998] bg-amber-500 px-4 py-2 text-center text-xs font-black text-white shadow-lg">
      📡 Mất kết nối mạng · Một số thao tác học và lưu tiến độ sẽ tạm thời không
      hoạt động.
    </div>
  );
}

/**
 * GLOBAL ERROR BOUNDARY
 */
export function ErrorBoundary() {
  const error = useRouteError();

  let status = 500;

  let title = "Có lỗi xảy ra";

  let message = "Bright English gặp một lỗi ngoài dự kiến.";

  if (isRouteErrorResponse(error)) {
    status = error.status;

    if (error.status === 404) {
      title = "Không tìm thấy trang";

      message = "Trang bạn đang mở không tồn tại hoặc đã được di chuyển.";
    } else if (error.status === 403) {
      title = "Không có quyền truy cập";

      message = "Bạn không có quyền thực hiện thao tác này.";
    } else if (error.status === 400) {
      title = "Yêu cầu không hợp lệ";

      message =
        typeof error.data === "string"
          ? error.data
          : "Dữ liệu gửi lên chưa hợp lệ.";
    } else {
      message =
        typeof error.data === "string"
          ? error.data
          : error.statusText || message;
    }
  } else if (error instanceof Error) {
    /**
     * Không hiện stack trace
     * hay thông tin kỹ thuật
     * cho người dùng.
     */
    if (import.meta.env.DEV) {
      message = error.message;
    }
  }

  return (
    <Document>
      <main className="page-shell flex min-h-[80vh] max-w-xl items-center justify-center">
        <div className="soft-card w-full rounded-[2rem] p-8 text-center">
          <div className="text-5xl">{status === 404 ? "🧭" : "🌿"}</div>

          <div className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-emerald-600">
            Error {status}
          </div>

          <h1 className="mt-2 text-2xl font-black text-slate-900">{title}</h1>

          <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
            {message}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a
              href="/"
              className="rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white">
              Về trang hôm nay
            </a>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-2xl bg-slate-100 px-5 py-3 font-black text-slate-600">
              Thử tải lại
            </button>
          </div>
        </div>
      </main>
    </Document>
  );
}
