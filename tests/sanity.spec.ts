import { mkdirSync } from 'node:fs';

import { expect, test, type Locator, type Page } from 'playwright/test';
import {
  ACCESSORIES,
  COLORS,
  FURNITURE,
  OUTFITS,
  PETS,
  PLOT_COUNT,
  SHOP_ITEMS,
  shopCost,
} from '../src/catalog';

mkdirSync('/opt/cursor/artifacts/screenshots', { recursive: true });

const SAVE_KEY = 'aida-potato-region-v1';
const ROUNDS = Math.ceil(shopCost() / (COLORS.length * PLOT_COUNT));

test('plays every part of Potato Region', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const missing: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/Failed to load resource|net::ERR|ERR_INTERNET|status of 404/i.test(text)) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() === 404) missing.push(response.url());
  });

  await page.addInitScript(() => {
    const host = window as Window & {
      __spoken: string[];
      __swReg?: { updateViaCache?: string };
      __versionInits: string[];
    };
    host.__spoken = [];
    host.__versionInits = [];
    class Utterance {
      text: string;
      lang = 'en-GB';
      rate = 1;
      constructor(text: string) {
        this.text = text;
      }
    }
    const remember = (utterance?: { text?: string }) => {
      if (utterance?.text) host.__spoken.push(utterance.text);
    };
    const prototype = window.SpeechSynthesis?.prototype;
    if (prototype) {
      prototype.speak = function speak(utterance: SpeechSynthesisUtterance) {
        remember(utterance);
      };
      prototype.cancel = () => undefined;
    } else {
      host.SpeechSynthesisUtterance = Utterance as unknown as typeof SpeechSynthesisUtterance;
      Object.defineProperty(host, 'speechSynthesis', {
        configurable: true,
        value: {
          speak: remember,
          cancel: () => undefined,
          getVoices: () => [],
          pause: () => undefined,
          resume: () => undefined,
          pending: false,
          speaking: false,
          paused: false,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
          onvoiceschanged: null,
        },
      });
    }

    const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = (script: string | URL, options?: RegistrationOptions) => {
      host.__swReg = { updateViaCache: options?.updateViaCache };
      return originalRegister(script, options);
    };
    const originalFetch = host.fetch.bind(host);
    host.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('version.json')) host.__versionInits.push(String(init?.cache ?? ''));
      return originalFetch(input, init);
    };
  });

  await page.route('**/api/feedback', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  );

  await page.goto('/potato-region/');
  await expect(page).toHaveTitle('Potato Region');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'map');
  await expect(page.locator('#app')).toHaveAttribute('data-potato-colors', COLORS.join(','));
  await page.waitForFunction(() => {
    const host = window as Window & { __swReg?: { updateViaCache?: string }; __versionInits?: string[] };
    return host.__swReg?.updateViaCache === 'none' && host.__versionInits?.includes('no-store');
  });

  await page.locator('[data-goto="dress"]').click();
  await page.locator('[data-pet-name]').fill('Poko');
  await page.locator('[data-pet-name]').blur();
  await expect(page.locator('[data-pet-label]')).toHaveText('Poko');
  await page.locator('[data-action="map"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'map');
  await expect(page.locator('[data-pet-name]')).toHaveCount(0);
  await expect(page.locator('[data-pet-label]')).toHaveText('Poko');
  await page.locator('[data-action="read"]').click();
  await expect(page.locator('[data-action="read"]')).toHaveText('Quiet');
  await expect.poll(() => page.evaluate(() => (window as Window & { __spoken: string[] }).__spoken.length)).toBeGreaterThan(0);

  await expectChrome(page, 'map');
  await expectFit(page);
  await shot(page, 'map');

  for (let round = 0; round < ROUNDS; round += 1) {
    for (const color of COLORS) {
      await harvestFarm(page, color, {
        dragFirst: round === 0 && color === 'blue',
        shoot: round === 1 && color === 'blue',
      });
    }
  }

  await page.locator('[data-goto="shop"]').click();
  await expectChrome(page, 'shop');
  await expect(page.locator('h1')).toHaveText('Potato Trade Deals');
  let shotShop = false;
  for (const item of SHOP_ITEMS) {
    await page.locator(`[data-tab="${item.tab}"]`).click();
    await page.locator(`[data-item="${item.id}"]`).click();
    await expect(page.locator(`[data-item="${item.id}"]`)).toHaveAttribute('aria-pressed', 'true');
    for (let count = 1; count <= item.price; count += 1) {
      await dragOnePotato(page, count);
      if (!shotShop && count === Math.min(3, item.price)) {
        await shot(page, 'shop');
        shotShop = true;
      }
    }
    await expect(page.locator('[data-counter-count]')).toHaveText(String(item.price));
    const before = Number(await page.locator('[data-potato-total]').innerText());
    await expect(page.locator('[data-action="trade"]')).toBeEnabled();
    await page.locator('[data-action="trade"]').click();
    await expect(page.locator(`[data-item="${item.id}"]`)).toHaveAttribute('data-owned', 'true');
    await expect.poll(() => page.locator('[data-potato-total]').innerText()).toBe(String(before - item.price));
  }
  await expectFit(page);
  await page.locator('[data-action="map"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'map');

  await page.locator('[data-goto="dress"]').click();
  await expectChrome(page, 'dress');
  await page.locator('[data-dress-tab="clothes"]').click();
  await page.locator('[data-wear="strap-dress"]').click();
  await page.locator('[data-dress-tab="hats"]').click();
  await page.locator('[data-wear-acc="green-headband"]').click();
  await page.locator('[data-dress-tab="pets"]').click();
  await page.locator('[data-choose-pet="chihuahua"]').click();
  await expect(page.locator('[data-player]')).toHaveAttribute('data-outfit', 'strap-dress');
  await expect(page.locator('[data-player]')).toHaveAttribute('data-accessory', 'green-headband');
  await expect(page.locator('[data-active-pet]')).toHaveAttribute('data-pet', 'chihuahua');
  await shot(page, 'dress');

  await page.locator('[data-dress-tab="clothes"]').click();
  for (const outfit of OUTFITS) {
    await page.locator(`[data-wear="${outfit.id}"]`).click();
    await expect(page.locator('[data-player]')).toHaveAttribute('data-outfit', outfit.id);
    await expect(page.locator('[data-player-body]')).toHaveAttribute('src', new RegExp(outfit.art.replace(/[.]/g, '\\.')));
  }
  await page.locator('[data-dress-tab="hats"]').click();
  for (const accessory of ACCESSORIES) {
    await page.locator(`[data-wear-acc="${accessory.id}"]`).click();
    await expect(page.locator('[data-player]')).toHaveAttribute('data-accessory', accessory.id);
    if (accessory.id === 'none') await expect(page.locator('[data-player-acc]')).toHaveCount(0);
    else await expect(page.locator('[data-player-acc]')).toHaveAttribute('src', new RegExp(accessory.art.replace(/[.]/g, '\\.')));
  }
  await page.locator('[data-dress-tab="pets"]').click();
  for (const pet of PETS) {
    await page.locator(`[data-choose-pet="${pet.id}"]`).click();
    await expect(page.locator('[data-active-pet]')).toHaveAttribute('data-pet', pet.id);
    const src = await page.locator('[data-pet-img]').getAttribute('src');
    expect(src).toContain(pet.id === 'potato' ? 'pet-potato' : pet.art);
  }
  await expectFit(page);
  await page.locator('[data-action="map"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'map');

  await page.locator('[data-goto="house"]').click();
  await expectChrome(page, 'house');
  for (const furniture of FURNITURE) {
    await page.locator(`[data-furn="${furniture.id}"]`).click();
    await page.locator('[data-action="place"]').click();
    await expect(page.locator(`[data-placed="${furniture.id}"]`)).toBeVisible();
  }
  await shot(page, 'house');
  const beforeX = await page.locator('[data-placed="sofa"]').getAttribute('data-x');
  const room = await page.locator('[data-room]').boundingBox();
  const sofa = await page.locator('[data-placed="sofa"]').boundingBox();
  if (!room || !sofa) throw new Error('The house room is missing.');
  await page.mouse.move(sofa.x + sofa.width / 2, sofa.y + sofa.height / 2);
  await page.mouse.down();
  await page.mouse.move(room.x + room.width * 0.78, room.y + room.height * 0.72, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.locator('[data-placed="sofa"]').getAttribute('data-x')).not.toBe(beforeX);
  await page.reload();
  await expect(page.locator('[data-placed="sofa"]')).toBeVisible();
  await expect(page.locator('[data-placed="chair"]')).toBeVisible();
  await page.locator('[data-furn="chair"]').click();
  await page.locator('[data-action="put-away"]').click();
  await expect(page.locator('[data-placed="chair"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-placed="chair"]')).toHaveCount(0);
  await expect(page.locator('[data-placed="sofa"]')).toBeVisible();
  await expectFit(page);
  await page.locator('[data-action="map"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'map');

  await page.locator('[data-action="tell"]').click();
  await page.locator('[data-feedback-type="bug"]').click();
  await page.locator('[data-feedback-note]').fill('The blue farm is lovely');
  const href = await page.locator('[data-action="mailto"]').getAttribute('href');
  const decoded = decodeURIComponent(href ?? '');
  expect(decoded).toContain('mailto:gulcin.yildirim@clickhouse.com');
  expect(decoded).toContain('Potato Region report – v1.1.2 – Map');
  expect(decoded).toContain('Note: The blue farm is lovely');
  expect(decoded).toContain('Type: bug');
  expect(decoded).toContain('Screen: Map');
  expect(decoded).toContain('Version: v1.1.2');
  expect(decoded).toContain('Device:');
  expect(decoded).toContain('Timestamp:');
  const posted = page.waitForRequest((request) => request.url().includes('/api/feedback') && request.method() === 'POST');
  await page.locator('[data-action="feedback-save"]').click();
  const sent = await posted;
  expect(sent.postData()).toContain('The blue farm is lovely');
  await expect(page.locator('[data-feedback-status]')).toHaveText('Saved and sent.');

  await page.context().setOffline(true);
  await page.locator('[data-feedback-note]').fill('Remember the basket');
  await page.locator('[data-action="feedback-save"]').click();
  await expect(page.locator('[data-feedback-status]')).toHaveText('Saved on this iPad. I will send it later.');
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('aida-potato-region-v1') || '{}');
    return saved.feedbackQueue?.length ?? 0;
  })).toBe(1);
  const queued = page.waitForRequest((request) => request.url().includes('/api/feedback') && request.method() === 'POST');
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await queued;
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('aida-potato-region-v1') || '{}');
    return saved.feedbackQueue?.length ?? 0;
  })).toBe(0);
  await page.locator('[data-action="close-modal"]').click();
  await expect(page.locator('[data-modal="tell"]')).toHaveCount(0);
  await expectFit(page);

  await page.locator('[data-action="grownups"]').click();
  await expectChrome(page, 'grownups');
  await page.locator('[data-key="1"]').click();
  await page.locator('[data-key="1"]').click();
  await page.locator('[data-key="1"]').click();
  await page.locator('[data-key="ok"]').click();
  await expect(page.locator('[data-gate-msg]')).toHaveText('Try again with a grown-up.');
  await page.locator('[data-key="1"]').click();
  await page.locator('[data-key="clear"]').click();
  await expect(page.locator('[data-gate-entry]')).toHaveText('');
  for (const key of ['1', '0', '2', 'ok']) await page.locator(`[data-key="${key}"]`).click();
  await expect(page.locator('[data-version]')).toHaveText('Version v1.1.2');
  await expect(page.locator('[data-feedback-list]')).toContainText('The blue farm is lovely');
  await page.locator('[data-action="check-updates"]').click();
  await expect(page.locator('[data-update-status]')).toHaveText('You have the newest game.');
  await expectFit(page);
  await page.locator('[data-action="whatsnew"]').click();
  await expectChrome(page, 'whatsnew');
  await expect(page.locator('h2')).toContainText("What's new in v1.1.2");
  await expectFit(page);
  await page.locator('[data-action="map"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'map');

  await page.route(/version\.json/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: '9.9.9' }),
    }),
  );
  await page.locator('[data-goto-farm="blue"]').click();
  await expectChrome(page, 'farm');
  await expect(page.locator('[data-action="reload-update"]')).toHaveCount(0);
  await page.locator('[data-action="map"]').click();
  await page.locator('[data-action="grownups"]').click();
  await page.locator('[data-action="check-updates"]').click();
  await expect(page.locator('[data-update-status]')).toContainText('map');
  await expect(page.locator('[data-action="reload-update"]')).toHaveCount(0);
  await page.locator('[data-action="map"]').click();
  await expect(page.locator('[data-action="reload-update"]')).toHaveText('Update ready');
  await page.locator('[data-goto="shop"]').click();
  await expect(page.locator('[data-action="reload-update"]')).toHaveCount(0);
  await page.locator('[data-action="map"]').click();
  await page.locator('[data-goto-farm="red"]').click();
  await expect(page.locator('[data-action="reload-update"]')).toHaveCount(0);
  await page.locator('[data-action="map"]').click();
  await expect(page.locator('[data-action="reload-update"]')).toHaveText('Update ready');
  await Promise.all([
    page.waitForLoadState('load'),
    page.locator('[data-action="reload-update"]').click(),
  ]);
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'map');

  for (const path of [
    '/potato-region/manifest.webmanifest',
    '/potato-region/apple-touch-icon.png',
    '/potato-region/apple-touch-icon-precomposed.png',
    '/potato-region/apple-touch-icon-167.png',
    '/potato-region/apple-touch-icon-152.png',
    '/potato-region/splash/ipad-11-portrait.jpg',
    '/potato-region/splash/iphone-14-portrait.jpg',
    '/potato-region/version.json',
  ]) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
  }

  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  expect(missing, missing.join('\n')).toEqual([]);
});

