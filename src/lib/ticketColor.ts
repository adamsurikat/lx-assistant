// A colorful, distinct palette used to assign UI colors to tickets on the
// calendar. Shared between the Jira sync route (round-robin assignment) and
// the manual ticket lookup route (deterministic hash-based assignment).
export const TICKET_COLOR_PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e",
];

/**
 * Deterministically picks a palette color for a given ticket key, so the
 * same ticket always gets the same color even across separate lookups.
 */
export function colorForTicketKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % TICKET_COLOR_PALETTE.length;
  return TICKET_COLOR_PALETTE[index];
}
