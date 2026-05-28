import { test, expect, request } from "@playwright/test";

const ADMIN_EMAIL = "playwright-test@example.com";
const API_BASE = process.env.E2E_API_BASE ?? "http://localhost:3001";

async function fetchLatestCodeForEmail(email: string): Promise<string> {
  const ctx = await request.newContext({ baseURL: API_BASE });
  const res = await ctx.get("/api/__test/latest-code", { params: { email } });
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

async function uploadAt(
  page: import("@playwright/test").Page,
  locationQuery: string,
) {
  await page.goto("/upload");
  await page.locator('[data-test="files"]').setInputFiles("/tmp/test-photo.jpg");
  await page.locator('[data-test="start"]').click();
  await expect(page.locator('[data-test="location-modal"]')).toBeVisible();
  await page.locator('[data-test="location-input"]').fill(locationQuery);
  await expect(page.locator('[data-test="location-option"]').first()).toBeVisible({
    timeout: 5000,
  });
  await page.locator('[data-test="location-option"]').first().click();
  await page.locator('[data-test="location-confirm"]').click();

  const dateModal = page.locator('[data-test="date-modal"]');
  if (await dateModal.isVisible().catch(() => false)) {
    await page.locator('[data-test="date-confirm"]').click();
  }

  const uploadRes = page.waitForResponse(
    (r) => r.url().includes("/api/photos/commit") && r.request().method() === "POST",
  );
  await uploadRes;
  await expect(page).toHaveURL("/", { timeout: 15000 });
}

test("edit photo metadata changes location and moves to new album", async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL);
  await uploadAt(page, "melbourne");

  const melbourneCard = page
    .locator('[data-test="album-card"]')
    .filter({ hasText: "Melbourne" })
    .first();
  await expect(melbourneCard).toBeVisible({ timeout: 10000 });
  await melbourneCard.click();
  await expect(page.locator('[data-test="album-photo"]').first()).toBeVisible();

  await page.locator('[data-test="enter-select"]').click();
  await page.locator('[data-test="album-photo"]').first().click();
  await page.locator('[data-test="bulk-edit"]').click();
  await expect(page.locator('[data-test="edit-modal"]')).toBeVisible();
  await page.locator('[data-test="edit-location-change"]').click();
  await expect(page.locator('[data-test="location-modal"]')).toBeVisible();
  await page.locator('[data-test="location-input"]').fill("brisbane");
  await expect(page.locator('[data-test="location-option"]').first()).toBeVisible({
    timeout: 5000,
  });
  await page.locator('[data-test="location-option"]').first().click();
  await page.locator('[data-test="location-confirm"]').click();
  const patchRes = page.waitForResponse(
    (r) =>
      r.url().match(/\/api\/photos\/[^/]+$/) !== null &&
      r.request().method() === "PATCH",
  );
  await page.locator('[data-test="edit-save"]').click();
  const res = await patchRes;
  expect(res.status()).toBe(200);
});

test("move photo to another album via bulk Move", async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL);
  await uploadAt(page, "perth");
  await uploadAt(page, "perth");

  const perthCard = page
    .locator('[data-test="album-card"]')
    .filter({ hasText: "Perth" })
    .first();
  await perthCard.click();
  await expect(page.locator('[data-test="album-photo"]').first()).toBeVisible({
    timeout: 10000,
  });

  await page.locator('[data-test="enter-select"]').click();
  await page.locator('[data-test="album-photo"]').first().click();
  await page.locator('[data-test="bulk-move"]').click();
  await expect(page.locator('[data-test="move-modal"]')).toBeVisible();
  await page.locator('[data-test="move-option"]').first().click();
  const moveRes = page.waitForResponse(
    (r) =>
      r.url().includes("/api/photos/bulk-move") &&
      r.request().method() === "POST",
  );
  await page.locator('[data-test="move-confirm"]').click();
  const res = await moveRes;
  expect(res.status()).toBe(200);
});

test("mobile nav toggle opens hamburger menu on small viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await loginAs(page, ADMIN_EMAIL);

  await expect(page.locator('[data-test="mobile-nav-toggle"]')).toBeVisible();
  await page.locator('[data-test="mobile-nav-toggle"]').click();
  await expect(page.locator('[data-test="mobile-nav"]')).toBeVisible();
  await expect(page.locator('[data-test="logout-mobile"]')).toBeVisible();
});
