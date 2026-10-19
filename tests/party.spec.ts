import { mkdirSync } from 'node:fs';

import { expect, test, type Browser, type Page } from 'playwright/test';

mkdirSync('/opt/cursor/artifacts/screenshots', { recursive: true });

const SAVE_KEY = 'aida-potato-region-v1';

async function openPlayer(browser: Browser, width: number, height: number): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: true,
    deviceScaleFactor: 1,
    serviceWorkers: 'allow',
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
