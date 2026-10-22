import { prisma } from "@/lib/prisma";
import { fetchJiraFixVersions, getJiraConfigForUser } from "@/lib/jira";

export async function getCachedJiraFixVersions(userId: string): Promise<string[] | null> {
  const cached = await prisma.jiraFixVersionCache.findUnique({ where: { userId } });
  return cached ? JSON.parse(cached.versionsJson) as string[] : null;
}

type PendingRefresh = { promise: Promise<string[]>; controller: AbortController };
const globalCache = globalThis as unknown as { jiraFixVersionRefreshes?: Map<string, PendingRefresh> };
// Share work across route bundles and development hot reloads.
const refreshes = globalCache.jiraFixVersionRefreshes ??= new Map<string, PendingRefresh>();

// Concurrent browser tabs share a refresh. Failed lookups leave the previous
// successful snapshot intact, including its timestamp.
export function refreshJiraFixVersions(userId: string): Promise<string[]> {
  const pending = refreshes.get(userId);
  if (pending) return pending.promise;

  const controller = new AbortController();
  const refresh = (async () => {
    const config = await getJiraConfigForUser(userId);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]);
    const versions = await fetchJiraFixVersions(config, signal);
    signal.throwIfAborted();
    await prisma.jiraFixVersionCache.upsert({
      where: { userId },
      create: { userId, versionsJson: JSON.stringify(versions) },
      update: { versionsJson: JSON.stringify(versions) },
    });
    return versions;
  })().finally(() => {
    if (refreshes.get(userId)?.promise === refresh) refreshes.delete(userId);
  });
  refreshes.set(userId, { promise: refresh, controller });
  return refresh;
}

export async function invalidateJiraFixVersionCache(userId: string) {
  const pending = refreshes.get(userId);
  pending?.controller.abort();
  // Let an in-progress write settle before deleting it, so a connection
  // change cannot restore the previous connection's snapshot afterward.
  if (pending) await pending.promise.catch(() => {});
  await prisma.jiraFixVersionCache.deleteMany({ where: { userId } });
}
