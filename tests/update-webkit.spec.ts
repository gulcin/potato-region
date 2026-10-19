/**
 * Home Screen update, in WebKit: install version N behind a sticky cache like
 * GitHub Pages, deploy N+1, tap Update ready, and keep Aida's potatoes.
 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { expect, test } from 'playwright/test';
import { webkit } from 'playwright';

const root = process.cwd();
const dirN = join(root, 'node_modules/.cache/potato-update-n');
const dirN1 = join(root, 'node_modules/.cache/potato-update-n1');
const port = 4391;

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function build(version: string, outDir: string): void {
  rmSync(outDir, { recursive: true, force: true });
  const env = {
    ...process.env,
    VITE_APP_VERSION: version,
    POTATO_VERSION: version,
    POTATO_DIST: outDir,
    POTATO_SKIP_SPLASH: '1',
  };
  const vite = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  if (vite.status !== 0) throw new Error(`vite build ${version} failed`);
  const post = spawnSync('node', ['scripts/postbuild.mjs'], { cwd: root, env, stdio: 'inherit' });
  if (post.status !== 0) throw new Error(`postbuild ${version} failed`);
  const stamped = JSON.parse(readFileSync(join(outDir, 'version.json'), 'utf8')) as { version: string };
  if (stamped.version !== version) throw new Error(`version.json is ${stamped.version}`);
  const worker = readFileSync(join(outDir, 'sw.js'), 'utf8');
  expect(worker).toContain('SKIP_WAITING');
  expect(worker).toContain('POTATO_PING');
  expect(worker).toContain("cache:'reload'");
  expect(worker).toContain(`potato-region-v${version}`);
  expect(worker.indexOf('fresh(HOME)')).toBeLessThan(worker.indexOf('cached(HOME)'));
  expect(worker).not.toContain('localStorage');
}

test('webkit home screen app updates in place and keeps progress', async () => {
  test.setTimeout(240_000);
  build('9.0.0', dirN);
  build('9.0.1', dirN1);

  let generation: 'n' | 'n1' = 'n';
  const cdn = new Map<string, { body: Buffer; type: string }>();
  const misses: string[] = [];

  function fileFor(pathname: string): string | null {
    const prefix = '/potato-region/';
    if (!pathname.startsWith(prefix)) return null;
    let rel = decodeURIComponent(pathname.slice(prefix.length));
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const folder = generation === 'n' ? dirN : dirN1;
    const file = resolve(folder, rel);
    if (!file.startsWith(resolve(folder))) return null;
    if (!existsSync(file) || !statSync(file).isFile()) return null;
    return file;
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const key = `${url.pathname}${url.search}`;
    const cached = cdn.get(key);
    if (cached) {
      res.writeHead(200, {
        'Content-Type': cached.type,
        'Cache-Control': 'max-age=600',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(cached.body);
      return;
    }
    const file = fileFor(url.pathname);
    if (!file) {
      misses.push(`${generation} ${key}`);
      res.writeHead(404, { 'Cache-Control': 'no-cache' });
      res.end('missing');
      return;
    }
    const body = readFileSync(file);
    const type = types[extname(file)] ?? 'application/octet-stream';
    cdn.set(key, { body, type });
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'max-age=600',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', () => resolve()));

  const progress = {
    potatoes: { blue: 7, green: 0, red: 0, purple: 0, pink: 0, orange: 0, turquoise: 0, lilac: 0 },
    counter: [],
    outfit: 'farm-blue',
    accessory: 'none',
    pet: 'potato',
    petName: 'Pip',
    owned: ['farm-blue', 'potato', 'none', 'strap-dress'],
    placed: [{ id: 'sofa', x: 42, y: 71 }],
    plots: {},
    feedback: [],
    feedbackQueue: [],
    readAloud: false,
    sound: false,
    seenWhatsNew: '9.0.0',
    playerName: 'Aida',
  };

  const profile = mkdtempSync(join(tmpdir(), 'potato-webkit-'));
  const context = await webkit.launchPersistentContext(profile, {
    viewport: { width: 1194, height: 834 },
    hasTouch: true,
    serviceWorkers: 'allow',
  });
  await context.addInitScript((saved) => {
    if (localStorage.getItem('aida-potato-region-v1')) return;
    localStorage.setItem('aida-potato-region-v1', JSON.stringify(saved));
  }, progress);

  const page = context.pages()[0] ?? (await context.newPage());
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    await page.goto(`http://127.0.0.1:${port}/potato-region/`);
    await expect(page.locator('#app')).toHaveAttribute('data-app-version', '9.0.0');
    await expect(page.locator('[data-potato-total]')).toHaveText('7');
    await page.evaluate(
      () =>
        Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) => setTimeout(() => reject(new Error('the first game did not install')), 30000)),
        ]),
    );

    generation = 'n1';
    await page.evaluate(() => {
      const proto = Document.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'visibilityState');
      const show = (state: string) => {
        Object.defineProperty(proto, 'visibilityState', { configurable: true, get: () => state });
        document.dispatchEvent(new Event('visibilitychange'));
      };
      show('hidden');
      show('visible');
      if (desc) Object.defineProperty(proto, 'visibilityState', desc);
    });
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const started = Date.now();
          const look = () => {
            navigator.serviceWorker.getRegistration().then((reg) => {
              if (reg?.waiting) resolve(true);
              else if (Date.now() - started > 30000) reject(new Error('the new game did not install'));
              else setTimeout(look, 150);
            }, reject);
          };
          look();
        }),
    );
    await expect(page.locator('[data-action="reload-update"]')).toHaveText('Update ready');
    const box = await page.locator('[data-action="reload-update"]').boundingBox();
    expect(box && box.height >= 44 && box.width >= 140).toBeTruthy();

    await page.locator('[data-action="reload-update"]').click();
    await expect(page.locator('#app')).toHaveAttribute('data-app-version', '9.0.1', { timeout: 30_000 });
    await expect(page.locator('[data-potato-total]')).toHaveText('7');
    await expect(page.locator('[data-action="reload-update"]')).toHaveCount(0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('aida-potato-region-v1') || '{}'));
    expect(saved.potatoes?.blue).toBe(7);
    expect(saved.owned).toContain('strap-dress');
    expect(saved.placed).toEqual([{ id: 'sofa', x: 42, y: 71 }]);
    expect(saved.petName).toBe('Pip');
    expect(errors, errors.join('\n')).toEqual([]);
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const serious = misses.filter((miss) => !miss.includes('/splash/'));
  expect(serious, serious.join('\n')).toEqual([]);
});
