import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { JiraWorkspace } from "@/components/JiraWorkspace";

export default async function JiraPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="jira" />
      <JiraWorkspace />
    </div>
  );
}
