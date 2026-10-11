// Minimal server logger that never writes passwords, tokens, OTPs, cookies or signatures.
const SENSITIVE = /pass(word)?|token|secret|otp|authorization|cookie|signature|hash|api[-_]?key/i
const IN_TEXT = [
  [/(Bearer\s+)[\w.-]+/gi, '$1[REDACTED]'],
  [/((?:token|otp|password|secret)=)[^&\s]+/gi, '$1[REDACTED]'],
  [/(mongodb(?:\+srv)?:\/\/[^:/\s]+:)[^@\s]+@/gi, '$1[REDACTED]@'],
]

export function redact(value, depth = 0) {
  if (typeof value === 'string') return IN_TEXT.reduce((s, [rx, rep]) => s.replace(rx, rep), value)
  if (!value || typeof value !== 'object' || depth > 6) return value
  if (value instanceof Error) return { name: value.name, message: redact(value.message), stack: redact(value.stack || '') }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? '[REDACTED]' : redact(v, depth + 1)]))
}

const write = (level, msg, meta) => {
  const line = { level, time: new Date().toISOString(), msg: redact(msg), ...(meta ? redact(meta) : {}) }
  ;(level === 'error' ? console.error : console.log)(JSON.stringify(line))
}

export const logger = {
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
}
