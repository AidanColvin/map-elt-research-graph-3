/**
 * verifyAuth.ts
 * Single place for server-side Firebase token verification.
 * Call verifyAuth(request) as the first line of every API route handler.
 * Returns decoded token on success. Throws a 401 Response on failure.
 * Never logs the raw token.
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { NextRequest } from 'next/server';

function initAdmin() {
  if (getApps().length > 0) return;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  initializeApp({ credential: cert(JSON.parse(sa)) });
}

export async function verifyAuth(request: NextRequest) {
  initAdmin();
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    return await getAuth().verifyIdToken(token);
  } catch {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
