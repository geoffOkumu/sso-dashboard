import { test, expect, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const fixture = JSON.parse(readFileSync(".generated/e2e-fixture.json", "utf8"));
const password = randomBytes(24).toString("base64url");
const newPassword = randomBytes(24).toString("base64url");
const db = new PrismaClient();
test.beforeEach(async () => {
  if (!process.env.TEST_SCHEMA?.startsWith("test_access_"))
    throw new Error("Disposable test schema required");
  // Earlier SSO tests consume the shared local IP's sign-in quota.
  await db.requestLimit.deleteMany();
  await db.rateLimit.deleteMany();
});
test.afterAll(() => db.$disconnect());
async function adminContext(browser: Browser) {
  const context = await browser.newContext();
  const [name, ...rest] = fixture.adminCookie.split("=");
  await context.addCookies([
    {
      name,
      value: rest.join("="),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return context;
}
async function login(page: Page, email: string, value = password) {
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function replacePassword(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: "Change your temporary password" }),
  ).toBeVisible();
  await page.getByLabel("Temporary password", { exact: true }).fill(password);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  await page.getByRole("link", { name: "Continue to sign in" }).click();
}

test("admin can create permanent and one-time password users from the form", async ({
  browser,
}) => {
  const admin = await adminContext(browser);
  const adminPage = await admin.newPage();
  for (const temporary of [false, true]) {
    const email = `password-ui-${temporary}@test.example`;
    await adminPage.goto("/users");
    await adminPage
      .getByRole("button", { name: "Add user", exact: true })
      .click();
    const modal = adminPage.getByRole("dialog");
    await modal.getByLabel("Account setup").selectOption("password");
    await modal.getByLabel("Full name").fill(`Password UI ${temporary}`);
    await modal.getByLabel("Work email").fill(email);
    await modal.getByLabel("Password", { exact: true }).fill(password);
    if (temporary) await modal.getByRole("checkbox").check();
    if (temporary)
      await adminPage.screenshot({
        path: test.info().outputPath("create-user.png"),
      });
    await modal.getByRole("button", { name: "Create user" }).click();
    await expect(modal).not.toBeVisible();
    await expect(adminPage.getByText(email, { exact: true })).toBeVisible();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto("/sign-in");
    await login(page, email);
    if (temporary) {
      await expect(page).toHaveURL(/\/change-password/);
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: test.info().outputPath("change-password-mobile.png"),
        fullPage: true,
      });
      expect((await context.request.get("/api/me")).status()).toBe(403);
      await page.goto("/account");
      await expect(page).toHaveURL(/\/change-password/);
      await replacePassword(page);
      await login(page, email, newPassword);
    }
    await expect(page).toHaveURL("http://localhost:3100/");
    expect((await context.request.get("/api/me")).status()).toBe(200);
    await context.close();
  }
  await admin.close();
});

test("SSO login requires replacing the temporary password before continuing to the application", async ({
  browser,
  page,
}) => {
  const admin = await adminContext(browser);
  const email = "password-sso@test.example";
  const response = await admin.request.post("/api/admin/users", {
    headers: { Origin: "http://localhost:3100" },
    data: {
      name: "Password SSO",
      email,
      password,
      passwordChangeRequired: true,
      grants: [
        {
          platformId: fixture.platforms.crm.id,
          roleId: fixture.platforms.crm.roles.viewer,
        },
      ],
    },
  });
  expect(response.status()).toBe(201);
  await page.goto("http://localhost:3101/login");
  await expect(page).toHaveURL(/localhost:3100\/sign-in/);
  await login(page, email);
  await expect(page).toHaveURL(/localhost:3100\/change-password\?/);
  await replacePassword(page);
  await login(page, email, newPassword);
  await expect(page).toHaveURL("http://localhost:3101/");
  await admin.close();
});
