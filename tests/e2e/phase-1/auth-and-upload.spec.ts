import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "mark@grayszone.com";
const ADMIN_PASSWORD = "testtest123";

test("QA-1.5 login + QA-1.6 logout via UI", async ({ page }) => {
  await page.goto("/login");
  await page.locator('[data-test="email"]').fill(ADMIN_EMAIL);
  await page.locator('[data-test="password"]').fill(ADMIN_PASSWORD);
  await page.locator('[data-test="submit"]').click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Gray Family Photos")).toBeVisible();

  await page.locator('[data-test="logout"]').click();
  await expect(page).toHaveURL(/\/login/);
});

test("QA-1.7 upload photo via UI, appears in grid", async ({ page }) => {
  await page.goto("/login");
  await page.locator('[data-test="email"]').fill(ADMIN_EMAIL);
  await page.locator('[data-test="password"]').fill(ADMIN_PASSWORD);
  await page.locator('[data-test="submit"]').click();
  await expect(page).toHaveURL("/");

  await page.goto("/upload");
  await page.locator('[data-test="file"]').setInputFiles("/tmp/test-photo.jpg");
  await page.locator('[data-test="submit"]').click();
  await expect(page).toHaveURL("/", { timeout: 15000 });

  await expect(page.locator('[data-test="photo-thumb"]').first()).toBeVisible({
    timeout: 10000,
  });
});
