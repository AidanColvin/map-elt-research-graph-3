import { test, expect } from '@playwright/test';
import { safeUrl } from '../../lib/markdownSafe';

const BASE = 'http://localhost:3000';

// A body larger than the 16 KB proxy cap.
const OVERSIZED = JSON.stringify({ sector: 'x'.repeat(20_000) });

/**
 * Unit tests for the markdown URL allowlist. These prove the XSS guard rejects
 * dangerous schemes (incl. case- and control-char-obfuscated ones) while
 * keeping the link types real reports use.
 */
test.describe('safeUrl markdown link allowlist', () => {
  test('strips dangerous schemes', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('JavaScript:alert(1)')).toBe('');
    expect(safeUrl('  javascript:alert(1)')).toBe('');
    expect(safeUrl('java\tscript:alert(1)')).toBe(''); // tab-obfuscated
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeUrl('vbscript:msgbox(1)')).toBe('');
    expect(safeUrl('//evil.example.com')).toBe(''); // protocol-relative
  });

  test('keeps the link types reports use', () => {
    expect(safeUrl('https://www.sec.gov/x')).toBe('https://www.sec.gov/x');
    expect(safeUrl('http://example.com')).toBe('http://example.com');
    expect(safeUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(safeUrl('#sources')).toBe('#sources');
    expect(safeUrl('/local/path')).toBe('/local/path');
    expect(safeUrl('')).toBe('');
  });
});

/**
 * The backend proxies are unauthenticated and forward to an expensive backend.
 * These tests prove the proxy rejects abusive input cleanly (4xx) BEFORE doing
 * any upstream work — so none of them touch the real backend.
 */
test.describe('proxy input hardening', () => {
  test('run-pipeline rejects malformed JSON with 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/run-pipeline`, {
      data: '{not valid json',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(400);
  });

  test('run-pipeline rejects an oversized body with 413', async ({ request }) => {
    const res = await request.post(`${BASE}/api/run-pipeline`, {
      data: OVERSIZED,
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(413);
  });

  test('run-pipeline rejects a missing sector with 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/run-pipeline`, {
      data: JSON.stringify({ notSector: 'x' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(400);
  });

  test('run-pipeline rejects an over-long companies list with 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/run-pipeline`, {
      data: JSON.stringify({ sector: 'oncology', companies: Array(50).fill('Acme') }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(400);
  });

  test('run-pipeline-stream rejects malformed JSON with 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/run-pipeline-stream`, {
      data: 'nope',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(400);
  });

  test('partnerships rejects a missing query with 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/partnerships`, {
      data: JSON.stringify({ type: 'company' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(400);
  });
});
