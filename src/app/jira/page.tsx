import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { JiraWorkspace } from "@/components/JiraWorkspace";
import { getCachedJiraFixVersions } from "@/lib/jiraFixVersionCache";

export default async function JiraPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const versions = await getCachedJiraFixVersions(session.user.id);

  return (
    <div className="flex h-screen flex-col">
      <AppHeader active="jira" />
      <JiraWorkspace initialFixVersions={versions} />
    </div>
  );
}
