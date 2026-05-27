import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { getDb } from "./auth-db.js";

const defaultVideoRoot = path.join(process.cwd(), "videos");

export const VIDEO_ROOT = process.env.VIDEO_ROOT
  ? path.resolve(/* turbopackIgnore: true */ process.env.VIDEO_ROOT)
  : defaultVideoRoot;
export const THUMB_ROOT = path.join(VIDEO_ROOT, ".thumb");
export const TRANSCODE_ROOT = path.join(VIDEO_ROOT, ".transcode");

const SUPPORTED = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);

let scanning = null;
let startupScanPromise = null;

export function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".jpg": "image/jpeg"
  }[ext] || "application/octet-stream";
}

export async function scanVideos() {
  if (scanning) return scanning;

  scanning = (async () => {
    ensureVideoTable();
    const files = await walk(VIDEO_ROOT);
    const previous = previousVideoMap();
    const items = await mapLimit(files, 4, async (filePath) => {
      const stat = await fsp.stat(filePath);
      const date = stat.mtime;
      const relativePath = path.relative(VIDEO_ROOT, filePath);
      const id = videoId(relativePath);
      const old = previous.get(relativePath);
      const canReuseProbe = old?.video_codec && old.size === stat.size && Math.round(old.mtime_ms) === Math.round(stat.mtimeMs);
      const metadata = canReuseProbe ? old : await probeVideo(filePath);

      return {
        id,
        title: titleFromPath(filePath),
        relativePath,
        absolutePath: filePath,
        date: date.toISOString(),
        day: toDayKey(date),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        videoCodec: metadata.video_codec || null,
        audioCodec: metadata.audio_codec || null
      };
    });

    items.sort((a, b) => new Date(b.date) - new Date(a.date) || a.relativePath.localeCompare(b.relativePath));
    replaceVideos(items);
    scanning = null;
    return listVideos();
  })().catch((error) => {
    scanning = null;
    throw error;
  });

  return scanning;
}

export function listVideos() {
  ensureVideoTable();

  const rows = getDb().prepare(`
    SELECT id, title, relative_path, absolute_path, date, day, size, video_codec, audio_codec, transcoded_path, transcoded_at
    FROM videos
    ORDER BY datetime(date) DESC, relative_path ASC
  `).all();

  return rows.map(videoFromRow);
}

export function getVideoById(id) {
  ensureVideoTable();

  const row = getDb().prepare(`
    SELECT id, title, relative_path, absolute_path, date, day, size, video_codec, audio_codec, transcoded_path, transcoded_at
    FROM videos
    WHERE id = ?
  `).get(id);

  return row ? videoFromRow(row) : null;
}

export function ensureStartupScan() {
  if (!startupScanPromise) {
    startupScanPromise = scanVideos().catch((error) => {
      startupScanPromise = null;
      console.error("启动扫描视频失败:", error);
    });
  }

  return startupScanPromise;
}

export function resolveVideoPath(item) {
  return item.absolutePath || path.join(VIDEO_ROOT, item.relativePath);
}

export async function ensureThumbnail(item) {
  await fsp.mkdir(THUMB_ROOT, { recursive: true });
  const thumbPath = path.join(THUMB_ROOT, `${item.id}.jpg`);

  try {
    const stat = await fsp.stat(thumbPath);
    if (stat.size > 0) return thumbPath;
  } catch {}

  await new Promise((resolve, reject) => {
    const sourcePath = resolveVideoPath(item);
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      "00:00:00.2",
      "-i",
      sourcePath,
      "-frames:v",
      "1",
      "-vf",
      "scale=480:-1",
      "-y",
      thumbPath
    ]);

    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("Thumbnail unavailable"));
    });
  });

  return thumbPath;
}

const transcoding = new Map();

export async function ensureTranscodedVideo(item) {
  await fsp.mkdir(TRANSCODE_ROOT, { recursive: true });
  const outputPath = path.join(TRANSCODE_ROOT, `${item.id}.mp4`);
  const tempPath = path.join(TRANSCODE_ROOT, `${item.id}.tmp.mp4`);

  try {
    const stat = await fsp.stat(outputPath);
    if (stat.size > 0) return outputPath;
  } catch {}

  if (transcoding.has(item.id)) return transcoding.get(item.id);

  const promise = new Promise((resolve, reject) => {
    const sourcePath = resolveVideoPath(item);
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      sourcePath,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-y",
      tempPath
    ]);

    ffmpeg.on("error", reject);
    ffmpeg.on("close", async (code) => {
      if (code !== 0) {
        reject(new Error("Transcode unavailable"));
        return;
      }

      try {
        await fsp.rename(tempPath, outputPath);
        resolve(outputPath);
      } catch (error) {
        reject(error);
      }
    });
  }).finally(() => {
    transcoding.delete(item.id);
  });

  transcoding.set(item.id, promise);
  return promise;
}

export function isTranscodedVideoReady(item) {
  const outputPath = transcodePathFor(item);
  try {
    return fs.statSync(outputPath).size > 0;
  } catch {
    return false;
  }
}

export function transcodePathFor(item) {
  return path.join(TRANSCODE_ROOT, `${item.id}.mp4`);
}

export function needsTranscode(item) {
  return !isBrowserFriendlyVideo(item.videoCodec);
}

