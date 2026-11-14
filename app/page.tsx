import { redirect } from "next/navigation";
import { signedIn } from "@/lib/server";
import Panel from "./panel";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await signedIn())) redirect("/login");
  return <Panel />;
}
