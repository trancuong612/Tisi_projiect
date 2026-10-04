import { createCookieSessionStorage, redirect } from "@remix-run/node";

import { timingSafeEqual } from "node:crypto";

const SESSION_SECRET = process.env.SESSION_SECRET;

const APP_PASSWORD = process.env.APP_PASSWORD;

if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required.");
}

if (!APP_PASSWORD) {
  throw new Error("APP_PASSWORD is required.");
}

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__tisi_session",

    httpOnly: true,

    path: "/",

    sameSite: "lax",

    secrets: [SESSION_SECRET],

    secure: process.env.NODE_ENV === "production",

    maxAge: 60 * 60 * 24 * 30,
  },
});

function safeEqual(left, right) {
  const a = Buffer.from(String(left));

  const b = Buffer.from(String(right));

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

export async function getAuthSession(request) {
  return sessionStorage.getSession(request.headers.get("Cookie"));
}

export async function isAuthenticated(request) {
  const session = await getAuthSession(request);

  return session.get("authenticated") === true;
}

export async function requireUser(request) {
  const authenticated = await isAuthenticated(request);

  if (!authenticated) {
    const url = new URL(request.url);

    const redirectTo = `${url.pathname}${url.search}`;

    throw redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  return true;
}

export async function login({ request, password, redirectTo = "/" }) {
  if (!safeEqual(password, APP_PASSWORD)) {
    return {
      ok: false,
    };
  }

  const session = await getAuthSession(request);

  session.set("authenticated", true);

  const safeRedirect = String(redirectTo || "/").startsWith("/")
    ? redirectTo
    : "/";

  return redirect(safeRedirect, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}

export async function logout(request) {
  const session = await getAuthSession(request);

  return redirect("/login", {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
}
