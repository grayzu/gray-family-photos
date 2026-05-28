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
  await page.locator('[data-test="files"]').setInputFiles("/tmp/test-photo.jpg");
  await page.locator('[data-test="start"]').click();
  await expect(page.locator('[data-test="metadata-modal"]')).toBeVisible();
  await page.locator('[data-test="metadata-location-input"]').fill(locationQuery);
  await expect(page.locator('[data-test="metadata-location-option"]').first()).toBeVisible({
    timeout: 5000,
  });
  await page.locator('[data-test="metadata-location-option"]').first().click();
  await page.locator('[data-test="metadata-confirm"]').click();
}

test("admin can open thumbnail modal and save single cover", async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL);
  await page.goto("/upload");
  await uploadAt(page, "perth");
  await expect(page).toHaveURL("/", { timeout: 15000 });

  const card = page
    .locator('[data-test="album-card"]')
    .filter({ hasText: "Perth" })
    .first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.click();

  await expect(page.locator('[data-test="album-photo"]').first()).toBeVisible({
    timeout: 10000,
  });

  // Open advanced menu and select Set album thumbnail
  // Open advanced menu and select Set album thumbnail
  await page.locator('[data-test="advanced-menu"]').click();
  await page.locator('[data-test="set-thumbnail"]').click();
  await expect(page.locator('[data-test="thumbnail-modal"]')).toBeVisible();
  await page.locator('[data-test="thumbnail-photo"]').first().click();
  const patch = page.waitForResponse(
    (r) => /\/api\/albums\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH",
  );
  await page.locator('[data-test="thumbnail-save"]').click();
  const res = await patch;
  expect(res.status()).toBe(200);
  await expect(page.locator('[data-test="thumbnail-modal"]')).toBeHidden({ timeout: 5000 });
});
