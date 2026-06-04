"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short"
});

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit"
});

export default function VideoBrowser({ username, appTitle }) {
  const [videos, setVideos] = useState([]);
  const [root, setRoot] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeView, setActiveView] = useState("feed");
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeDay, setActiveDay] = useState("");
  const feedRef = useRef(null);
  const galleryRef = useRef(null);
  const videoRefs = useRef([]);

  const groups = useMemo(() => groupByDay(videos), [videos]);
  const metaText = loading ? "正在加载视频..." : loadError || `${videos.length} 个视频 · ${root}`;

  const syncPlayback = useCallback(() => {
    for (const [index, video] of videoRefs.current.entries()) {
      if (!video) continue;
      if (activeView === "feed" && index === activeIndex) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }
  }, [activeIndex, activeView]);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const response = await fetch("/api/videos", { cache: "no-store" });
    if (!response.ok) throw new Error(`加载失败: ${response.status}`);
    const data = await response.json();
    setVideos(data.videos);
    setRoot(data.root);
    setLoading(false);
  }, []);

  const jumpToVideo = useCallback((index) => {
    const nextIndex = Math.max(0, Math.min(videos.length - 1, index));
    setActiveIndex(nextIndex);
    setActiveView("feed");
    requestAnimationFrame(() => {
      feedRef.current?.children[nextIndex]?.scrollIntoView({ block: "start" });
    });
  }, [videos.length]);

  async function rescan() {
    setLoading(true);
    try {
      const response = await fetch("/api/rescan", { method: "POST" });
      if (!response.ok) throw new Error(`扫描失败: ${response.status}`);
      await loadVideos();
    } catch (error) {
      setLoadError(error.message || "扫描失败");
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVideos().catch((error) => {
      setLoadError(error.message || "加载失败");
      setLoading(false);
    });
  }, [loadVideos]);

  useEffect(() => {
    syncPlayback();
  }, [syncPlayback]);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      setActiveIndex(Number(visible.target.dataset.index));
    }, { root: feed, threshold: [0.62, 0.82] });

    for (const slide of feed.querySelectorAll(".slide")) observer.observe(slide);
    return () => observer.disconnect();
  }, [videos]);

  useEffect(() => {
    function onKeyDown(event) {
      if (activeView !== "feed") return;
      if (event.key === "ArrowDown" || event.key === "PageDown") {
        jumpToVideo(activeIndex + 1);
      }
      if (event.key === "ArrowUp" || event.key === "PageUp") {
        jumpToVideo(activeIndex - 1);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, activeView, jumpToVideo]);

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery || groups.length === 0) return;

    function highlightDateRail() {
      const sections = [...gallery.querySelectorAll(".day-group")];
      let current = sections[0];
      for (const section of sections) {
        if (section.getBoundingClientRect().top < 170) current = section;
      }
      if (current) setActiveDay(current.id.replace("day-", ""));
    }

    highlightDateRail();
    gallery.addEventListener("scroll", highlightDateRail, { passive: true });
    return () => gallery.removeEventListener("scroll", highlightDateRail);
  }, [groups]);

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <div>
            <h1>{appTitle}</h1>
            <p>{metaText}</p>
          </div>
        </div>
        <div className="actions" role="toolbar" aria-label="视图切换">
          <span className="user-chip">{username}</span>
          <button className={`icon-button ${activeView === "feed" ? "is-active" : ""}`} onClick={() => setActiveView("feed")} title="上下滑播放" aria-label="上下滑播放">
            <span>↕</span>
          </button>
          <button className={`icon-button ${activeView === "gallery" ? "is-active" : ""}`} onClick={() => setActiveView("gallery")} title="按日期查看" aria-label="按日期查看">
            <span>▦</span>
          </button>
          <button className="icon-button" onClick={rescan} title="重新扫描" aria-label="重新扫描">
            <span>↻</span>
          </button>
          <form action="/api/logout" method="post">
            <button className="icon-button" type="submit" title="退出登录" aria-label="退出登录">
              <span>⇥</span>
            </button>
          </form>
        </div>
      </header>

      <section className={`view feed-view ${activeView === "feed" ? "is-active" : ""}`} aria-label="上下滑视频">
        {!loading && videos.length === 0 && (
          <div className="empty">
            <h2>{loadError ? "加载失败" : "还没有找到视频"}</h2>
            <p>{loadError || "把 NAS 目录挂载到本机后，用 VIDEO_ROOT 指向它再启动。"}</p>
          </div>
        )}
        <div className="feed" ref={feedRef}>
          {videos.map((video, index) => {
            const shouldRenderMedia = Math.abs(index - activeIndex) <= 1;
            return (
              <article className="slide" data-index={index} key={video.id}>
                {shouldRenderMedia ? (
                  <SlideMedia
                    video={video}
                    index={index}
                    setVideoRef={(node) => {
                      videoRefs.current[index] = node;
                    }}
                  />
                ) : (
                  <div className="slide-shell" />
                )}
                <div className="slide-info">
                  <strong>{video.title}</strong>
                  <span>{dateFormatter.format(new Date(video.date))} · {timeFormatter.format(new Date(video.date))} · {formatSize(video.size)}{video.transcodeReady ? " · 兼容版" : ""}{video.needsTranscode && !video.transcodeReady ? " · 待转码" : ""}</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className={`view gallery-view ${activeView === "gallery" ? "is-active" : ""}`} aria-label="日期相册">
        {activeView === "gallery" && videos.length > 0 && (
          <>
            <aside className="date-rail">
              {groups.map((group) => (
                <button
                  className={`date-link ${activeDay === group.day ? "is-active" : ""}`}
                  key={group.day}
                  onClick={() => document.getElementById(`day-${group.day}`)?.scrollIntoView({ block: "start" })}
                >
                  {group.day}
                </button>
              ))}
            </aside>
            <div className="gallery" ref={galleryRef}>
              {groups.map((group) => (
                <section className="day-group" id={`day-${group.day}`} key={group.day}>
                  <div className="day-heading">
                    <h2>{dateFormatter.format(new Date(`${group.day}T12:00:00`))}</h2>
                    <span>{group.items.length} 个视频</span>
                  </div>
                  <div className="video-grid">
                    {group.items.map((video) => {
                      const index = videos.findIndex((item) => item.id === video.id);
                      return (
                        <button className="video-card" key={video.id} onClick={() => jumpToVideo(index)}>
                          <div className="thumb">
                            <img src={video.thumbUrl} alt="" loading="lazy" />
                            {video.needsTranscode && !video.transcodeReady && <span className="thumb-badge">待转码</span>}
                          </div>
                          <div className="card-meta">
                            <strong>{video.title}</strong>
                            <span>{timeFormatter.format(new Date(video.date))}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}

        {activeView === "gallery" && !loading && videos.length === 0 && (
          <div className="empty gallery-empty">
            <h2>{loadError ? "加载失败" : "日期相册是空的"}</h2>
            <p>{loadError || "扫描到视频后，这里会按日期自动分组。"}</p>
          </div>
        )}
      </section>
    </main>
  );
}

function SlideMedia({ video, index, setVideoRef }) {
  if (!video.mediaUrl) {
    return (
      <div className="video-placeholder">
        <img src={video.thumbUrl} alt="" />
        <div>
          <strong>需要预转码</strong>
          <span>运行 npm run transcode 后刷新页面</span>
        </div>
      </div>
    );
  }

  return (
    <video
      ref={setVideoRef}
      src={video.mediaUrl}
      poster={video.thumbUrl}
      preload={index === 0 ? "metadata" : "none"}
      playsInline
      loop
      controls
    />
  );
}

function groupByDay(videos) {
  const groups = new Map();
  for (const video of videos) {
    if (!groups.has(video.day)) groups.set(video.day, []);
    groups.get(video.day).push(video);
  }
  return [...groups.entries()].map(([day, items]) => ({ day, items }));
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
