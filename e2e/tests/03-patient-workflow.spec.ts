/**
 * Patient registration → encounter → discharge E2E flow.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin, getApiToken, createPatientViaApi } from "./helpers";

test.describe("Patient Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("registers a new patient via the UI", async ({ page }) => {
    await page.goto("/patients");
    await page.getByRole("button", { name: /new patient|register/i }).click();

    // Fill patient form
    await page.getByLabel(/first name/i).fill("Jane");
    await page.getByLabel(/last name/i).fill("Doe");
    await page.getByLabel(/date of birth/i).fill("1990-06-15");

    // Select gender
    const genderSelect = page.getByLabel(/gender/i);
    if (await genderSelect.count() > 0) {
      await genderSelect.selectOption("FEMALE");
    }

    await page.getByLabel(/phone/i).fill("+1-555-0200");
    await page.getByLabel(/address line 1/i).fill("456 Elm Street");
    await page.getByLabel(/city/i).fill("Shelbyville");
    await page.getByLabel(/state/i).fill("IL");
    await page.getByLabel(/country/i).fill("US");

    await page.getByRole("button", { name: /register|save|create/i }).click();

    // Should land on patient detail page or list with new patient
    await expect(page.getByText("Jane")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Doe")).toBeVisible();
  });

  test("views patient list", async ({ page }) => {
    await page.goto("/patients");
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("searches for a patient", async ({ page }) => {
    // Create a patient with a unique name via API first
    const token = await getApiToken();
    await createPatientViaApi(token, { lastName: "UniqueSearchName" });

    await page.goto("/patients");
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.count() > 0) {
      await searchInput.fill("UniqueSearchName");
      await expect(page.getByText("UniqueSearchName")).toBeVisible({ timeout: 5_000 });
    }
  });

  test("creates an encounter for a patient", async ({ page }) => {
    const token = await getApiToken();
    const patientId = await createPatientViaApi(token);

    await page.goto(`/patients/${patientId}`);
    await page.getByRole("button", { name: /new encounter|admit/i }).click();

    await page.getByLabel(/chief complaint/i).fill("Chest pain");

    // Select encounter type
    const typeSelect = page.getByLabel(/type/i);
    if (await typeSelect.count() > 0) {
      await typeSelect.selectOption("EMERGENCY");
    }

    await page.getByRole("button", { name: /save|create|admit/i }).click();
    await expect(page.getByText(/chest pain/i)).toBeVisible({ timeout: 5_000 });
  });
});
