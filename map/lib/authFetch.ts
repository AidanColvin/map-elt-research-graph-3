/**
 * authFetch — wraps fetch() with a Firebase ID token Authorization header.
 * Use everywhere the client calls a protected /api/* route.
 * Returns a standard Response — callers handle errors as normal.
 */
import { getFirebaseAuth } from './firebase';

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  // Use the app's safe accessor, which returns null when Firebase isn't
  // configured (the keyless browser-local gate). Calling firebase/auth's raw
  // getAuth() here throws `auth/no-app` in that mode, which would break EVERY
  // data fetch for guests — the exact flow "Continue as guest" promises to
  // support. Tolerate a missing/erroring auth and fall back to an anonymous
  // request; the backend already allows anonymous calls.
  let token: string | null = null;
  try {
    const user = getFirebaseAuth()?.currentUser;
    token = user ? await user.getIdToken() : null;
  } catch {
    token = null;
  }
  return fetch(input, {
    ...init,
    headers: {
      ...init.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
