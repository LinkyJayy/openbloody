// Minimal production server for Railway (or any Node host).
// Serves the built PWA from ./dist with SPA fallback, caching rules that keep
// the service worker fresh, and headers WebHID needs. No dependencies.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt']);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  // WebHID must be allowed for this origin.
  'Permissions-Policy': 'hid=(self), usb=(), camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'",
};

function cacheControl(path) {
  if (path.endsWith('sw.js') || path.includes('workbox-') || path.endsWith('.html') || path.endsWith('.webmanifest')) {
    return 'no-cache';
  }
  if (path.includes(`${sep}assets${sep}`)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const full = normalize(join(ROOT, decoded));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null; // path traversal
  try {
    const s = await stat(full);
    if (s.isFile()) return { path: full, size: s.size };
    if (s.isDirectory()) {
      const idx = join(full, 'index.html');
      const si = await stat(idx);
      return { path: idx, size: si.size };
    }
  } catch {
    /* not found */
  }
  return null;
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }

  let file;
  try {
    file = await resolveFile(req.url || '/');
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  // SPA fallback for navigations; real 404 for missing assets.
  if (!file) {
    const looksLikeAsset = extname((req.url || '').split('?')[0]) !== '';
    if (looksLikeAsset) {
      res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS }).end('Not found');
      return;
    }
    file = await resolveFile('/index.html');
    if (!file) {
      res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Build missing: run `npm run build` first.');
      return;
    }
  }

  const ext = extname(file.path);
  const headers = {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl(file.path),
    ...SECURITY_HEADERS,
  };
  if (file.path.endsWith('sw.js')) headers['Service-Worker-Allowed'] = '/';

  const gzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && file.size > 1024;
  if (gzip) {
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
  } else {
    headers['Content-Length'] = file.size;
  }
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(file.path);
  stream.on('error', () => res.destroy());
  (gzip ? stream.pipe(createGzip()) : stream).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`OpenBloody listening on http://${HOST}:${PORT}`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
