/**
 * Password hashing for the auth layer.
 *
 * PBKDF2-SHA256, 600k iterations (OWASP 2023 recommendation), 16-byte random salt,
 * 32-byte derived key. Both salt and hash are stored as base64 in `users` table.
 *
 * Web Crypto is built into Workers — no npm package needed.
 */

const PBKDF2_ITERATIONS = 600_000
const SALT_BYTES = 16
const HASH_BYTES = 32

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

async function deriveHash(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    HASH_BYTES * 8
  )

  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await deriveHash(password, salt)
  return {
    hash: bytesToBase64(hash),
    salt: bytesToBase64(salt),
  }
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  const salt = base64ToBytes(storedSalt)
  const expected = base64ToBytes(storedHash)
  const actual = await deriveHash(password, salt)

  // Constant-time comparison so timing can't leak info about the hash.
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) {
    diff |= actual[i] ^ expected[i]
  }
  return diff === 0
}
