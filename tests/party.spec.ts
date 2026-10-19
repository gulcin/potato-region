import { mkdirSync } from 'node:fs';

import { chromium, expect, test, webkit, type Browser, type Page } from 'playwright/test';

mkdirSync('/opt/cursor/artifacts/screenshots', { recursive: true });

const SAVE_KEY = 'aida-potato-region-v1';

async function openPlayer(browser: Browser, width: number, height: number): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: true,
    deviceScaleFactor: 1,
    serviceWorkers: 'allow',
    baseURL: 'http://127.0.0.1:4173',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const prototype = window.SpeechSynthesis?.prototype;
    if (prototype) {
      prototype.speak = () => undefined;
      prototype.cancel = () => undefined;
    }
  });
  await page.goto('/potato-region/');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'map');
  return page;
}

async function bluePotatoes(page: Page): Promise<number> {
  return page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key) || '{}') as { potatoes?: { blue?: number } };
    return saved.potatoes?.blue ?? 0;
  }, SAVE_KEY);
}

test('host and guest share a farm party', async ({ browser }) => {
  const host = await openPlayer(browser, 834, 1194);
  const guest = await openPlayer(browser, 390, 844);

  await host.locator('[data-action="party"]').click();
  await host.locator('[data-name-preset="Mum"]').click();
  await host.locator('[data-action="party-start"]').click();
  await expect(host.locator('[data-party-message]').first()).toContainText('Waiting', { timeout: 20_000 });
  const code = (await host.locator('[data-party-code]').innerText()).replace(/\s/g, '');
  expect(code).toMatch(/^\d{4}$/);
  await expect(host.locator('[data-party-qr]')).toBeVisible();
  await expect(host.locator('.code-pic img')).toHaveCount(4);

  await guest.locator('[data-action="party"]').click();
  await guest.locator('[data-name-preset="Aida"]').click();
  await guest.locator('[data-action="party-join-pane"]').click();
  await guest.locator('[data-join-code]').fill(code);
  await guest.locator('[data-action="party-join"]').click();
  await expect(guest.locator('[data-remote="true"] .walker-name')).toHaveText('Mum', { timeout: 30_000 });
  await host.locator('[data-action="party-close"]').click();
  await expect(host.locator('[data-remote="true"] .walker-name')).toHaveText('Aida');

  await host.locator('[data-walk]').click({ position: { x: 28, y: 36 } });
  await expect.poll(async () => {
    const hostX = Number(await host.locator('[data-self="true"]').getAttribute('data-x'));
    const guestX = Number(await guest.locator('[data-remote="true"]').getAttribute('data-x'));
    const hostY = Number(await host.locator('[data-self="true"]').getAttribute('data-y'));
    const guestY = Number(await guest.locator('[data-remote="true"]').getAttribute('data-y'));
    return Math.abs(hostX - guestX) < 8 && Math.abs(hostY - guestY) < 8;
  }).toBe(true);

  await host.locator('[data-goto-farm="purple"]').click();
  await expect(guest.locator('[data-goto-friend="purple"]')).toContainText('Mum is at the Purple Farm – go there?');
  await host.locator('[data-action="map"]').click();
  await host.locator('[data-goto-farm="blue"]').click();
  await guest.locator('[data-goto-farm="blue"]').click();
  await expect(host.locator('#app')).toHaveAttribute('data-farm', 'blue');
  await expect(guest.locator('#app')).toHaveAttribute('data-farm', 'blue');

  await guest.locator('[data-plot="0"]').click();
  await expect(host.locator('[data-plot="0"]')).toHaveAttribute('data-stage', 'seed');
  await expect(guest.locator('[data-plot="0"]')).toHaveAttribute('data-stage', 'seed');
  await guest.locator('[data-plot="0"]').click();
  await expect(host.locator('[data-plot="0"]')).toHaveAttribute('data-stage', 'watered');
  await expect(host.locator('[data-plot="0"]')).toHaveAttribute('data-stage', 'ready', { timeout: 12_000 });
  await expect(guest.locator('[data-plot="0"]')).toHaveAttribute('data-stage', 'ready');
  await guest.locator('[data-plot="0"]').click();
  await expect(guest.locator('[data-plot="0"]')).toHaveAttribute('data-stage', 'empty');
  await expect(host.locator('[data-plot="0"]')).toHaveAttribute('data-stage', 'empty');
  await expect.poll(() => bluePotatoes(guest)).toBe(1);
  expect(await bluePotatoes(host)).toBe(0);

  await host.locator('[data-emote="heart"]').click();
  await expect(guest.locator('[data-remote="true"]')).toHaveAttribute('data-emote', 'heart');
  await expect(guest.locator('[data-self="true"] .walker-name')).toHaveText('Aida');

  const hostFit = await host.locator('#app').evaluate((root) => ({
    x: root.scrollWidth - root.clientWidth,
    y: root.scrollHeight - root.clientHeight,
  }));
  const guestFit = await guest.locator('#app').evaluate((root) => ({
    x: root.scrollWidth - root.clientWidth,
    y: root.scrollHeight - root.clientHeight,
  }));
  expect(hostFit.x).toBeLessThanOrEqual(1);
  expect(hostFit.y).toBeLessThanOrEqual(1);
  expect(guestFit.x).toBeLessThanOrEqual(1);
  expect(guestFit.y).toBeLessThanOrEqual(1);

  await host.screenshot({ path: '/opt/cursor/artifacts/screenshots/party-host-ipad.png' });
  await guest.screenshot({ path: '/opt/cursor/artifacts/screenshots/party-guest-iphone.png' });

  await guest.evaluate(() => {
    (window as Window & { __party: { drop: () => void } }).__party.drop();
  });
  await expect(host.locator('[data-party-message]')).toContainText(/nap/);
  await expect(host.locator('[data-remote="true"]')).toHaveCount(0);
  await expect(host.locator('[data-remote="true"]')).toHaveCount(1, { timeout: 20_000 });
  await expect.poll(() => guest.evaluate(() => (window as Window & { __party: { status: () => string } }).__party.status())).toBe('connected');

  await guest.locator('[data-action="party-leave"]').click();
  await host.locator('[data-action="party-leave"]').click();
  await expect.poll(() => guest.evaluate(() => (window as Window & { __party: { status: () => string } }).__party.status())).toBe('idle');
  await expect.poll(() => host.evaluate(() => (window as Window & { __party: { status: () => string } }).__party.status())).toBe('idle');
  expect(await bluePotatoes(guest)).toBe(1);
  expect(await bluePotatoes(host)).toBe(0);
  await expect(guest.locator('[data-party-message]')).toHaveCount(0);
});

