/**
 * Tiny JSON response helpers — every API route returns through these so we
 * stay consistent on Content-Type, status codes, and error shapes.
 */

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
}

export function error(
  message: string,
  status = 400,
  extra: Record<string, unknown> = {}
): Response {
  return json({ error: message, ...extra }, { status })
}

export function unauthorized(message = 'Unauthorized'): Response {
  return error(message, 401)
}

export function notFound(message = 'Not found'): Response {
  return error(message, 404)
}

export function methodNotAllowed(allowed: string[]): Response {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      Allow: allowed.join(', '),
    },
  })
}

export function serverError(message = 'Internal server error'): Response {
  return error(message, 500)
}
