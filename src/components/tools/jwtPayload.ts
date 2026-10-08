/** Keep decoded and previously persisted JWT payloads safe for the text editor. */
export function formatJwtPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2) ?? "";
}