async function harvestFarm(page: Page, color: string, options: { dragFirst: boolean; shoot: boolean }): Promise<void> {
  const before = await potatoCount(page, color);
  await page.locator(`[data-goto-farm="${color}"]`).click();
  await expectChrome(page, 'farm');
  await expect(page.locator('#app')).toHaveAttribute('data-farm', color);
  for (let index = 0; index < PLOT_COUNT; index += 1) await page.locator(`[data-plot="${index}"]`).click();
  await expect(page.locator('[data-stage="seed"]')).toHaveCount(PLOT_COUNT);
  for (let index = 0; index < PLOT_COUNT; index += 1) await page.locator(`[data-plot="${index}"]`).click();
  await expect(page.locator('[data-stage="watered"]')).toHaveCount(PLOT_COUNT);
  await expect(page.locator('[data-stage="ready"]')).toHaveCount(PLOT_COUNT);
  if (options.shoot) await shot(page, 'farm');
  if (color === 'blue' && options.dragFirst) await expectFit(page);
  if (options.dragFirst) {
    await dragBetween(page, page.locator('[data-plot="0"]'), page.locator('body'), { targetPoint: { x: 12, y: 12 } });
    await expect(page.locator('[data-plot="0"]')).toHaveAttribute('data-stage', 'ready');
    await dragBetween(page, page.locator('[data-plot="0"]'), page.locator('[data-basket]'));
    await expect(page.locator('[data-plot="0"]')).toHaveAttribute('data-stage', 'empty');
  }
  for (let index = options.dragFirst ? 1 : 0; index < PLOT_COUNT; index += 1) {
    await page.locator(`[data-plot="${index}"]`).click();
    await expect(page.locator(`[data-plot="${index}"]`)).toHaveAttribute('data-stage', 'empty');
  }
  expect(await potatoCount(page, color)).toBe(before + PLOT_COUNT);
  await page.locator('[data-action="map"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'map');
}

async function potatoCount(page: Page, color: string): Promise<number> {
  return page.evaluate(({ key, color: name }) => {
    const saved = JSON.parse(localStorage.getItem(key) || '{}') as { potatoes?: Record<string, number> };
    return saved.potatoes?.[name] ?? 0;
  }, { key: SAVE_KEY, color });
}

async function dragBetween(
  page: Page,
  source: Locator,
  target: Locator,
  options?: { targetPoint?: { x: number; y: number } },
): Promise<void> {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('A drag target is not on screen.');
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX = options?.targetPoint?.x ?? to.x + to.width / 2;
  const endY = options?.targetPoint?.y ?? to.y + to.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 6 });
  await page.mouse.up();
}

