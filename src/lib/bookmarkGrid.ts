import type { BookmarkFolder, BookmarkLink, BookmarkNode } from "@/lib/bookmarks";

export interface GridCell {
  // The link for this tenant/environment combo when no backend override is
  // implied by the title (e.g. "Stena Local" for tenant Stena, env Local).
  primary: BookmarkLink;
  // Alternate "<env> to <backendEnv>" links for the same tenant/frontend
  // environment (e.g. "Stena Local to FAT" -> backend "FAT"), offered as a
  // choice instead of always opening `primary`.
  backendVariants: { backend: string; link: BookmarkLink }[];
}

export interface ServiceGrid {
  title: string;
  environments: string[];
  tenants: string[];
  cells: Record<string, Record<string, GridCell>>;
  other: BookmarkLink[];
}

// Known environment names, in the column order we want them displayed.
// Keys are matched case-insensitively against tokens in the link title.
const ENV_ALIASES: Record<string, string> = {
  local: "Local",
  docker: "Docker",
  fat: "FAT",
  staging: "Staging",
  prod: "Prod",
  production: "Prod",
};
const ENV_ORDER = ["Local", "Docker", "FAT", "Staging", "Prod"];

const DEFAULT_TENANT = "Default";

// Finds the word most link titles in this folder start with (e.g. "TAPI"
// for "TAPI Local" / "TAPI FAT" / ...), so it can be stripped before reading
// the tenant/environment out of the remaining words. Requires the word to
// cover a majority of the folder's links, otherwise there's no consistent
// prefix to strip.
function findCommonPrefix(links: BookmarkLink[]): string | null {
  const counts = new Map<string, number>();
  for (const link of links) {
    const first = link.title.trim().split(/\s+/)[0];
    if (!first) continue;
    const key = first.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  if (best && bestCount * 2 >= links.length) {
    return best;
  }
  return null;
}

/**
 * Turns a folder of links (e.g. all the environment URLs for one service)
 * into a tenant x environment grid, by parsing each link's title once the
 * shared service-name prefix is stripped off. Titles that don't fit the
 * "<prefix> [tenant] <environment> [region]" shape fall back to a flat
 * `other` list, EXCEPT "<tenant> <env> to <backendEnv>" links, which are
 * attached as backend-choice variants on the matching <tenant>/<env> cell
 * (e.g. a locally-running frontend that can point at different backend
 * environments) instead of being dropped.
 */
export function buildServiceGrid(folder: BookmarkFolder): ServiceGrid {
  const links = folder.children.filter((n: BookmarkNode): n is BookmarkLink => n.type === "link");
  const prefix = findCommonPrefix(links);

  const cells: Record<string, Record<string, GridCell>> = {};
  const environments = new Set<string>();
  const tenants = new Set<string>();
  const other: BookmarkLink[] = [];
  const pendingVariants: { tenant: string; env: string; backend: string; link: BookmarkLink }[] =
    [];

  for (const link of links) {
    const words = link.title.trim().split(/\s+/);
    if (prefix && words[0]?.toLowerCase() === prefix) {
      words.shift();
    } else if (prefix) {
      // Doesn't share the service's common prefix — not part of the grid.
      other.push(link);
      continue;
    }

    const toIndex = words.findIndex((w) => w.toLowerCase() === "to");
    if (toIndex > 0 && toIndex < words.length - 1) {
      const frontEnv = ENV_ALIASES[words[toIndex - 1]?.toLowerCase()];
      const backEnv = ENV_ALIASES[words[toIndex + 1]?.toLowerCase()];
      if (frontEnv && backEnv) {
        const tenantWords = words.slice(0, toIndex - 1);
        const tenant = tenantWords.join(" ") || DEFAULT_TENANT;
        pendingVariants.push({ tenant, env: frontEnv, backend: backEnv, link });
        continue;
      }
      // Doesn't match "<tenant> <env> to <backendEnv>" — not a variant we
      // can attach anywhere, fall through to the generic "other" bucket.
      other.push(link);
      continue;
    }
    if (toIndex !== -1) {
      // A stray "to" without both a preceding and following environment —
      // can't parse it as a backend variant.
      other.push(link);
      continue;
    }

    const envIndex = words.findIndex((w) => ENV_ALIASES[w.toLowerCase()]);
    if (envIndex === -1) {
      other.push(link);
      continue;
    }

    const env = ENV_ALIASES[words[envIndex].toLowerCase()];
    const tenantWords = [...words.slice(0, envIndex), ...words.slice(envIndex + 1)];
    const tenant = tenantWords.join(" ") || DEFAULT_TENANT;

    environments.add(env);
    tenants.add(tenant);
    cells[tenant] ??= {};
    cells[tenant][env] = { primary: link, backendVariants: [] };
  }

  // Attach backend variants to their matching primary cell now that every
  // primary link has been placed; anything left unmatched (e.g. a "Local to
  // FAT" link with no plain "Local" entry for that tenant) falls back to
  // the flat "other" list rather than being silently dropped.
  for (const variant of pendingVariants) {
    const cell = cells[variant.tenant]?.[variant.env];
    if (cell) {
      cell.backendVariants.push({ backend: variant.backend, link: variant.link });
    } else {
      other.push(variant.link);
    }
  }

  const sortedEnvironments = ENV_ORDER.filter((e) => environments.has(e));
  const sortedTenants = [...tenants].sort((a, b) => {
    if (a === DEFAULT_TENANT) return -1;
    if (b === DEFAULT_TENANT) return 1;
    return a.localeCompare(b);
  });

  return {
    title: folder.title,
    environments: sortedEnvironments,
    tenants: sortedTenants,
    cells,
    other,
  };
}
