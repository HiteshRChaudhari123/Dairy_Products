import crypto from 'node:crypto'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

/**
 * Production builds get a Content-Security-Policy <meta> tag. The inline theme script in index.html is allowed by its
 * SHA-256 hash (so no 'unsafe-inline' for scripts); the API origin comes from VITE_API_URL. Headers that a <meta> tag
 * cannot set (frame-ancestors, HSTS…) are in vercel.json. Dev mode is left alone because Vite's HMR uses inline scripts.
 */
function contentSecurityPolicy(apiUrl) {
  return {
    name: 'gavyora-csp',
    apply: 'build',
    // 'post': hash the inline script as it appears in the final HTML, after Vite's own rewrites.
    transformIndexHtml: { order: 'post', handler: (html) => addPolicy(html) },
  }
  function addPolicy(html) {
    const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
      // Browsers normalise CRLF to LF before hashing inline scripts, so hash the normalised text (Windows checkouts).
      ([, code]) => `'sha256-${crypto.createHash('sha256').update(code.replace(/\r\n?/g, '\n')).digest('base64')}'`,
    )
    const api = apiUrl ? new URL(apiUrl).origin : ''
    const csp = [
      "default-src 'self'",
      `script-src 'self' ${hashes.join(' ')} https://checkout.razorpay.com`,
      // React style attributes and the toast library inject inline styles; scripts stay locked down.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      // Banner/product photos can be any https image an admin pastes.
      "img-src 'self' data: blob: https:",
      `connect-src 'self' ${api} https://api.razorpay.com https://lumberjack.razorpay.com`.replace(/\s+/g, ' '),
      'frame-src https://api.razorpay.com https://checkout.razorpay.com',
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
    return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const { VITE_API_URL } = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), tailwindcss(), contentSecurityPolicy(VITE_API_URL)],
    build: { sourcemap: false }, // don't publish source maps
    server: {
      port: 5173,
      proxy: {
        '/api': `http://localhost:${process.env.API_PORT || 5000}`,
      },
    },
  }
})
