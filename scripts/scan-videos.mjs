import "./load-env.mjs";

const { databasePath } = await import("../lib/auth-db.js");
const { scanVideos, THUMB_ROOT, VIDEO_ROOT } = await import("../lib/video-library.js");

const videos = await scanVideos();

console.log(`扫描完成: ${videos.length} 个视频`);
console.log(`视频根目录: ${VIDEO_ROOT}`);
console.log(`缩略图目录: ${THUMB_ROOT}`);
console.log(`数据库: ${databasePath()}`);
