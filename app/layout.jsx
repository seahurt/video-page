import "./globals.css";
import { appTitle } from "../lib/site-config.js";

export const metadata = {
  title: appTitle,
  description: "NAS video browser"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
