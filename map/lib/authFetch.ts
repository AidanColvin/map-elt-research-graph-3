/**
 * authFetch — wraps fetch() with a Firebase ID token Authorization header.
 * Use everywhere the client calls a protected /api/* route.
 * Returns a standard Response — callers handle errors as normal.
 */
import { getAuth } from 'firebase/auth';

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const user = getAuth().currentUser;
  const token = user ? await user.getIdToken() : null;
  return fetch(input, {
    ...init,
    headers: {
      ...init.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
