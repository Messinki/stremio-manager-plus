/**
 * Session management — opaque random tokens stored in D1, delivered as
 * HttpOnly cookies. No signing key, no JWT library, no client-side handling.
 */

import type { Env, SessionRow } from './types'

const SESSION_COOKIE = 'session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const SESSION_TTL_SEC = SESSION_TTL_MS / 1000

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generateToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export function getSessionCookie(request: Request): string | null {
  const header = request.headers.get('Cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === SESSION_COOKIE) return rest.join('=')
  }
  return null
}

export function buildSessionCookie(token: string): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${SESSION_TTL_SEC}`,
  ].join('; ')
}

export function buildClearSessionCookie(): string {
  return [
    `${SESSION_COOKIE}=`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0',
  ].join('; ')
}

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = generateToken()
  const now = Date.now()
  const expiresAt = now + SESSION_TTL_MS
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  )
    .bind(token, userId, expiresAt, now)
    .run()
  return token
}

export async function getSession(env: Env, token: string): Promise<SessionRow | null> {
  const row = await env.DB.prepare(
    'SELECT token, user_id, expires_at, created_at FROM sessions WHERE token = ? AND expires_at > ?'
  )
    .bind(token, Date.now())
    .first<SessionRow>()
  return row ?? null
}

export async function deleteSession(env: Env, token: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
}
