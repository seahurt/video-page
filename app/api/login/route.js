import { createSession, SESSION_COOKIE, verifyPassword } from "../../../lib/auth-db.js";
import { sessionCookieOptions } from "../../../lib/auth.js";
import { redirectTo } from "../../../lib/redirect.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const form = await request.formData();
  const username = form.get("username");
  const password = form.get("password");
  const user = verifyPassword(username, password);

  if (!user) {
    return redirectTo("/login?error=1");
  }

  const session = createSession(user.id);
  const response = redirectTo("/");
  response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt, request));

  return response;
}
