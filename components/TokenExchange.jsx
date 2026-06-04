"use client";

import { useEffect, useRef } from "react";

export default function TokenExchange({ token, appTitle }) {
  const formRef = useRef(null);

  useEffect(() => {
    formRef.current?.requestSubmit();
  }, []);

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand">
          <span className="brand-mark" />
          <div>
            <h1>{appTitle}</h1>
            <p>正在进入视频库</p>
          </div>
        </div>

        <form ref={formRef} className="login-form" action="/api/token-login" method="post">
          <input type="hidden" name="token" value={token} />
          <button type="submit">继续</button>
        </form>
      </section>
    </main>
  );
}
