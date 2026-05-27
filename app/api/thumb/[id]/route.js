import fsp from "node:fs/promises";
import { Readable } from "node:stream";
import { unauthorizedResponse, userFromRequest } from "../../../../lib/auth.js";
import { fileStream, getVideoById, ensureThumbnail } from "../../../../lib/video-library.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  if (!userFromRequest(request)) return unauthorizedResponse();

  const { id } = await params;
  const item = await getVideoById(id);
  if (!item) return new Response("Thumbnail not found", { status: 404 });

  try {
    const thumbPath = await ensureThumbnail(item);
    const stat = await fsp.stat(thumbPath);

    return new Response(Readable.toWeb(fileStream(thumbPath)), {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(stat.size),
        "cache-control": "public, max-age=604800"
      }
    });
  } catch {
    return new Response("Thumbnail unavailable", { status: 404 });
  }
}
