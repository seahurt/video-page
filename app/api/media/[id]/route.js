import { unauthorizedResponse, userFromRequest } from "../../../../lib/auth.js";
import { streamFile } from "../../../../lib/stream-file.js";
import { contentType, getVideoById, resolveVideoPath } from "../../../../lib/video-library.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  if (!userFromRequest(request)) return unauthorizedResponse();

  const { id } = await params;
  const item = await getVideoById(id);
  if (!item) return new Response("Video not found", { status: 404 });

  const filePath = resolveVideoPath(item);
  return streamFile(request, filePath, {
    "content-type": contentType(filePath),
    "cache-control": "public, max-age=86400"
  });
}

export async function HEAD(request, context) {
  return GET(request, context);
}
