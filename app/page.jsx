import { redirect } from "next/navigation";
import TokenExchange from "../components/TokenExchange.jsx";
import VideoBrowser from "../components/VideoBrowser.jsx";
import { currentUser } from "../lib/auth.js";
import { appTitle } from "../lib/site-config.js";

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const token = Array.isArray(params?.token) ? params.token[0] : params?.token;
  if (token) return <TokenExchange token={token} appTitle={appTitle} />;

  const user = await currentUser();
  if (!user) redirect("/login");

  return <VideoBrowser username={user.username} appTitle={appTitle} />;
}
