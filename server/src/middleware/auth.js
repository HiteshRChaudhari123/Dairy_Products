import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { Session } from '../models/auth.js'
import User from '../models/User.js'
import { httpError } from '../utils/http.js'

export const ACCESS_TTL = 15 * 60 // seconds
export const REFRESH_TTL = 7 * 24 * 60 * 60
const REUSE_GRACE_MS = 30 * 1000 // two tabs refreshing at the same moment is not an attack
const JWT_OPTS = { algorithm: 'HS256', issuer: 'gavyora-api', audience: 'gavyora' }

/** Cookie flags for a given configuration: HttpOnly always, Secure in production (or whenever SameSite=None). */
export function cookieOptions(cfg = env) {
  return {
    httpOnly: true,
    secure: cfg.isProd || cfg.cookieSameSite === 'none',
    sameSite: cfg.cookieSameSite,
  }
}

const accessCookie = () => ({ ...cookieOptions(), maxAge: ACCESS_TTL * 1000, path: '/' })
const refreshCookie = () => ({ ...cookieOptions(), maxAge: REFRESH_TTL * 1000, path: '/api/auth' })

/**
 * Start (or continue) a session and set both cookies. Tokens are only returned in the body for the mobile app
 * (header X-Client-Type: mobile), which keeps them in secure device storage; the website never sees them, so a
 * script running in the page cannot read or exfiltrate them.
 */
export async function issueTokens(req, res, user, family = crypto.randomUUID()) {
  const jti = crypto.randomUUID()
  await Session.create({
    user: user._id,
    jti,
    family,
    expiresAt: new Date(Date.now() + REFRESH_TTL * 1000),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
  })
  const access = jwt.sign({ sub: user.id, role: user.role, v: user.tokenVersion, sid: family }, env.accessSecret, {
    ...JWT_OPTS,
    expiresIn: ACCESS_TTL,
  })
  const refresh = jwt.sign({ sub: user.id, v: user.tokenVersion, jti, fam: family }, env.refreshSecret, {
    ...JWT_OPTS,
    expiresIn: REFRESH_TTL,
  })
  res.cookie('gv_at', access, accessCookie())
  res.cookie('gv_rt', refresh, refreshCookie())
  return req.headers['x-client-type'] === 'mobile' ? { accessToken: access, refreshToken: refresh } : {}
}

export function clearTokens(res) {
  const { maxAge: _a, ...at } = accessCookie()
  const { maxAge: _r, ...rt } = refreshCookie()
  res.clearCookie('gv_at', at)
  res.clearCookie('gv_rt', rt)
}

export const verifyRefresh = (token) => jwt.verify(token, env.refreshSecret, JWT_OPTS)

export const revokeFamily = (family) => Session.updateMany({ family, revokedAt: null }, { revokedAt: new Date() })
export const revokeAllSessions = (userId) => Session.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() })

/**
 * Rotate a refresh token. Returns the user, or throws 401. A token that was already rotated away is treated as stolen
 * (unless it is within a few seconds of its rotation) and the whole login family is revoked.
 */
export async function rotateRefresh(req, res, token) {
  let payload
  try {
    payload = verifyRefresh(token)
  } catch {
    throw httpError(401, 'Session expired, please log in again')
  }
  const session = await Session.findOne({ jti: payload.jti })
  const user = session && (await User.findById(payload.sub))
  const valid = user && !user.isBlocked && user.tokenVersion === payload.v && String(session.user) === String(user._id)
  if (!valid) throw httpError(401, 'Session expired, please log in again')
  if (session.revokedAt) {
    const withinGrace = session.replacedBy && Date.now() - session.revokedAt.getTime() < REUSE_GRACE_MS
    const familyAlive = await Session.exists({ family: session.family, revokedAt: null })
    if (!withinGrace || !familyAlive) {
      await revokeFamily(session.family)
      throw httpError(401, 'Session expired, please log in again')
    }
  }
  const tokens = await issueTokens(req, res, user, session.family)
  if (!session.revokedAt) {
    session.revokedAt = new Date()
    session.replacedBy = 'rotated'
    await session.save()
  }
  return { user, tokens }
}

function readAccessToken(req) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7)
  return req.cookies?.gv_at
}

/** Returns the user for a valid, unrevoked access token, or throws 401/403. */
async function authenticate(req) {
  const token = readAccessToken(req)
  if (!token) throw httpError(401, 'Please log in')
  let payload
  try {
    payload = jwt.verify(token, env.accessSecret, JWT_OPTS)
  } catch (e) {
    const err = httpError(401, e.name === 'TokenExpiredError' ? 'Session expired' : 'Invalid session')
    err.code = 'TOKEN_EXPIRED'
    throw err
  }
  const [user, live] = await Promise.all([
    User.findById(payload.sub),
    Session.exists({ family: payload.sid, revokedAt: null, expiresAt: { $gt: new Date() } }),
  ])
  if (!user || user.tokenVersion !== payload.v || !live) {
    const err = httpError(401, 'Session expired')
    err.code = 'TOKEN_EXPIRED'
    throw err
  }
  if (user.isBlocked) throw httpError(403, 'Your account has been blocked. Contact support.')
  req.sessionFamily = payload.sid
  return user
}

/** The user for a valid access token, or null (never throws). */
export async function currentUser(req) {
  try {
    return readAccessToken(req) ? await authenticate(req) : null
  } catch {
    return null
  }
}

/** Attaches req.user if a valid token is present; never rejects. */
export async function optionalAuth(req, _res, next) {
  try {
    if (readAccessToken(req)) req.user = await authenticate(req)
  } catch {
    /* treat as a guest */
  }
  next()
}

export async function protect(req, _res, next) {
  req.user = await authenticate(req)
  next()
}
protect.security = { type: 'auth' }

/** Allow only the given roles. superadmin is always allowed where admin is. */
export const allow = (...roles) => {
  const fn = (req, _res, next) => {
    const role = req.user?.role
    if (!role) throw httpError(401, 'Please log in')
    if (roles.includes(role) || (role === 'superadmin' && roles.includes('admin'))) return next()
    throw httpError(403, 'You do not have access to this')
  }
  fn.security = { type: 'role', roles }
  return fn
}

/** Admins need the named permission; super admins have every permission. */
export const can = (permission) => {
  const fn = (req, _res, next) => {
    const u = req.user
    if (!u) throw httpError(401, 'Please log in')
    if (u.role === 'superadmin') return next()
    if (u.role === 'admin' && u.permissions.includes(permission)) return next()
    throw httpError(403, `Missing permission: ${permission}`)
  }
  fn.security = { type: 'permission', permission }
  return fn
}
