import * as AuthSession from 'expo-auth-session';
import { useMemo } from 'react';
import {
  AuthHubTokens,
  exchangeAuthorizationCode,
  getAuthHubConfig,
  getAuthHubDiscovery,
} from '../services/auth/authhub';

// expo-auth-session handles PKCE (code_verifier/code_challenge generation) and
// state validation internally — see https://docs.expo.dev/versions/latest/sdk/auth-session/
export const useAuthHubLogin = () => {
  const config = useMemo(() => getAuthHubConfig(), []);
  const discovery = useMemo(() => getAuthHubDiscovery(config.baseUrl), [config.baseUrl]);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scopes: ['openid', 'profile', 'email'],
      usePKCE: true,
      responseType: AuthSession.ResponseType.Code,
    },
    discovery
  );

  const login = async (): Promise<AuthHubTokens | null> => {
    const result = await promptAsync();

    if (result.type !== 'success' || !result.params.code) {
      if (result.type === 'error') {
        throw new Error(result.error?.message ?? 'AuthHub login failed');
      }
      return null; // user cancelled or dismissed
    }

    const codeVerifier = request?.codeVerifier;
    if (!codeVerifier) {
      throw new Error('Missing PKCE code verifier; cannot complete AuthHub login.');
    }

    return exchangeAuthorizationCode(config, result.params.code, codeVerifier);
  };

  return { login, isRequestReady: !!request, response };
};