export async function transcodeMissingVideos({ limit } = {}) {
  const videos = listVideos().filter((item) => needsTranscode(item) && !isTranscodedVideoReady(item));
  const selected = limit ? videos.slice(0, limit) : videos;
  const results = [];

  for (const video of selected) {
    const outputPath = await ensureTranscodedVideo(video);
    markTranscoded(video.id, outputPath);
    results.push({ id: video.id, relativePath: video.relativePath, outputPath });
  }

  return {
    totalNeeded: videos.length,
    processed: results.length,
    results
  };
}

export function fileStream(filePath, options) {
  return fs.createReadStream(filePath, options);
}

function ensureVideoTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      relative_path TEXT NOT NULL UNIQUE,
      absolute_path TEXT NOT NULL,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      day TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime_ms REAL NOT NULL,
      video_codec TEXT,
      audio_codec TEXT,
      transcoded_path TEXT,
      transcoded_at TEXT,
      scanned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_videos_date ON videos(date);
    CREATE INDEX IF NOT EXISTS idx_videos_day ON videos(day);
  `);

  addColumnIfMissing("videos", "video_codec", "TEXT");
  addColumnIfMissing("videos", "audio_codec", "TEXT");
  addColumnIfMissing("videos", "transcoded_path", "TEXT");
  addColumnIfMissing("videos", "transcoded_at", "TEXT");
}

function replaceVideos(items) {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO videos (id, relative_path, absolute_path, title, date, day, size, mtime_ms, video_codec, audio_codec, transcoded_path, transcoded_at, scanned_at)
    VALUES (@id, @relativePath, @absolutePath, @title, @date, @day, @size, @mtimeMs, @videoCodec, @audioCodec, @transcodedPath, @transcodedAt, CURRENT_TIMESTAMP)
  `);
  const previous = previousVideoMap();

  db.transaction((videos) => {
    db.prepare("DELETE FROM videos").run();
    for (const item of videos) {
      const old = previous.get(item.relativePath);
      insert.run({
        ...item,
        transcodedPath: old?.transcoded_path || null,
        transcodedAt: old?.transcoded_at || null
      });
    }
  })(items);
}

function videoFromRow(row) {
  const transcodeReady = isTranscodedVideoReady({ id: row.id });
  const requiresTranscode = !isBrowserFriendlyVideo(row.video_codec);
  const mediaUrl = requiresTranscode
    ? (transcodeReady ? `/api/transcode/${row.id}` : null)
    : `/api/media/${row.id}`;

  return {
    id: row.id,
    title: row.title,
    relativePath: row.relative_path,
    absolutePath: row.absolute_path,
    date: row.date,
    day: row.day,
    size: row.size,
    videoCodec: row.video_codec,
    audioCodec: row.audio_codec,
    needsTranscode: requiresTranscode,
    transcodeReady,
    mediaUrl,
    originalMediaUrl: `/api/media/${row.id}`,
    thumbUrl: `/api/thumb/${row.id}`,
    transcodeUrl: `/api/transcode/${row.id}`
  };
}

function previousVideoMap() {
  ensureVideoTable();

  const rows = getDb().prepare(`
    SELECT relative_path, size, mtime_ms, video_codec, audio_codec, transcoded_path, transcoded_at
    FROM videos
  `).all();

  return new Map(rows.map((row) => [row.relative_path, row]));
}

function markTranscoded(id, outputPath) {
  getDb().prepare(`
    UPDATE videos
    SET transcoded_path = ?, transcoded_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(outputPath, id);
}

function addColumnIfMissing(table, column, type) {
  const exists = getDb().prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  if (!exists) getDb().exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

async function walk(dir, out = []) {
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return out;
    throw error;
  }

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, out);
    } else if (entry.isFile() && SUPPORTED.has(path.extname(entry.name).toLowerCase())) {
      out.push(fullPath);
    }
  }

  return out;
}

function videoId(filePath) {
  return crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 24);
}

function probeVideo(filePath) {
  return new Promise((resolve) => {
    const ffprobe = spawn("ffprobe", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name",
      "-of",
      "json",
      filePath
    ]);

    let output = "";
    ffprobe.stdout.on("data", (chunk) => {
      output += chunk;
    });
    ffprobe.on("error", () => resolve({}));
    ffprobe.on("close", (code) => {
      if (code !== 0) {
        resolve({});
        return;
      }

      try {
        const data = JSON.parse(output);
        const streams = Array.isArray(data.streams) ? data.streams : [];
        resolve({
          video_codec: streams.find((stream) => stream.codec_type === "video")?.codec_name || null,
          audio_codec: streams.find((stream) => stream.codec_type === "audio")?.codec_name || null
        });
      } catch {
        resolve({});
      }
    });
  });
}

async function mapLimit(items, limit, mapper) {
  const results = [];
  const executing = new Set();

  for (const item of items) {
    const promise = Promise.resolve().then(() => mapper(item));
    results.push(promise);
    executing.add(promise);
    promise.finally(() => executing.delete(promise));
    if (executing.size >= limit) await Promise.race(executing);
  }

  return Promise.all(results);
}

function isBrowserFriendlyVideo(codec) {
  if (!codec) return true;
  return ["h264", "avc1", "vp8", "vp9", "av1"].includes(String(codec).toLowerCase());
}

function titleFromPath(filePath) {
  return path.basename(filePath, path.extname(filePath)).replace(/[_-]+/g, " ");
}

function toDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
