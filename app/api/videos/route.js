import { NextResponse } from "next/server";
import { unauthorizedResponse, userFromRequest } from "../../../lib/auth.js";
import { listVideos, VIDEO_ROOT } from "../../../lib/video-library.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!userFromRequest(request)) return unauthorizedResponse();

  const videos = listVideos();

  return NextResponse.json({
    root: VIDEO_ROOT,
    count: videos.length,
    videos
  });
}
