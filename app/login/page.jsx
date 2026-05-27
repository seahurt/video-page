import { redirect } from "next/navigation";
import { currentUser } from "../../lib/auth.js";
import { appTitle } from "../../lib/site-config.js";

export const metadata = {
  title: `登录 · ${appTitle}`
};

export default async function LoginPage({ searchParams }) {
  const user = await currentUser();
  if (user) redirect("/");

  const params = await searchParams;
  const error = params?.error === "1";

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand">
          <span className="brand-mark" />
          <div>
            <h1>{appTitle}</h1>
            <p>登录后继续查看家庭视频库</p>
          </div>
        </div>

        <form className="login-form" action="/api/login" method="post">
          <label>
            <span>账号</span>
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            <span>密码</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error && <p className="form-error">账号或密码不正确</p>}
          <button type="submit">登录</button>
        </form>
      </section>
    </main>
  );
}
