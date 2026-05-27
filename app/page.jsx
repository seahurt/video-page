import { redirect } from "next/navigation";
import VideoBrowser from "../components/VideoBrowser.jsx";
import { currentUser } from "../lib/auth.js";
import { appTitle } from "../lib/site-config.js";

export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return <VideoBrowser username={user.username} appTitle={appTitle} />;
}
