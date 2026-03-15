/**
 * Installer wizard E2E tests.
 *
 * These tests run ONCE against a fresh (uninstalled) database.
 * Skip with SKIP_INSTALL=1 when the DB is already seeded.
 */
import { test, expect } from "@playwright/test";

const INSTALLER_URL = "http://localhost:3002";

test.skip(
  !!process.env["SKIP_INSTALL"],
  "Skipping installer tests (SKIP_INSTALL=1)",
);

test.describe("Installer Wizard", () => {
  test("redirects to /install when database is empty", async ({ page }) => {
    await page.goto(INSTALLER_URL);
    await expect(page).toHaveURL(/\/install/);
  });

  test("completes all wizard steps and creates admin account", async ({ page }) => {
    await page.goto(`${INSTALLER_URL}/install`);

    // Step 1 — Welcome
    await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();
    await page.getByRole("button", { name: /get started|next|continue/i }).click();

    // Step 2 — Hospital Info
    await page.getByLabel(/hospital name/i).fill("General Hospital");
    await page.getByLabel(/subdomain|slug/i).fill("general");
    await page.getByRole("button", { name: /next|continue/i }).click();

    // Step 3 — Admin Account
    await page.getByLabel(/username/i).fill("admin");
    await page.getByLabel(/email/i).fill("admin@hospital.local");
    // Fill password fields
    const pwFields = page.getByRole("textbox", { name: /password/i });
    await pwFields.first().fill("Admin@12345!");
    await pwFields.last().fill("Admin@12345!");
    await page.getByRole("button", { name: /next|continue/i }).click();

    // Step 4 — Review & Install
    await expect(page.getByText(/General Hospital/)).toBeVisible();
    await page.getByRole("button", { name: /install|finish|complete/i }).click();

    // Should show success state
    await expect(
      page.getByText(/installation complete|success|ready/i),
    ).toBeVisible({ timeout: 15_000 });
  });
});
