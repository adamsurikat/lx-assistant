// Minimal Atlassian OAuth 2.0 (3LO) client, used to connect a user's Jira
// Cloud site so we can call the REST API on their behalf without ever
// storing their Atlassian password or a long-lived API token that would
// otherwise require them to trust us indefinitely. Access is short-lived and
// can be revoked by the user at any time from their Atlassian account.
//
// This is deliberately implemented by hand (not via next-auth's built-in
// Atlassian provider) because it needs to *link* the connection to the
// currently signed-in app user (via Google), not sign the user in.

const AUTHORIZE_URL = "https://auth.atlassian.com/authorize";
const TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const ACCESSIBLE_RESOURCES_URL =
  "https://api.atlassian.com/oauth/token/accessible-resources";

// read/write worklogs + issues, read basic profile info, and offline_access
// to receive a refresh token so we can call Jira outside of the OAuth flow.
export const ATLASSIAN_SCOPES =
  "read:jira-work write:jira-work read:jira-user offline_access";

function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.JIRA_OAUTH_CLIENT_ID;
  const clientSecret = process.env.JIRA_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "JIRA_OAUTH_CLIENT_ID / JIRA_OAUTH_CLIENT_SECRET are not set. Register an OAuth 2.0 (3LO) app at developer.atlassian.com and add them to .env.local."
    );
  }
  return { clientId, clientSecret };
}

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const { clientId } = getClientCredentials();
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: clientId,
    scope: ATLASSIAN_SCOPES,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    // Force the consent screen every time so re-connecting after a
    // disconnect always issues a fresh refresh token.
    prompt: "consent",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  const { clientId, clientSecret } = getClientCredentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Atlassian token exchange failed (${res.status}): ${body}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<TokenResponse> {
  const { clientId, clientSecret } = getClientCredentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Atlassian token refresh failed (${res.status}): ${body}`);
  }
  return (await res.json()) as TokenResponse;
}

export interface AccessibleResource {
  id: string; // cloudId
  url: string; // site URL, e.g. https://yourcompany.atlassian.net
  name: string;
  scopes: string[];
}

export async function fetchAccessibleResources(
  accessToken: string
): Promise<AccessibleResource[]> {
  const res = await fetch(ACCESSIBLE_RESOURCES_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Fetching accessible Jira sites failed (${res.status}): ${body}`
    );
  }
  return (await res.json()) as AccessibleResource[];
}
