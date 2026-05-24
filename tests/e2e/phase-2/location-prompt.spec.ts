import { test, expect, request } from "@playwright/test";

const ADMIN_EMAIL = "mark@grayszone.com";
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

test("upload without GPS shows location prompt, geocode finds Sydney, confirms and uploads", async ({
  page,
}) => {
  await loginAs(page, ADMIN_EMAIL);

  await page.goto("/upload");
  await page.locator('[data-test="files"]').setInputFiles("/tmp/test-photo.jpg");
  await page.locator('[data-test="start"]').click();

  await expect(page.locator('[data-test="location-modal"]')).toBeVisible();

  await page.locator('[data-test="location-input"]').fill("sydney");
  await expect(page.locator('[data-test="location-option"]').first()).toBeVisible({
    timeout: 5000,
  });

  await page.locator('[data-test="location-option"]').first().click();
  const uploadPromise = page.waitForResponse(
    (r) => r.url().includes("/api/photos/upload") && r.request().method() === "POST",
  );
  await page.locator('[data-test="location-confirm"]').click();
  const res = await uploadPromise;
  expect(res.status()).toBe(201);

  await expect(page).toHaveURL("/", { timeout: 15000 });
});

test("invalid location query shows no-matches message", async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL);

  await page.goto("/upload");
  await page.locator('[data-test="files"]').setInputFiles("/tmp/test-photo.jpg");
  await page.locator('[data-test="start"]').click();

  await expect(page.locator('[data-test="location-modal"]')).toBeVisible();
  await page.locator('[data-test="location-input"]').fill("xqzpdqzzzz");
  await expect(page.locator('[data-test="no-matches"]')).toBeVisible({
    timeout: 5000,
  });
  await expect(page.locator('[data-test="location-confirm"]')).toBeDisabled();
});
