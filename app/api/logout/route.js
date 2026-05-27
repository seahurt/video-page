import { deleteSession, SESSION_COOKIE } from "../../../lib/auth-db.js";
import { redirectTo } from "../../../lib/redirect.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  deleteSession(token);

  const response = redirectTo("/login");
  response.cookies.delete(SESSION_COOKIE);

  return response;
}
