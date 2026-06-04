import fs from "node:fs";
import fsp from "node:fs/promises";
import { Readable } from "node:stream";

export async function streamFile(request, filePath, headers = {}) {
  const stat = await fsp.stat(filePath);
  const baseHeaders = {
    ...headers,
    "accept-ranges": "bytes"
  };
  const range = request.headers.get("range");

  if (!range) {
    return fileResponse(request, filePath, {
      status: 200,
      headers: {
        ...baseHeaders,
        "content-length": String(stat.size)
      }
    });
  }

  const parsed = parseByteRange(range, stat.size);
  if (!parsed) {
    return new Response(request.method === "HEAD" ? null : "Range not satisfiable", {
      status: 416,
      headers: {
        ...baseHeaders,
        "content-range": `bytes */${stat.size}`
      }
    });
  }

  const { start, end } = parsed;
  return fileResponse(request, filePath, {
    status: 206,
    start,
    end,
    headers: {
      ...baseHeaders,
      "content-length": String(end - start + 1),
      "content-range": `bytes ${start}-${end}/${stat.size}`
    }
  });
}

function fileResponse(request, filePath, { status, headers, start, end }) {
  const body = request.method === "HEAD"
    ? null
    : Readable.toWeb(fs.createReadStream(filePath, { start, end }));

  return new Response(body, { status, headers });
}

function parseByteRange(range, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || size < 1) return null;

  const [, startValue, endValue] = match;
  if (!startValue && !endValue) return null;

  let start;
  let end;

  if (!startValue) {
    const suffixLength = Number(endValue);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(startValue);
    end = endValue ? Number(endValue) : size - 1;
  }

  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(end)
    || start < 0
    || end < 0
    || start >= size
    || end >= size
    || start > end
  ) {
    return null;
  }

  return { start, end };
}
