// Shared palette for the post-it board, keyed by the `color` field stored on
// each PostIt row. Keep this list in sync with the CSS variables defined in
// globals.css (`--postit-*`).
export const POSTIT_COLORS = ["yellow", "pink", "green", "blue", "orange", "purple", "red"] as const;

export type PostItColor = (typeof POSTIT_COLORS)[number];

// Dispatched on `window` whenever a note is added or removed, so the nav
// badge in AppHeader can refresh its count without polling.
export const POSTITS_CHANGED_EVENT = "postits:changed";

// Matches Jira issue keys like "PROJ-123" (project prefix of 2-10 upper-case
// letters/digits, then a dash, then the issue number). Used to detect when a
// note's text should be rendered as a clickable Jira reference.
export const JIRA_TICKET_KEY_REGEX = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/g;

// Matches http(s) URLs and bare "www."-prefixed domains, so note text that
// looks like a link can be rendered as a clickable hyperlink. Trailing
// punctuation (., ,, ), etc.) is stripped by the caller so a URL at the end
// of a sentence doesn't swallow the period.
export const URL_REGEX = /\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+/gi;
