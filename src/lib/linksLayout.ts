import { LINK_FOLDERS } from "./linksData";

export const DEFAULT_LINK_CARD_ORDER = LINK_FOLDERS.map((folder) => folder.id);
const knownCardIds = new Set(DEFAULT_LINK_CARD_ORDER);

// A saved layout may predate card additions/removals. Keep the user's ordering
// of existing cards, then append any newly introduced cards in default order.
export function normalizeLinkCardOrder(value: unknown): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(value)) {
    for (const id of value) {
      if (typeof id === "string" && knownCardIds.has(id) && !seen.has(id)) {
        order.push(id);
        seen.add(id);
      }
    }
  }
  for (const id of DEFAULT_LINK_CARD_ORDER) {
    if (!seen.has(id)) order.push(id);
  }
  return order;
}

export function readLinkCardOrder(orderJson: string | null | undefined): string[] {
  try {
    return normalizeLinkCardOrder(orderJson ? JSON.parse(orderJson) : null);
  } catch {
    return [...DEFAULT_LINK_CARD_ORDER];
  }
}

// Incoming changes are stricter than stored layouts: reject invalid/duplicate
// IDs instead of silently accepting a malformed request. An empty array resets
// to the default, and missing cards are appended for clients from older builds.
export function isValidLinkCardOrder(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= DEFAULT_LINK_CARD_ORDER.length
    && value.every((id) => typeof id === "string" && knownCardIds.has(id))
    && new Set(value).size === value.length;
}
