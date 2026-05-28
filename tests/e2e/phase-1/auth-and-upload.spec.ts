import { test, expect, request } from "@playwright/test";

const ADMIN_EMAIL = "playwright-test@example.com";
const API_BASE = process.env.E2E_API_BASE ?? "http://localhost:3001";

async function fetchLatestCodeForEmail(email: string): Promise<string> {
  const ctx = await request.newContext({ baseURL: API_BASE });
  const res = await ctx.get("/api/__test/latest-code", {
    params: { email },
  });
  if (!res.ok()) throw new Error(`code fetch failed: ${res.status()}`);
  const body = await res.json();
  return body.code as string;
}

test("OTP login: admin logs in via emailed code", async ({ page }) => {
  await page.goto("/login");
  await page.locator('[data-test="email"]').fill(ADMIN_EMAIL);
  await page.locator('[data-test="send-code"]').click();
  await expect(page.locator('[data-test="code"]')).toBeVisible();

  const code = await fetchLatestCodeForEmail(ADMIN_EMAIL);
  await page.locator('[data-test="code"]').fill(code);
  await page.locator('[data-test="verify"]').click();

  await expect(page).toHaveURL("/", { timeout: 15000 });
  await expect(page.getByText("Gray Family Photos")).toBeVisible();

  await page.locator('[data-test="logout"]').click();
  await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
});

test("OTP login: wrong code shows error", async ({ page }) => {
  await page.goto("/login");
  await page.locator('[data-test="email"]').fill(ADMIN_EMAIL);
  await page.locator('[data-test="send-code"]').click();
  await expect(page.locator('[data-test="code"]')).toBeVisible();

  await page.locator('[data-test="code"]').fill("000000");
  await page.locator('[data-test="verify"]').click();

  await expect(page.locator('[data-test="error"]')).toBeVisible();
});

test("upload photo via UI after OTP login", async ({ page }) => {
  await page.goto("/login");
  await page.locator('[data-test="email"]').fill(ADMIN_EMAIL);
  await page.locator('[data-test="send-code"]').click();
  await expect(page.locator('[data-test="code"]')).toBeVisible();
  const code = await fetchLatestCodeForEmail(ADMIN_EMAIL);
  await page.locator('[data-test="code"]').fill(code);
  await page.locator('[data-test="verify"]').click();
  await expect(page).toHaveURL("/", { timeout: 15000 });

  await page.goto("/upload");
  await page.locator('[data-test="files"]').setInputFiles("/tmp/test-photo.jpg");
  await page.locator('[data-test="start"]').click();

  await expect(page.locator('[data-test="metadata-modal"]')).toBeVisible();
  await page.locator('[data-test="metadata-location-input"]').fill("sydney");
  await expect(page.locator('[data-test="metadata-location-option"]').first()).toBeVisible({
    timeout: 5000,
  });
  await page.locator('[data-test="metadata-location-option"]').first().click();

  const uploadResponse = page.waitForResponse(
    (r) => r.url().includes("/api/photos/commit") && r.request().method() === "POST",
  );
  await page.locator('[data-test="metadata-confirm"]').click();
  const res = await uploadResponse;
  expect(res.status()).toBe(201);
  await expect(page).toHaveURL("/", { timeout: 15000 });
});
