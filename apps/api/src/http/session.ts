import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { config } from '../config/env.js';

const COOKIE_NAME = 'dashy_session';

export interface Session {
  userId: string;
  workspaceId: string;
}

/**
 * Registers @fastify/cookie with the signing secret on the root instance (not
 * encapsulated) so getSession/setSession/clearSession work everywhere. server.ts
 * awaits this once before registering routes.
 */
export async function sessionPlugin(app: FastifyInstance): Promise<void> {
  await app.register(cookie, { secret: config.SESSION_SECRET });
}

/** Read + unsign the session cookie; null if absent or invalid. */
export function getSession(req: FastifyRequest): Session | null {
  const raw = req.cookies[COOKIE_NAME];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || unsigned.value === null) return null;
  try {
    const parsed = JSON.parse(unsigned.value) as Partial<Session>;
    if (typeof parsed.userId !== 'string' || typeof parsed.workspaceId !== 'string') return null;
    return { userId: parsed.userId, workspaceId: parsed.workspaceId };
  } catch {
    return null;
  }
}

/** Write a signed, httpOnly session cookie. */
export function setSession(reply: FastifyReply, s: Session): void {
  reply.setCookie(COOKIE_NAME, JSON.stringify(s), {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    path: '/',
  });
}

/** Clear the session cookie. */
export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}
