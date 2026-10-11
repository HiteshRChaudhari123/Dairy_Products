// Request hardening shared by every API route.
import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { httpError } from '../utils/http.js'

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Query strings become flat { key: string } objects: no nested objects or arrays, so a value like
 * ?status[$ne]=x can never reach a Mongo filter as an operator. Repeated keys keep the first value.
 */
export function parseQuery(str) {
  const out = {}
  for (const [k, v] of new URLSearchParams(str)) {
    if (FORBIDDEN_KEYS.has(k) || k.includes('[') || k.startsWith('$') || k in out) continue
    out[k] = v
  }
  return out
}

/** Rejects JSON bodies with Mongo operator keys ($gt, $where…), dotted paths or prototype-pollution keys. */
export function rejectUnsafeKeys(req, _res, next) {
  const walk = (v, depth) => {
    if (depth > 10) throw httpError(400, 'Request body is nested too deeply')
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1))
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        if (k.startsWith('$') || k.includes('.') || FORBIDDEN_KEYS.has(k)) throw httpError(400, 'Request contains a field name that is not allowed')
        walk(v[k], depth + 1)
      }
    }
  }
  walk(req.body, 0)
  next()
}

/** Attaches a request id (echoed in X-Request-Id and in 500 responses) so a user's report can be found in the logs. */
export function requestId(req, res, next) {
  req.id = crypto.randomUUID()
  res.setHeader('X-Request-Id', req.id)
  next()
}

/** Responses carrying personal data must not be stored by browsers or shared caches. */
export function noStore(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store')
  next()
}

export const isAllowedOrigin = (origin) => env.clientUrls.includes(origin)

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF protection for cookie-authenticated requests: a state-changing request that carries our auth cookies must come
 * from one of our own origins. Requests authenticated with a Bearer token (mobile app) carry no ambient credentials and
 * are not affected. CORS alone is not enough: it limits who can read responses, not who can send requests.
 */
export function originCheck(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next()
  const usesCookies = !!(req.cookies?.gv_at || req.cookies?.gv_rt)
  if (!usesCookies) return next()
  let origin = req.headers.origin
  if (!origin && req.headers.referer) {
    try {
      origin = new URL(req.headers.referer).origin
    } catch {
      origin = undefined
    }
  }
  if (!origin || !isAllowedOrigin(origin)) return next(httpError(403, 'Request origin not allowed'))
  next()
}
