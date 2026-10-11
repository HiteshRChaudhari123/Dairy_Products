import { ZodError } from 'zod'
import { HttpError } from '../utils/http.js'
import { logger } from '../utils/logger.js'

export function notFound(req, res) {
  res.status(404).json({ message: 'Not found' })
}

const GENERIC = { 400: 'Bad request', 401: 'Please log in', 403: 'You do not have access to this', 404: 'Not found', 413: 'Request is too large', 429: 'Too many requests' }

/**
 * Central error handler. Clients only ever see messages we wrote ourselves (HttpError, validation summaries);
 * library, database and unexpected errors get a generic message plus a request id, and the details go to the
 * server log (with secrets redacted). No stack traces or internals are ever sent in a response.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    const issue = err.issues[0]
    return res.status(400).json({ message: `${issue.path.join('.') || 'input'}: ${issue.message}` })
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON in request body' })
  if (err.type === 'entity.too.large') return res.status(413).json({ message: GENERIC[413] })
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id' })
  if (err.code === 11000) return res.status(409).json({ message: 'That value is already in use' })
  if (err.name === 'ValidationError') {
    const first = Object.values(err.errors)[0]
    return res.status(400).json({ message: first?.kind === 'user defined' || first?.kind === 'regexp' ? first.message : 'Invalid input' })
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, ...(err.code ? { code: err.code } : {}) })
  }
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500
  if (status >= 500) logger.error('Unhandled error', { requestId: req.id, method: req.method, path: req.path, error: err })
  res.status(status).json({ message: GENERIC[status] || 'Something went wrong', ...(status >= 500 ? { requestId: req.id } : {}) })
}
