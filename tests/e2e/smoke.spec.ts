import { test, expect } from "@playwright/test";

test.describe("public viewing (no login)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("home shows Albums and a Sign in link, no Logout button", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1", { hasText: "Albums" })).toBeVisible();
    await expect(page.locator('[data-test="login-link"]')).toBeVisible();
    await expect(page.locator('[data-test="logout"]')).toHaveCount(0);
  });

  test("clicking an album opens its detail page without requiring login", async ({ page }) => {
    await page.goto("/");
    const firstAlbum = page.locator('[data-test="album-card"]').first();
    await expect(firstAlbum).toBeVisible({ timeout: 10000 });
    await firstAlbum.click();
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('[data-test="album-name"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-test="album-photo"]').first()).toBeVisible();
  });

  test("anonymous album view hides upload, share, and admin-only controls", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-test="album-card"]').first().click();
    await expect(page.locator('[data-test="album-name"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-test="upload-to-album"]')).toHaveCount(0);
    await expect(page.locator('[data-test="share-toggle"]')).toHaveCount(0);
    await expect(page.locator('[data-test="enter-select"]')).toHaveCount(0);
    await expect(page.locator('[data-test="advanced-menu"]')).toHaveCount(0);
  });

  test("lightbox opens for anonymous viewer and shows no admin menu or download", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-test="album-card"]').first().click();
    await page.locator('[data-test="album-photo"]').first().click();
    await expect(page.locator('[data-test="lightbox"]')).toBeVisible();
    await expect(page.locator('[data-test="lightbox-menu"]')).toHaveCount(0);
    await expect(page.locator('[data-test="lightbox-download"]')).toHaveCount(0);
  });
});
