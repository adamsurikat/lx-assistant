// A neo-brutalist palette (orange / pink / green shades) used to assign UI
// colors to tickets on the calendar. Shared between the Jira sync route
// (round-robin assignment) and the manual ticket lookup route (deterministic
// hash-based assignment).
export const TICKET_COLOR_PALETTE = [
  "#FF5F1F", // orange
  "#FF3EA5", // pink
  "#39D98A", // green
  "#FF8A3D", // light orange
  "#FF7AC6", // light pink
  "#7CF0B2", // light green
  "#D94A0C", // dark orange
  "#C4187E", // dark pink
  "#1FA866", // dark green
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
