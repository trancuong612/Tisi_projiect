import { json, redirect } from "@remix-run/node";

import {
  Form,
  useActionData,
  useNavigation,
  useSearchParams,
} from "@remix-run/react";

import { KeyRound, Leaf } from "lucide-react";

import { isAuthenticated, login } from "../utils/auth.server";

export async function loader({ request }) {
  if (await isAuthenticated(request)) {
    return redirect("/");
  }

  return json({});
}

export async function action({ request }) {
  const form = await request.formData();

  const password = String(form.get("password") || "");

  const redirectTo = String(form.get("redirectTo") || "/");

  if (!password) {
    return json(
      {
        error: "Hãy nhập mật khẩu.",
      },
      {
        status: 400,
      },
    );
  }

  const result = await login({
    request,
    password,
    redirectTo,
  });

  if (result?.ok === false) {
    return json(
      {
        error: "Mật khẩu không đúng.",
      },
      {
        status: 401,
      },
    );
  }

  return result;
}

export default function Login() {
  const actionData = useActionData();

  const navigation = useNavigation();

  const [searchParams] = useSearchParams();

  const redirectTo = searchParams.get("redirectTo") || "/";

  const submitting = navigation.state === "submitting";

  return (
    <main className="page-shell flex min-h-screen max-w-md items-center justify-center py-10">
      <section className="soft-card w-full rounded-[2.2rem] p-7 sm:p-9">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-emerald-700 text-white shadow-lg shadow-emerald-100">
          <Leaf size={30} />
        </div>

        <div className="mt-6 text-center">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">
            Welcome to
          </div>

          <h1 className="mt-1 text-4xl font-black text-emerald-800">Tisi</h1>

          <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
            Không gian học tiếng Anh cá nhân của bạn.
          </p>
        </div>

        <Form method="post" className="mt-7">
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <label className="block">
            <span className="text-sm font-black text-slate-700">Mật khẩu</span>

            <div className="relative mt-2">
              <KeyRound
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
              />

              <input
                type="password"
                name="password"
                required
                autoFocus
                autoComplete="current-password"
                placeholder="Nhập mật khẩu Tisi"
                className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-11 pr-4 font-bold outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
              />
            </div>
          </label>

          {actionData?.error && (
            <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {actionData.error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 w-full rounded-2xl bg-emerald-700 px-5 py-4 font-black text-white shadow-lg shadow-emerald-100 disabled:opacity-50">
            {submitting ? "Đang mở Tisi..." : "Vào Tisi"}
          </button>
        </Form>

        <p className="mt-5 text-center text-xs font-semibold text-slate-400">
          🔒 Dữ liệu học tập được bảo vệ bằng phiên đăng nhập riêng.
        </p>
      </section>
    </main>
  );
}
