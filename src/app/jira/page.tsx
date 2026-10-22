import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { JiraBulkActions } from "@/components/JiraBulkActions";

export default async function JiraPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="jira" />
      <div className="m-3 flex flex-1 flex-col gap-3 md:flex-row">
        <JiraBulkActions />
        <main aria-label="Jira workspace" className="nb-panel-sm min-h-64 min-w-0 flex-1" />
      </div>
    </div>
  );
}
