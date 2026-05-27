import "./load-env.mjs";

const { databasePath } = await import("../lib/auth-db.js");
const { transcodeMissingVideos, TRANSCODE_ROOT, VIDEO_ROOT } = await import("../lib/video-library.js");

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

if (limitArg && (!Number.isInteger(limit) || limit <= 0)) {
  console.error("用法: npm run transcode -- --limit=10");
  process.exit(1);
}

const result = await transcodeMissingVideos({ limit });

console.log(`需要转码: ${result.totalNeeded} 个视频`);
console.log(`本次完成: ${result.processed} 个视频`);
console.log(`视频根目录: ${VIDEO_ROOT}`);
console.log(`转码目录: ${TRANSCODE_ROOT}`);
console.log(`数据库: ${databasePath()}`);
