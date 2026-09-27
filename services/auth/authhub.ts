/**
 * Client for AuthHub's OAuth 2.0 / OIDC API (docs: https://amosquety.github.io/AuthHub/).
 * Endpoint paths and grant parameters below are taken directly from AuthHub's own
 * docs/api-reference/oauth_token.md and docs/getting-started/pkce.md.
 */

export interface AuthHubTokens {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresAt: number; // ms since epoch
}

export interface AuthHubConfig {
  baseUrl: string;
  clientId: string;
  redirectUri: string;
}

export const getAuthHubConfig = (): AuthHubConfig => {
  const baseUrl = process.env.EXPO_PUBLIC_AUTHHUB_URL;
  const clientId = process.env.EXPO_PUBLIC_AUTHHUB_CLIENT_ID;

  if (!baseUrl || !clientId) {
    throw new Error(
      'AuthHub is not configured. Set EXPO_PUBLIC_AUTHHUB_URL and EXPO_PUBLIC_AUTHHUB_CLIENT_ID in your .env.'
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    clientId,
    // Must exactly match a redirect URI registered for this client in AuthHub.
    redirectUri: 'rentaltrack://oauthredirect',
  };
};

export const getAuthHubDiscovery = (baseUrl: string) => ({
  authorizationEndpoint: `${baseUrl}/api/v1/oauth/authorize`,
  tokenEndpoint: `${baseUrl}/api/v1/oauth/token`,
  revocationEndpoint: `${baseUrl}/api/v1/auth/logout`,
});

class AuthHubApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthHubApiError';
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
}

const toTokens = (data: TokenResponse): AuthHubTokens => ({
  accessToken: data.access_token,
  refreshToken: data.refresh_token,
  idToken: data.id_token,
  expiresAt: Date.now() + data.expires_in * 1000,
});

const postForm = async (url: string, body: Record<string, string>): Promise<TokenResponse> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AuthHubApiError(data.error_description || data.error || 'AuthHub token request failed');
  }

  return data as TokenResponse;
};

/**
 * Exchanges an authorization code (from the AuthSession PKCE flow) for tokens.
 */
export const exchangeAuthorizationCode = async (
  config: AuthHubConfig,
  code: string,
  codeVerifier: string
): Promise<AuthHubTokens> => {
  const { tokenEndpoint } = getAuthHubDiscovery(config.baseUrl);
  const data = await postForm(tokenEndpoint, {
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    code_verifier: codeVerifier,
    redirect_uri: config.redirectUri,
  });
  return toTokens(data);
};

export const refreshAuthHubTokens = async (
  config: AuthHubConfig,
  refreshToken: string
): Promise<AuthHubTokens> => {
  const { tokenEndpoint } = getAuthHubDiscovery(config.baseUrl);
  const data = await postForm(tokenEndpoint, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
  });
  return toTokens(data);
};

/**
 * Revokes the current session server-side. Best-effort: callers should clear
 * local session state regardless of whether this succeeds.
 */
export const revokeAuthHubSession = async (config: AuthHubConfig, accessToken: string): Promise<void> => {
  const { revocationEndpoint } = getAuthHubDiscovery(config.baseUrl);
  await fetch(revocationEndpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
};

/**
 * Creates an AuthHub account. Per docs/api-reference/auth_register.md this only
 * creates the user — it does not return tokens, so callers still need to run
 * the OAuth/PKCE login flow afterward to authenticate.
 */
export const registerAuthHubAccount = async (
  config: AuthHubConfig,
  email: string,
  password: string,
  name?: string
): Promise<void> => {
  const response = await fetch(`${config.baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AuthHubApiError(data.error_description || data.error || 'AuthHub registration failed');
  }
};
