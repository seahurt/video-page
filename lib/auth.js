import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserBySessionToken, getUserByTemporaryToken, SESSION_COOKIE } from "./auth-db.js";

export async function currentUser(token) {
  const tokenUser = getUserByTemporaryToken(token);
  if (tokenUser) return tokenUser;

  const cookieStore = await cookies();
  return getUserBySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireUser(token) {
  const user = await currentUser(token);
  return user;
}

export function userFromRequest(request) {
  const tokenUser = getUserByTemporaryToken(request.nextUrl?.searchParams.get("token"));
  if (tokenUser) return tokenUser;

  return getUserBySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function sessionCookieOptions(expiresAt, request) {
  const forwardedProto = request?.headers.get("x-forwarded-proto");
  const isHttps = request?.nextUrl?.protocol === "https:" || forwardedProto === "https";
  const forceSecure = process.env.AUTH_COOKIE_SECURE === "true";

  return {
    httpOnly: true,
    sameSite: "lax",
    secure: forceSecure || isHttps,
    path: "/",
    expires: new Date(expiresAt)
  };
}
