/**
 * tests/auth/supabaseClients.test.ts
 *
 * Tests for separated Supabase clients (browser, server, middleware) with @supabase/ssr.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCookieStore } = vi.hoisted(() => ({
  mockCookieStore: {
    getAll: vi.fn(() => [{ name: 'sb-auth-token', value: 'dummy-token' }]),
    set: vi.fn(),
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

describe('Supabase Client Architecture (@supabase/ssr)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  });

  it('creates browser client with correct configuration', async () => {
    const { createClient } = await import('@/lib/supabase/client');
    const client = createClient();

    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(typeof client.from).toBe('function');
  });

  it('creates server client integrating with Next.js cookies', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    const client = await createClient();

    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(typeof client.from).toBe('function');
  });

  it('middleware updateSession refreshes session without error', async () => {
    const { updateSession } = await import('@/lib/supabase/middleware');

    const mockRequest = {
      cookies: {
        getAll: vi.fn(() => []),
        set: vi.fn(),
      },
      headers: new Headers(),
      url: 'http://localhost:3000/planear',
    } as unknown as import('next/server').NextRequest;

    const response = await updateSession(mockRequest);
    expect(response).toBeDefined();
    expect(response.status).toBe(200);
  });
});