type PartyHooks = {
  __party: {
    sever: () => void;
    code: () => string;
    status: () => string;
    peerId: () => string;
    attempts: () => number;
    iceUrls: () => string[];
  };
};

test('a missing code explains itself and the host keeps that code', async ({ browser }) => {
  const host = await openPlayer(browser, 1194, 834);
  const guest = await openPlayer(browser, 390, 844);

  await host.locator('[data-action="party"]').click();
  await host.locator('[data-name-preset="Aida"]').click();
  await host.locator('[data-action="party-start"]').click();
  await expect(host.locator('[data-party-message]').first()).toContainText('Waiting', { timeout: 20_000 });
  const code = (await host.locator('[data-party-code]').innerText()).replace(/\s/g, '');
  await expect(host.locator('[data-host-code]')).toHaveText(code);
  await expect.poll(() => host.evaluate(() => (window as unknown as PartyHooks).__party.peerId())).toBe(`aida-potato-${code}`);

  await host.evaluate(() => (window as unknown as PartyHooks).__party.sever());
  await host.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => host.evaluate(() => (window as unknown as PartyHooks).__party.peerId()), { timeout: 15_000 }).toBe(`aida-potato-${code}`);
  await expect(host.locator('[data-host-code]')).toHaveText(code);
  expect(await host.evaluate(() => (window as unknown as PartyHooks).__party.code())).toBe(code);

  await guest.locator('[data-action="party"]').click();
  await guest.locator('[data-name-preset="Mum"]').click();
  await guest.locator('[data-action="party-join-pane"]').click();
  await guest.locator('[data-join-code]').fill('0000');
  await guest.locator('[data-action="party-join"]').click();
  await expect(guest.locator('[data-party-message]').last()).toHaveText(
    "Can't find that farm. Check the code on Aida's iPad and try again.",
    { timeout: 20_000 },
  );
  await expect.poll(() => guest.evaluate(() => (window as unknown as PartyHooks).__party.attempts())).toBeGreaterThan(1);
  const guestFit = await guest.locator('#app').evaluate((root) => ({
    x: root.scrollWidth - root.clientWidth,
    y: root.scrollHeight - root.clientHeight,
  }));
  expect(guestFit.x).toBeLessThanOrEqual(1);
  expect(guestFit.y).toBeLessThanOrEqual(1);
  await guest.screenshot({ path: '/opt/cursor/artifacts/screenshots/party-missing-iphone.png' });

  await guest.locator('[data-join-code]').fill(code);
  await guest.locator('[data-action="party-join"]').click();
  await expect(guest.locator('[data-remote="true"] .walker-name')).toHaveText('Aida', { timeout: 30_000 });
  await host.locator('[data-action="party-close"]').click();
  await expect(host.locator('[data-remote="true"] .walker-name')).toHaveText('Mum');
  await expect(host.locator('[data-host-code]')).toHaveText(code);
});

