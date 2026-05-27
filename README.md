# NAS 视频页

一个轻量的本地 Web 视频浏览器，适合把家里的 NAS 目录挂载到电脑或服务器后直接浏览。

## 功能

- TikTok 式上下滑切换视频
- 按文件日期分组的相册视图
- 点击日期相册里的视频后跳回全屏播放
- 支持 Range 请求，拖动进度条时不会整段下载
- 视频路径保存到 SQLite 数据库
- 有 ffmpeg 时自动懒生成缩略图，缓存到视频根目录的 `.thumb`
- 浏览器不支持原视频编码时，可预生成 H.264 兼容版本，缓存到视频根目录的 `.transcode`

## 使用

复制 `.env.example` 为 `.env`，然后改成你的 NAS 视频目录：

```bash
VIDEO_ROOT=/Volumes/NAS/Movies
```

启动：

```bash
npm run dev
```

然后打开：

```text
http://localhost:3000
```

如果不设置 `VIDEO_ROOT`，默认扫描项目里的 `videos` 文件夹。`.env` 由 Next.js 自动读取。端口不在项目里配置，使用 Next.js 默认端口处理方式。

程序启动时会自动扫描一次视频目录。也可以手动执行：

```bash
npm run scan
```

每次扫描会把当前视频文件全量同步到 SQLite 数据库；已删除或移动的视频会从数据库中移除。

如果有 HEVC/H.265 等浏览器不稳定支持的视频，先执行预转码：

```bash
npm run transcode
```

也可以先少量测试：

```bash
npm run transcode -- --limit=10
```

## 账号

首次使用前创建一个登录账号：

```bash
npm run create-user -- admin your-password
```

账号、密码、session 和视频路径存在 SQLite 数据库里，默认路径是 `.data/app.sqlite`。可以通过 `SQLITE_PATH` 指定其他数据库文件。

默认会根据访问协议决定 cookie 是否加 `Secure`。如果你放到 HTTPS 反向代理后面，也可以设置 `AUTH_COOKIE_SECURE=true` 强制启用。

## 构建

```bash
npm run build
npm start
```

## 支持格式

`.mp4`、`.mov`、`.m4v`、`.webm`、`.mkv`、`.avi`

浏览器能否直接播放取决于浏览器本身的解码支持。家庭 NAS 使用时，建议优先放 H.264/AAC 的 `.mp4`，兼容性最好。

如果浏览器 DevTools 里看到 `strict-origin-when-cross-origin`，那只是 Referrer Policy，不是播放错误。实际无法播放通常是 HEVC/H.265 等编码不被当前浏览器支持；先运行 `npm run transcode` 生成 `.transcode` 中的 H.264 兼容版本，再刷新页面播放。

## 说明

当前版本按文件修改时间分组。如果你的 NAS 文件保留了拍摄时间或整理时间，这通常够用；后续也可以加 ffprobe 读取视频元数据里的 creation_time。
