import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
writeFileSync(join(dist, 'version.json'), `${JSON.stringify({ version: pkg.version }, null, 2)}\n`);

const splash = spawnSync('python3', [join(root, 'scripts/make_splash.py')], { stdio: 'inherit' });
if (splash.status !== 0) process.exit(splash.status ?? 1);

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

const precache = walk(dist)
  .map((file) => `/${relative(dist, file).split('\\').join('/')}`)
  .filter((file) => !file.endsWith('/sw.js') && !file.endsWith('/version.json') && !file.includes('/splash/'))
  .map((file) => `/potato-region${file}`);

const sw = `const VERSION = ${JSON.stringify(pkg.version)};
const CACHE = 'potato-region-' + VERSION;
const PRECACHE = ${JSON.stringify(precache, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json')) return;
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    const cached = (await cache.match(path)) || (await cache.match(event.request));
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  })());
});
`;

writeFileSync(join(dist, 'sw.js'), sw);
console.log(`service worker precache ${precache.length} files, v${pkg.version}`);
