import { test, expect, request } from "@playwright/test";

const ADMIN_EMAIL = "playwright-test@example.com";
const API_BASE = process.env.E2E_API_BASE ?? "http://localhost:3001";

async function fetchLatestCodeForEmail(email: string): Promise<string> {
  const ctx = await request.newContext({ baseURL: API_BASE });
  const res = await ctx.get("/api/__test/latest-code", {
    params: { email },
  });
  if (!res.ok()) throw new Error(`code fetch failed: ${res.status()}`);
  return (await res.json()).code as string;
}

async function loginAs(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.locator('[data-test="email"]').fill(email);
  await page.locator('[data-test="send-code"]').click();
  await expect(page.locator('[data-test="code"]')).toBeVisible();
  const code = await fetchLatestCodeForEmail(email);
  await page.locator('[data-test="code"]').fill(code);
  await page.locator('[data-test="verify"]').click();
  await expect(page).toHaveURL("/", { timeout: 15000 });
}

test("lightbox opens, navigates with arrows, closes with Escape", async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL);
  await page.locator('[data-test="album-card"]').first().click();
  await expect(page.locator('[data-test="album-photo"]').first()).toBeVisible();

  await page.locator('[data-test="album-photo"]').first().click();
  const lightbox = page.locator('[data-test="lightbox"]');
  await expect(lightbox).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(lightbox).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(lightbox).not.toBeVisible();
});

test("create + use + revoke share link", async ({ page, context }) => {
  await loginAs(page, ADMIN_EMAIL);
  await page.locator('[data-test="album-card"]').first().click();
  await page.locator('[data-test="share-toggle"]').click();
  await expect(page.locator('[data-test="share-panel"]')).toBeVisible();

  await page.locator('[data-test="create-share"]').click();
  await expect(page.locator('[data-test="share-link"]').first()).toBeVisible({
    timeout: 5000,
  });

  const shareUrl = await page
    .locator('[data-test="share-link"] input')
    .first()
    .inputValue();
  expect(shareUrl).toMatch(/\/share\/[A-Za-z0-9_-]+$/);

  const anonContext = await context.browser()!.newContext();
  const anonPage = await anonContext.newPage();
  await anonPage.goto(shareUrl);
  await expect(anonPage.locator('[data-test="share-album-name"]')).toBeVisible({
    timeout: 10000,
  });
  await expect(anonPage.locator('[data-test="share-photo"]').first()).toBeVisible();
  await anonContext.close();

  page.once("dialog", (d) => d.accept());
  await page.locator('[data-test="revoke-share"]').first().click();
  await expect(page.locator('[data-test="share-link"]')).toHaveCount(0, {
    timeout: 5000,
  });

  const anonContext2 = await context.browser()!.newContext();
  const anonPage2 = await anonContext2.newPage();
  await anonPage2.goto(shareUrl);
  await expect(anonPage2.locator('[data-test="share-error"]')).toBeVisible({
    timeout: 10000,
  });
  await anonContext2.close();
});

test("expired share link returns 404 message", async ({ page }) => {
  await page.goto("/share/this-token-does-not-exist-xyz");
  await expect(page.locator('[data-test="share-error"]')).toBeVisible({
    timeout: 10000,
  });
});
