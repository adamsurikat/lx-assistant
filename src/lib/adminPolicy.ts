export const ADMIN_EMAIL = "adam.esbjornsson@surikat.se";

// Admin access belongs to this account and cannot be granted by client input.
export function isAdminEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === ADMIN_EMAIL;
}
