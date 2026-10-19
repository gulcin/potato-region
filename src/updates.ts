import pkg from '../package.json';

/** A build can stamp a stand-in version for the update test. The shipped app uses package.json. */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION || pkg.version;

const RELOAD_KEY = 'potato-region.swReloads';
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

let updateReady = false;
let registration: ServiceWorkerRegistration | null = null;
let applying = false;
let reloading = false;
let started = false;

export function isUpdateReady(): boolean {
  return updateReady;
}

/** A query the Pages CDN has not stored, so version.json cannot stay stale for ten minutes. */
export function versionJsonUrl(base = import.meta.env.BASE_URL, now = Date.now()): string {
  return `${base}version.json?t=${now}`;
}

/** Stable scope, with the version on the script URL so a cached sw.js is not reused. */
export function serviceWorkerScript(base: string, token: string): string {
  return `${base}sw.js?v=${encodeURIComponent(token)}`;
}

function markReady(onReady: () => void): void {
  if (updateReady) return;
  updateReady = true;
  onReady();
}

function workerIsWaiting(reg: ServiceWorkerRegistration | null): boolean {
  return Boolean(reg?.waiting && navigator.serviceWorker.controller);
}

function watchWorker(worker: ServiceWorker | null, onReady: () => void): void {
  if (!worker) return;
  const note = () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) markReady(onReady);
  };
  note();
  worker.addEventListener('statechange', note);
}

function watchRegistration(reg: ServiceWorkerRegistration, onReady: () => void): void {
  registration = reg;
  watchWorker(reg.installing, onReady);
  watchWorker(reg.waiting, onReady);
  if (workerIsWaiting(reg)) markReady(onReady);
  reg.addEventListener('updatefound', () => watchWorker(reg.installing, onReady));
}

function registerScript(token: string): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register(serviceWorkerScript(import.meta.env.BASE_URL, token), {
    scope: import.meta.env.BASE_URL,
    updateViaCache: 'none',
  });
}

function reloadOnce(): void {
  if (reloading) return;
  let count = 0;
  try {
    count = Number(sessionStorage.getItem(RELOAD_KEY) || '0');
  } catch {
    count = 0;
  }
  if (count >= 1) return;
  reloading = true;
  try {
    sessionStorage.setItem(RELOAD_KEY, '1');
  } catch {
    /* A private mode that refuses session storage still gets this one reload. */
  }
  location.reload();
}

export async function initUpdates(onReady: () => void): Promise<void> {
  if (started || !import.meta.env.PROD || !('serviceWorker' in navigator)) {
    await checkForUpdates(onReady);
    return;
  }
  started = true;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!applying) return;
    reloadOnce();
  });
  try {
    watchRegistration(await registerScript(APP_VERSION), onReady);
    const look = () => {
      void checkForUpdates(onReady);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') look();
    });
    window.setInterval(look, CHECK_INTERVAL_MS);
  } catch {
    /* Stay playable if the worker cannot register. */
  }
  await checkForUpdates(onReady);
}

export async function checkForUpdates(onReady: () => void): Promise<'ready' | 'newest' | 'offline'> {
  try {
    const response = await fetch(versionJsonUrl(), { cache: 'no-store' });
    if (!response.ok) return 'offline';
    const data = (await response.json()) as { version?: string };
    const remote = data.version;
    if (remote && remote !== APP_VERSION && 'serviceWorker' in navigator && import.meta.env.PROD) {
      try {
        watchRegistration(await registerScript(remote), onReady);
        await registration?.update();
      } catch {
        /* The banner can still offer a reload if the script itself is blocked. */
      }
    } else if (registration) {
      await registration.update().catch(() => undefined);
    }
    if ((remote && remote !== APP_VERSION) || workerIsWaiting(registration)) {
      markReady(onReady);
      return 'ready';
    }
    return 'newest';
  } catch {
    return 'offline';
  }
}

/** One tap activates the waiting worker, then the page reloads once. */
export function applyUpdate(): void {
  if (applying) return;
  applying = true;
  const worker = registration?.waiting ?? registration?.installing;
  if (worker) {
    worker.postMessage({ type: 'SKIP_WAITING' });
    worker.postMessage('SKIP_WAITING');
    window.setTimeout(() => reloadOnce(), 4000);
    return;
  }
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* The reload below still runs. */
  }
  reloadOnce();
}

/** Drops the saved pages and the service worker. Potatoes, clothes, and the house stay in localStorage. */
export function startAgain(): Promise<void> {
  const registrations = 'serviceWorker' in navigator ? navigator.serviceWorker.getRegistrations() : Promise.resolve([]);
  return registrations
    .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
    .then(() => ('caches' in window ? caches.keys() : Promise.resolve([])))
    .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    .then(() => {
      try {
        sessionStorage.removeItem(RELOAD_KEY);
        sessionStorage.removeItem('potato-region.bootReloads');
      } catch {
        /* Session storage is optional. The caches are already gone. */
      }
      const next = new URL(window.location.href);
      next.searchParams.delete('potato-fresh');
      next.searchParams.set('potato-fresh', String(Date.now()));
      window.location.replace(next.href);
    });
}
