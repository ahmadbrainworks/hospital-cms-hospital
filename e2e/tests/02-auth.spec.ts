/**
 * Authentication E2E tests.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Login", () => {
  test("shows login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /hospital cms/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("username or email@hospital.com").fill("nobody");
    await page.getByPlaceholder("••••••••").fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/invalid username or password/i)).toBeVisible();
  });

  test("redirects to /dashboard after successful login", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/dashboard/i)).toBeVisible();
  });

  test("redirects unauthenticated user to /login", async ({ page }) => {
    await page.goto("/patients");
    await expect(page).toHaveURL(/\/login/);
  });
});
