// A neo-brutalist palette (orange / pink / green shades) used to assign UI
// colors to tickets on the calendar. Colors are assigned per Jira project
// (the prefix before the "-" in a ticket key, e.g. "LSL" in "LSL-1634") so
// every ticket in the same project shares a color on the calendar.
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

/** Extracts the Jira project key prefix from a ticket key, e.g. "LSL-1634" -> "LSL". */
function projectKeyOf(ticketKey: string): string {
  return ticketKey.split("-")[0] ?? ticketKey;
}

/**
 * Deterministically picks a palette color for a given ticket's Jira project,
 * so every ticket in the same project always gets the same color, regardless
 * of which ticket triggers the lookup/sync first.
 */
export function colorForTicketKey(key: string): string {
  const project = projectKeyOf(key);
  let hash = 0;
  for (let i = 0; i < project.length; i++) {
    hash = (hash * 31 + project.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % TICKET_COLOR_PALETTE.length;
  return TICKET_COLOR_PALETTE[index];
}