async function dragOnePotato(page: Page, expected: number): Promise<void> {
  const counter = page.locator('[data-counter-count]');
  await dragBetween(page, page.locator('[data-pocket-potato]').first(), page.locator('[data-counter]'));
  try {
    await expect(counter).toHaveText(String(expected), { timeout: 1500 });
  } catch {
    await dragBetween(page, page.locator('[data-pocket-potato]').first(), page.locator('[data-counter]'));
    await expect(counter).toHaveText(String(expected));
  }
}

async function expectChrome(page: Page, screen: string): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-screen', screen);
  await expect(page.locator('[data-action="tell"]')).toBeVisible();
  if (screen === 'map') await expect(page.locator('[data-action="map"]')).toHaveCount(0);
  else await expect(page.locator('[data-action="map"]')).toBeVisible();
}

async function expectFit(page: Page): Promise<void> {
  const problems = await page.evaluate(() => {
    const found: string[] = [];
    const root = document.documentElement;
    const rootStyle = getComputedStyle(root);
    if (root.scrollWidth - root.clientWidth > 1 || root.scrollHeight - root.clientHeight > 1) {
      found.push(`page scrolls ${root.scrollWidth - root.clientWidth} by ${root.scrollHeight - root.clientHeight}`);
    }
    const adjust = `${rootStyle.getPropertyValue('-webkit-text-size-adjust')} ${rootStyle.getPropertyValue('text-size-adjust')}`;
    if (!adjust.includes('100')) found.push(`text size adjust ${adjust}`);
    const rootFont = parseFloat(rootStyle.fontSize);
    if (rootFont < 14 || rootFont > 18) found.push(`root font ${rootFont}`);
    const stage = document.querySelector('#stage');
    if (stage && stage.scrollHeight - stage.clientHeight > 2) {
      found.push(`stage clips ${stage.scrollHeight - stage.clientHeight}`);
    }
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    document.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') ?? '';
      if (/potato-(brown|black|yellow|white)/.test(src)) found.push(`forbidden potato ${src}`);
      if (img.complete && img.naturalWidth > 0 && img.naturalWidth < 32) found.push(`tiny image ${src}`);
      if (img.complete && img.naturalWidth === 0) found.push(`broken image ${src}`);
    });
    document.querySelectorAll('body *').forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.hidden || node.closest('[hidden]')) return;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const hasText = Array.from(node.childNodes).some((child) => child.nodeType === Node.TEXT_NODE && Boolean(child.textContent?.trim()));
      if (hasText) {
        const size = parseFloat(style.fontSize);
        if (size < 12 || size > 32) found.push(`font ${size} on ${node.tagName}`);
      }
      if (!node.matches('button, a, input, textarea')) return;
      const rect = node.getBoundingClientRect();
      if (rect.width < 43.5 || rect.height < 43.5) {
        found.push(`small target ${Math.round(rect.width)}x${Math.round(rect.height)} ${node.tagName} ${(node.getAttribute('aria-label') || node.textContent || '').trim().slice(0, 24)}`);
      }
      if (rect.top < -1 || rect.left < -1 || rect.right > viewWidth + 1 || rect.bottom > viewHeight + 1) {
        found.push(`off screen ${node.tagName} ${Math.round(rect.left)},${Math.round(rect.top)}`);
      }
    });
    return found.slice(0, 14);
  });
  expect(problems, problems.join('\n')).toEqual([]);
}

async function shot(page: Page, name: string): Promise<void> {
  const project = test.info().project.name;
  if (!project.startsWith('ipad-11') && project !== 'iphone-portrait') return;
  await page.screenshot({ path: `/opt/cursor/artifacts/screenshots/${name}-${project}.png` });
}
