export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ensureStartupScan } = await import("./lib/video-library.js");
  ensureStartupScan();
}
