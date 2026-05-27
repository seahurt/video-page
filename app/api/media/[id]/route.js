import fsp from "node:fs/promises";
import { Readable } from "node:stream";
import { unauthorizedResponse, userFromRequest } from "../../../../lib/auth.js";
import { contentType, fileStream, getVideoById, resolveVideoPath } from "../../../../lib/video-library.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  if (!userFromRequest(request)) return unauthorizedResponse();

  const { id } = await params;
  const item = await getVideoById(id);
  if (!item) return new Response("Video not found", { status: 404 });

  const filePath = resolveVideoPath(item);
  const stat = await fsp.stat(filePath);
  const range = request.headers.get("range");
  const headers = {
    "content-type": contentType(filePath),
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=86400"
  };

  if (!range) {
    return new Response(Readable.toWeb(fileStream(filePath)), {
      status: 200,
      headers: {
        ...headers,
        "content-length": String(stat.size)
      }
    });
  }

  const match = range.match(/bytes=(\d*)-(\d*)/);
  if (!match) return new Response("Invalid range", { status: 416 });

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : stat.size - 1;
  if (start >= stat.size || end >= stat.size || start > end) {
    return new Response("Range not satisfiable", { status: 416 });
  }

  const handle = await fsp.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(end - start + 1);
    await handle.read(buffer, 0, buffer.length, start);

    return new Response(buffer, {
      status: 206,
      headers: {
        ...headers,
        "content-length": String(buffer.length),
        "content-range": `bytes ${start}-${end}/${stat.size}`
      }
    });
  } finally {
    await handle.close();
  }
}

export async function HEAD(request, context) {
  return GET(request, context);
}
