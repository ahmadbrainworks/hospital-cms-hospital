import { Page, expect } from "@playwright/test";

const WEB_URL = "http://localhost:3001";
const API_URL = "http://localhost:4000";

export const ADMIN_EMAIL = process.env["E2E_ADMIN_EMAIL"] ?? "admin@hospital.local";
export const ADMIN_PASSWORD = process.env["E2E_ADMIN_PASSWORD"] ?? "Admin@12345!";

/** Login via the web UI and return the page ready for the dashboard. */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto(`${WEB_URL}/login`);
  await page.getByPlaceholder("username or email@hospital.com").fill(ADMIN_EMAIL);
  await page.getByPlaceholder("••••••••").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

/** Create a patient via the API and return its _id. */
export async function createPatientViaApi(
  accessToken: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await fetch(`${API_URL}/api/v1/patients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      profile: {
        firstName: "Test",
        lastName: "Patient",
        dateOfBirth: "1980-01-15",
        gender: "MALE",
        ...overrides,
      },
      contactInfo: {
        phone: "+1-555-0100",
        address: {
          line1: "123 Test St",
          city: "Springfield",
          state: "IL",
          country: "US",
        },
      },
      medicalInfo: {
        allergies: [],
        chronicConditions: [],
        currentMedications: [],
      },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Failed to create patient: ${JSON.stringify(json)}`);
  return json.data._id as string;
}

/** Get an access token via the API login endpoint. */
export async function getApiToken(): Promise<string> {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error("API login failed");
  return json.data.accessToken as string;
}
