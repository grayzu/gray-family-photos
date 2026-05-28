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

test("upload to specific album from album detail puts photo in that album regardless of location", async ({
  page,
}) => {
  await loginAs(page, ADMIN_EMAIL);

  await page.goto("/upload");
  await uploadAt(page, "darwin");
  await expect(page).toHaveURL("/", { timeout: 15000 });
  const darwinCard = page
    .locator('[data-test="album-card"]')
    .filter({ hasText: "Darwin" })
    .first();
  await expect(darwinCard).toBeVisible({ timeout: 10000 });
  await darwinCard.click();

  await page.locator('[data-test="upload-to-album"]').click();
  await expect(page).toHaveURL(/\/upload\?albumId=/);
  await expect(page.locator('[data-test="target-album-banner"]')).toBeVisible();
  await expect(page.locator('[data-test="target-album-banner"]')).toContainText(
    "Darwin",
  );

  await uploadAt(page, "hobart");

  const commitRes = page.waitForResponse(
    (r) => r.url().includes("/api/photos/commit") && r.request().method() === "POST",
  );
  await commitRes;

  await expect(page).toHaveURL(/\/albums\/[^/]+$/, { timeout: 15000 });
  await expect(page.locator('[data-test="album-name"]')).toContainText("Darwin");
  await expect(page.locator('[data-test="album-photo"]').nth(1)).toBeVisible({
    timeout: 10000,
  });
});
