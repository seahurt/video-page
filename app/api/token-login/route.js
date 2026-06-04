import { createTemporarySession, SESSION_COOKIE } from "../../../lib/auth-db.js";
import { sessionCookieOptions } from "../../../lib/auth.js";
import { redirectTo } from "../../../lib/redirect.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const form = await request.formData();
  const token = form.get("token");
  const session = createTemporarySession(token);

  if (!session) {
    const response = redirectTo("/login?error=token");
    response.headers.set("cache-control", "no-store");
    return response;
  }

  const response = redirectTo("/");
  response.headers.set("cache-control", "no-store");
  response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt, request));

  return response;
}
