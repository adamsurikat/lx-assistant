export const DEFAULT_ADMIN_EMAIL = "adam.esbjornsson@surikat.se";

export function getAdminEmail(): string {
  // Read at runtime so the same build can use different deployment settings.
  const email = (process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("ADMIN_EMAIL must be a valid email address.");
  }
  return email;
}

// Admin access is configured on the server and cannot be granted by client input.
export function isAdminEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === getAdminEmail();
}