test('webkit iPhone guest is told when the farm cannot be found', async () => {
  const hostBrowser = await chromium.launch();
  const guestBrowser = await webkit.launch({ headless: false });
  const host = await openPlayer(hostBrowser, 834, 1194);
  const guest = await openPlayer(guestBrowser, 390, 844);
  const turns = await host.evaluate(() => (window as unknown as PartyHooks).__party.iceUrls());
  expect(turns.some((url) => url.startsWith('turn:') || url.startsWith('turns:'))).toBe(true);
  expect(turns.filter((url) => url.startsWith('stun:')).length).toBeGreaterThan(1);

  await host.locator('[data-action="party"]').click();
  await host.locator('[data-name-preset="Aida"]').click();
  await host.locator('[data-action="party-start"]').click();
  await expect(host.locator('[data-party-message]').first()).toContainText('Waiting', { timeout: 20_000 });
  const code = (await host.locator('[data-party-code]').innerText()).replace(/\s/g, '');
  await expect(host.locator('[data-host-code]')).toHaveText(code);
  await expect.poll(() => host.evaluate(() => (window as unknown as PartyHooks).__party.peerId())).toBe(`aida-potato-${code}`);

  await guest.locator('[data-action="party"]').click();
  await guest.locator('[data-name-preset="Mum"]').click();
  await guest.locator('[data-action="party-join-pane"]').click();
  await guest.locator('[data-join-code]').fill('0000');
  await guest.locator('[data-action="party-join"]').click();
  await expect(guest.locator('[data-party-message]').last()).toHaveText(
    "Can't find that farm. Check the code on Aida's iPad and try again.",
    { timeout: 20_000 },
  );
  await expect.poll(() => guest.evaluate(() => (window as unknown as PartyHooks).__party.attempts())).toBeGreaterThan(1);
  const guestFit = await guest.locator('#app').evaluate((root) => ({
    x: root.scrollWidth - root.clientWidth,
    y: root.scrollHeight - root.clientHeight,
  }));
  expect(guestFit.x).toBeLessThanOrEqual(1);
  expect(guestFit.y).toBeLessThanOrEqual(1);
  await guest.screenshot({ path: '/opt/cursor/artifacts/screenshots/party-webkit-guest-iphone.png' });
  await host.screenshot({ path: '/opt/cursor/artifacts/screenshots/party-webkit-host-ipad.png' });
  await guest.context().close();
  await host.context().close();
  await guestBrowser.close();
  await hostBrowser.close();
});

test('two browsers join on the public PeerJS line', async () => {
  test.setTimeout(90_000);
  const browser = await chromium.launch();
  const cloud = () => {
    sessionStorage.setItem('aida-peer-cloud', '1');
  };
  const hostContext = await browser.newContext({
    viewport: { width: 834, height: 1194 },
    hasTouch: true,
    deviceScaleFactor: 1,
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'allow',
  });
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'allow',
  });
  await hostContext.addInitScript(cloud);
  await guestContext.addInitScript(cloud);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await host.goto('/potato-region/');
  await guest.goto('/potato-region/');
  await expect(host.locator('#app')).toHaveAttribute('data-screen', 'map');

  await host.locator('[data-action="party"]').click();
  await host.locator('[data-name-preset="Aida"]').click();
  await host.locator('[data-action="party-start"]').click();
  await expect(host.locator('[data-party-message]').first()).toContainText('Waiting', { timeout: 30_000 });
  const code = (await host.locator('[data-party-code]').innerText()).replace(/\s/g, '');
  await expect.poll(() => host.evaluate(() => (window as unknown as PartyHooks).__party.peerId()), { timeout: 20_000 }).toBe(`aida-potato-${code}`);

  await guest.locator('[data-action="party"]').click();
  await guest.locator('[data-name-preset="Mum"]').click();
  await guest.locator('[data-action="party-join-pane"]').click();
  await guest.locator('[data-join-code]').fill(code);
  await guest.locator('[data-action="party-join"]').click();
  await expect(guest.locator('[data-remote="true"] .walker-name')).toHaveText('Aida', { timeout: 30_000 });
  await host.locator('[data-action="party-close"]').click();
  await expect(host.locator('[data-remote="true"] .walker-name')).toHaveText('Mum');
  await host.screenshot({ path: '/opt/cursor/artifacts/screenshots/party-cloud-host-ipad.png' });
  await guest.screenshot({ path: '/opt/cursor/artifacts/screenshots/party-cloud-guest-iphone.png' });
  await guestContext.close();
  await hostContext.close();
  await browser.close();
});
