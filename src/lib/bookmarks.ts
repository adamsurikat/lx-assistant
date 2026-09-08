import { readFile } from "fs/promises";
import path from "path";

export interface BookmarkLink {
  type: "link";
  title: string;
  url: string;
}

export interface BookmarkFolder {
  type: "folder";
  title: string;
  children: BookmarkNode[];
}

export type BookmarkNode = BookmarkLink | BookmarkFolder;

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Netscape bookmark files (exported by Firefox/Chrome/etc.) are a loose,
// non-XML HTML dialect: folders are `<H3>` headings each immediately
// followed by a `<DL><p>` opening their nested `<DT>` entries, closed by a
// matching `</DL><p>`. We don't pull in a full HTML parser for this one
// format — a small stack-based scan over the handful of tags we care about
// is enough.
export function parseBookmarksHtml(html: string): BookmarkFolder {
  const root: BookmarkFolder = { type: "folder", title: "Bookmarks", children: [] };
  const stack: BookmarkNode[][] = [];
  let pendingFolder: BookmarkFolder | null = null;

  // Attribute values (e.g. base64 favicon data URIs) can contain literal
  // `>` characters inside quotes, so a naive `[^>]*` for the attribute list
  // would truncate mid-tag. Match quoted strings as whole units instead.
  const attrs = `(?:[^>"']|"[^"]*"|'[^']*')*`;
  const tokenPattern = new RegExp(
    `<DT><H3\\b${attrs}>([\\s\\S]*?)<\\/H3>|<DT><A\\b(${attrs})>([\\s\\S]*?)<\\/A>|<DL><p>|<\\/DL>`,
    "gi"
  );
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(html))) {
    const [full, folderTitle, linkAttrs, linkTitle] = match;

    if (folderTitle !== undefined) {
      const folder: BookmarkFolder = {
        type: "folder",
        title: decodeEntities(folderTitle.trim()),
        children: [],
      };
      const target = stack[stack.length - 1] ?? root.children;
      target.push(folder);
      pendingFolder = folder;
      continue;
    }

    if (linkAttrs !== undefined) {
      const hrefMatch = /HREF="([^"]*)"/i.exec(linkAttrs);
      if (hrefMatch) {
        const link: BookmarkLink = {
          type: "link",
          title: decodeEntities((linkTitle ?? "").trim()) || hrefMatch[1],
          url: decodeEntities(hrefMatch[1]),
        };
        const target = stack[stack.length - 1] ?? root.children;
        target.push(link);
      }
      continue;
    }

    if (full.toUpperCase() === "<DL><P>") {
      stack.push(pendingFolder ? pendingFolder.children : root.children);
      pendingFolder = null;
      continue;
    }

    if (full.toUpperCase() === "</DL>") {
      stack.pop();
      continue;
    }
  }

  return root;
}

// Firefox/Chrome exports include several top-level folders (a default
// "Mozilla Firefox" links folder, "Bookmarks bar", "Bookmarks Toolbar",
// "Other Bookmarks", etc). We only care about whatever the user actually
// pinned to their toolbar, so find the first folder whose title mentions
// "toolbar" and use that as the effective root.
function findToolbarFolder(root: BookmarkFolder): BookmarkFolder {
  for (const node of root.children) {
    if (node.type === "folder" && /toolbar/i.test(node.title)) {
      return node;
    }
  }
  return root;
}

// Personal reorganization of the toolbar folder for the Links page: fold a
// handful of related folders into one combined category, and drop folders
// that aren't useful here. Adjust these lists as the bookmarks structure
// changes.
const MERGED_GROUPS: { title: string; folders: string[] }[] = [];
const HIDDEN_FOLDERS = ["App", "Kontor", "Utveckling", "Deploy", "Felsökning"];

function applyMergedGroups(root: BookmarkFolder): BookmarkFolder {
  let children = root.children;
  for (const group of MERGED_GROUPS) {
    const wanted = new Set(group.folders.map((t) => t.toLowerCase()));
    const nextChildren: BookmarkNode[] = [];
    let mergedNode: BookmarkFolder | null = null;
    for (const node of children) {
      if (node.type === "folder" && wanted.has(node.title.toLowerCase())) {
        if (!mergedNode) {
          mergedNode = { type: "folder", title: group.title, children: [...node.children] };
          nextChildren.push(mergedNode);
        } else {
          mergedNode.children.push(...node.children);
        }
      } else {
        nextChildren.push(node);
      }
    }
    children = nextChildren;
  }
  return { ...root, children };
}

function applyHiddenFolders(root: BookmarkFolder): BookmarkFolder {
  const hidden = new Set(HIDDEN_FOLDERS.map((t) => t.toLowerCase()));
  return {
    ...root,
    children: root.children.filter(
      (node) => !(node.type === "folder" && hidden.has(node.title.toLowerCase()))
    ),
  };
}

/**
 * Reads and parses `bookmarks.html` from the project root. This file is a
 * personal Firefox/Chrome bookmark export, deliberately gitignored — it's
 * expected to exist locally but isn't committed. Returns an empty root
 * folder (rather than throwing) if the file isn't present, so the Links
 * page can render a friendly empty state instead of erroring.
 */
export async function readBookmarks(): Promise<BookmarkFolder> {
  const filePath = path.join(process.cwd(), "bookmarks.html");
  try {
    const html = await readFile(filePath, "utf-8");
    const toolbar = findToolbarFolder(parseBookmarksHtml(html));
    return applyHiddenFolders(applyMergedGroups(toolbar));
  } catch {
    return { type: "folder", title: "Bookmarks", children: [] };
  }
}
