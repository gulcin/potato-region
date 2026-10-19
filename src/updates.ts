import pkg from '../package.json';

export const APP_VERSION: string = pkg.version;

let updateReady = false;
let registration: ServiceWorkerRegistration | null = null;
let reloading = false;

export function isUpdateReady(): boolean {
  return updateReady;
}

export async function initUpdates(onReady: () => void): Promise<void> {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    try {
      registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: 'none',
      });
      const watch = (worker: ServiceWorker | null) => {
        worker?.addEventListener('statechange', () => {
          if (worker.state !== 'installed') return;
          if (navigator.serviceWorker.controller) {
            updateReady = true;
            onReady();
          } else {
            worker.postMessage('SKIP_WAITING');
          }
        });
      };
      if (registration.waiting && navigator.serviceWorker.controller) {
        updateReady = true;
        onReady();
      }
      registration.addEventListener('updatefound', () => watch(registration?.installing ?? null));
    } catch {
      /* Stay playable if the worker cannot register. */
    }
  }
  await checkForUpdates(onReady);
}

export async function checkForUpdates(onReady: () => void): Promise<'ready' | 'newest' | 'offline'> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' });
    if (!response.ok) return 'offline';
    const data = (await response.json()) as { version?: string };
    if (data.version && data.version !== APP_VERSION) {
      updateReady = true;
      onReady();
      registration?.update().catch(() => undefined);
      return 'ready';
    }
    return 'newest';
  } catch {
    return 'offline';
  }
}

export function applyUpdate(): void {
  if (reloading) return;
  reloading = true;
  const waiting = registration?.waiting;
  if (waiting) {
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    waiting.postMessage('SKIP_WAITING');
    window.setTimeout(() => location.reload(), 800);
    return;
  }
  location.reload();
}
