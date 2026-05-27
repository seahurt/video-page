import { NextResponse } from "next/server";
import { unauthorizedResponse, userFromRequest } from "../../../lib/auth.js";
import { scanVideos } from "../../../lib/video-library.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!userFromRequest(request)) return unauthorizedResponse();

  const videos = await scanVideos();

  return NextResponse.json({ count: videos.length });
}
