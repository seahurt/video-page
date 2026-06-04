import { unauthorizedResponse, userFromRequest } from "../../../../lib/auth.js";
import { streamFile } from "../../../../lib/stream-file.js";
import { contentType, getVideoById, isTranscodedVideoReady, transcodePathFor } from "../../../../lib/video-library.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  if (!userFromRequest(request)) return unauthorizedResponse();

  const { id } = await params;
  const item = getVideoById(id);
  if (!item) return new Response("Video not found", { status: 404 });

  if (!isTranscodedVideoReady(item)) return new Response("Transcode not ready", { status: 409 });

  const filePath = transcodePathFor(item);
  return streamFile(request, filePath, {
    "content-type": contentType(filePath),
    "cache-control": "public, max-age=86400"
  });
}

export async function HEAD(request, context) {
  return GET(request, context);
}
