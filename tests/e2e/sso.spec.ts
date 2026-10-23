import { test, expect, type Page, type Browser } from "@playwright/test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";
const fixture = JSON.parse(readFileSync(".generated/e2e-fixture.json", "utf8"));
async function login(page: Page, who = "viewer") {
  await page.getByLabel("Work email").fill(fixture.users[who].email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
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
const mutationHeaders = { Origin: "http://localhost:3100" };
test("admin can cancel and confirm deleting platforms and directory resources", async ({
  browser,
}) => {
  const context = await adminContext(browser);
  const page = await context.newPage();
  for (const type of ["SSO", "LINK"] as const) {
    const name = `Delete test ${type}`;
    const response = await context.request.post("/api/admin/platforms", {
      headers: mutationHeaders,
      data: {
        name,
        slug: `delete-test-${type.toLowerCase()}`,
        description: "Deletion test",
        icon: "layers",
        launchUrl: "https://example.test",
        type,
        enabled: true,
        displayOrder: 0,
      },
    });
    expect(response.status()).toBe(201);
    const platform = await response.json();
    await page.goto("/platforms");
    await page.getByRole("button", { name: new RegExp(name) }).click();
    const label = type === "LINK" ? "Delete resource" : "Delete platform";
    await page.getByRole("button", { name: label, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(name);
    await expect(dialog).toContainText("This cannot be undone");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(
      (
        await context.request.get(`/api/admin/platforms/${platform.id}`)
      ).status(),
    ).toBe(200);
    await page.getByRole("button", { name: label, exact: true }).click();
    await dialog.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Platforms", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(name) }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("button", { name: new RegExp(name) }),
    ).toHaveCount(0);
  }
  await context.close();
});
test("invitation-only sign-in is responsive and has no public registration", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(
    page.getByText("Ask your administrator", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: ".generated/sign-in-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Work email")).toBeVisible();
  await page.screenshot({
    path: ".generated/sign-in-mobile.png",
    fullPage: true,
  });
  const response = await page.request.post("/api/auth/sign-up/email", {
    headers: mutationHeaders,
    data: {
      name: "Intruder",
      email: "intruder@company.test",
      password: fixture.password,
    },
  });
  expect(response.status()).toBeGreaterThanOrEqual(400);
});
test("employee sees only assigned apps and cannot invoke admin APIs", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Apps & resources", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Customer CRM" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Analytics", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/admin/users")).status()).toBe(403);
  expect(
    (
      await page.request.post(`/api/admin/users/${fixture.users.viewer.id}`, {
        headers: mutationHeaders,
        data: { globalRole: "SUPERADMIN" },
      })
    ).status(),
  ).toBe(403);
  await page.screenshot({ path: ".generated/my-apps.png", fullPage: true });
});
test("unassigned employee sees no apps and is denied when opening CRM directly", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await login(page, "unassigned");
  await expect(
    page.getByText("Your workspace is ready for apps and resources"),
  ).toBeVisible();
  await page.goto("http://localhost:3101/");
  await expect(page.locator("body")).toContainText("do not have access");
});
test("real PKCE sign-in supports SSO into the second tool; viewer direct mutations are denied", async ({
  page,
}) => {
  await page.goto("http://localhost:3101/");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await login(page);
  await expect(page).toHaveURL("http://localhost:3101/");
  await expect(
    page.getByRole("heading", { name: "Your contacts" }),
  ).toBeVisible();
  expect(
    (
      await page.request.post("http://localhost:3101/api/create", {
        headers: { Origin: "http://localhost:3101" },
        form: { name: "Denied", detail: "viewer" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("http://localhost:3101/api/delete", {
        headers: { Origin: "http://localhost:3101" },
        form: { id: "1" },
      })
    ).status(),
  ).toBe(403);
  await page.goto("http://localhost:3102/");
  await expect(page).toHaveURL("http://localhost:3102/");
  await expect(
    page.getByRole("heading", { name: "Your reports" }),
  ).toBeVisible();
  expect(
    (
      await page.request.post("http://localhost:3102/api/export", {
        headers: { Origin: "http://localhost:3102" },
        form: {},
      })
    ).status(),
  ).toBe(403);
});
test("role changes, global logout and a fresh central sign-in cannot revive old tool sessions", async ({
  page,
  browser,
}) => {
  await page.goto("http://localhost:3101/");
  await login(page, "editor");
  await expect(page).toHaveURL("http://localhost:3101/");
  await page.goto("http://localhost:3102/");
  await expect(page).toHaveURL("http://localhost:3102/");
  const admin = await adminContext(browser);
  const change = await admin.request.post(
    `http://localhost:3100/api/admin/access`,
    {
      headers: mutationHeaders,
      data: {
        userId: fixture.users.editor.id,
        platformId: fixture.platforms.crm.id,
        roleId: fixture.platforms.crm.roles.viewer,
      },
    },
  );
  expect(change.ok()).toBe(true);
  expect(
    (
      await page.request.post("http://localhost:3101/api/create", {
        headers: { Origin: "http://localhost:3101" },
        form: { name: "Denied", detail: "demoted" },
      })
    ).status(),
  ).toBe(403);
  await admin.request.post(`http://localhost:3100/api/admin/access`, {
    headers: mutationHeaders,
    data: {
      userId: fixture.users.editor.id,
      platformId: fixture.platforms.crm.id,
      roleId: fixture.platforms.crm.roles.editor,
    },
  });
  const logout = await page.request.post(
    "http://localhost:3100/api/me/logout-everywhere",
    { headers: mutationHeaders, data: {} },
  );
  expect(logout.ok()).toBe(true);
  await page.goto("http://localhost:3100/sign-in");
  await login(page, "editor");
  await expect(page).toHaveURL("http://localhost:3100/");
  expect(
    (
      await page.request.post("http://localhost:3101/api/create", {
        headers: { Origin: "http://localhost:3101" },
        form: { name: "Denied", detail: "old session" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("http://localhost:3102/api/export", {
        headers: { Origin: "http://localhost:3102" },
        form: {},
      })
    ).status(),
  ).toBe(403);
  await admin.close();
});
test("MFA enrollment is mandatory for a superadmin and revokes pre-enrollment sessions", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await login(page, "enrollment");
  await expect(
    page.getByText("Protect your administrator account."),
  ).toBeVisible();
  expect((await page.request.get("/api/admin/users")).status()).toBe(403);
  await page.goto("/security");
  await page.getByLabel("Confirm your password").fill(fixture.password);
  await page.getByRole("button", { name: "Set up MFA", exact: true }).click();
  const qr = page.getByRole("img", { name: "Authenticator setup QR code" });
  await expect(qr).toBeVisible();
  await expect(
    page.getByText("Setup in progress", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Recovery codes", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Cancel setup" }).click();
  await expect(qr).toHaveCount(0);
  await expect(page.getByLabel("Confirm your password")).toHaveValue("");
  expect((await page.request.get("/api/admin/users")).status()).toBe(403);
  await page.getByLabel("Confirm your password").fill(fixture.password);
  await page.getByRole("button", { name: "Set up MFA", exact: true }).click();
  await expect(qr).toBeVisible();
  await expect(qr.locator("path")).not.toHaveCount(0);
  await page.getByText("Can’t scan the code?", { exact: true }).click();
  const secret = await page.getByLabel("Authenticator setup key").textContent();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy setup key" }).click();
  await expect(page.getByRole("status")).toContainText("Setup key copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    secret,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(qr).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".generated/mfa-connect-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: ".generated/mfa-connect-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  const input = page.getByLabel("Six-digit authentication code");
  const verify = page.getByRole("button", { name: "Verify and enable" });
  await expect(verify).toBeDisabled();
  await input.fill("123");
  await expect(verify).toBeDisabled();
  // A rejected verification must preserve enrollment so the user can retry.
  await page.route("**/api/auth/two-factor/verify-totp", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ code: "INVALID_CODE", message: "Invalid code" }),
    }),
  );
  await input.fill("123456");
  await verify.click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Enter the latest six-digit code" }),
  ).toBeVisible();
  await expect(qr).toBeVisible();
  await expect(page.getByLabel("Authenticator setup key")).toHaveText(secret!);
  await page.unroute("**/api/auth/two-factor/verify-totp");
  const code = await createOTP(
    new TextDecoder().decode(base32.decode(secret!)),
  ).totp();
  await input.fill(code.slice(0, 3) + " " + code.slice(3));
  await expect(input).toHaveValue(code);
  await verify.click();
  await expect(
    page.getByText("MFA is enabled.", { exact: false }),
  ).toBeVisible();
  await expect(qr).toHaveCount(0);
  await expect(page.getByLabel("Authenticator setup key")).toHaveCount(0);
  const recovery = page.getByLabel("Recovery codes", { exact: true });
  const codes = await recovery.locator("code").allTextContents();
  expect(codes.length).toBeGreaterThan(0);
  await expect(
    page.getByRole("button", { name: "Finish setup" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Copy codes", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    codes.join("\n"),
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download codes" }).click();
  const download = await downloadEvent;
  expect(readFileSync((await download.path())!, "utf8")).toContain(
    codes.join("\n"),
  );
  await page.screenshot({
    path: ".generated/mfa-recovery-desktop.png",
    fullPage: true,
  });
  await page
    .getByLabel("I have saved my recovery codes somewhere safe.")
    .check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(
    page.getByRole("heading", { name: "MFA setup complete" }),
  ).toBeVisible();
  await expect(recovery).toHaveCount(0);
  await expect(page.getByText("Disable MFA", { exact: true })).toHaveCount(0);
  expect((await page.request.get("/api/admin/users")).status()).toBe(200);
  await page.goto("/overview");
  await expect(
    page.getByRole("heading", { name: "Workspace overview" }),
  ).toBeVisible();
  await page.screenshot({
    path: ".generated/admin-overview.png",
    fullPage: true,
  });
  await page.request.post("/api/me/logout-everywhere", {
    headers: mutationHeaders,
    data: {},
  });
  await page.goto("http://localhost:3101/");
  await login(page, "enrollment");
  await expect(
    page.getByRole("heading", { name: "Verify it's you" }),
  ).toBeVisible();
  await page
    .getByLabel("Authentication code")
    .fill(
      await createOTP(new TextDecoder().decode(base32.decode(secret!))).totp(),
    );
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page).toHaveURL("http://localhost:3101/");
  await expect(
    page.getByRole("heading", { name: "Your contacts" }),
  ).toBeVisible();
});
test("callbacks reject missing flows and tampered state; provider rejects wildcard redirect", async ({
  page,
}) => {
  await page.goto("http://localhost:3101/callback?code=fake&state=fake");
  await expect(page.getByText("invalid login flow")).toBeVisible();
  const response = await page.request.get(
    `http://localhost:3100/api/auth/oauth2/authorize?client_id=${fixture.platforms.crm.clientId}&redirect_uri=${encodeURIComponent("https://evil.example/*")}&response_type=code&scope=openid&code_challenge=${"x".repeat(43)}&code_challenge_method=S256`,
    { maxRedirects: 0 },
  );
  const location = response.headers()["location"];
  expect(location || "").not.toContain("evil.example");
  expect(response.status() >= 400 || (location || "").includes("error")).toBe(
    true,
  );
});
test("superadmin can use a newly registered platform without an assignment", async ({
  browser,
}) => {
  const admin = await adminContext(browser);
  const response = await admin.request.post(
    "http://localhost:3100/api/admin/platforms",
    {
      headers: mutationHeaders,
      data: {
        name: "New internal tool",
        slug: "new-tool",
        description: "Created after administrator",
        icon: "code",
        launchUrl: "http://localhost:3101/login",
        enabled: true,
        displayOrder: 3,
      },
    },
  );
  expect(response.ok()).toBe(true);
  const me = await (
    await admin.request.get("http://localhost:3100/api/me")
  ).json();
  expect(me.apps.some((app: { slug: string }) => app.slug === "new-tool")).toBe(
    true,
  );
  const page = await admin.newPage();
  await page.goto("http://localhost:3100/platforms");
  await expect(page.getByText("New internal tool")).toBeVisible();
  await page.screenshot({ path: ".generated/platforms.png", fullPage: true });
  await admin.close();
});

test("permission edits and assignment revocation stop existing sensitive operations", async ({
  page,
  browser,
}) => {
  await page.goto("http://localhost:3102/");
  await login(page, "editor");
  await expect(page).toHaveURL("http://localhost:3102/");
  const endpoint = "http://localhost:3102/api/export",
    headers = { Origin: "http://localhost:3102" };
  expect(
    (await page.request.post(endpoint, { headers, form: {} })).status(),
  ).toBe(200);
  const admin = await adminContext(browser),
    platform = fixture.platforms.analytics;
  const changed = await admin.request.post(
    `http://localhost:3100/api/admin/platforms/${platform.id}/roles`,
    {
      headers: mutationHeaders,
      data: {
        key: "editor",
        name: "Editor",
        permissionIds: [platform.permissions[0]],
      },
    },
  );
  expect(changed.ok()).toBe(true);
  expect(
    (await page.request.post(endpoint, { headers, form: {} })).status(),
  ).toBe(403);
  await admin.request.post(
    `http://localhost:3100/api/admin/platforms/${platform.id}/roles`,
    {
      headers: mutationHeaders,
      data: {
        key: "editor",
        name: "Editor",
        permissionIds: platform.permissions.slice(0, 2),
      },
    },
  );
  expect(
    (await page.request.post(endpoint, { headers, form: {} })).status(),
  ).toBe(200);
  await admin.request.post("http://localhost:3100/api/admin/access", {
    headers: mutationHeaders,
    data: {
      userId: fixture.users.editor.id,
      platformId: platform.id,
      roleId: platform.roles.editor,
      revoke: true,
    },
  });
  expect(
    (await page.request.post(endpoint, { headers, form: {} })).status(),
  ).toBe(403);
  await admin.close();
});
test("client registration and rotation show secrets once, never in lists", async ({
  browser,
}) => {
  const admin = await adminContext(browser);
  const created = await admin.request.post(
    `http://localhost:3100/api/admin/platforms/${fixture.platforms.crm.id}/clients`,
    {
      headers: mutationHeaders,
      data: {
        name: "Additional development client",
        environment: "development",
        redirectUris: ["http://localhost:3199/callback"],
        postLogoutRedirectUris: ["http://localhost:3199/"],
      },
    },
  );
  expect(created.status()).toBe(201);
  const credentials = await created.json();
  expect(credentials.clientSecret).toBeTruthy();
  const listed = await (
    await admin.request.get(
      `http://localhost:3100/api/admin/platforms/${fixture.platforms.crm.id}`,
    )
  ).json();
  expect(JSON.stringify(listed)).not.toContain(credentials.clientSecret);
  expect(JSON.stringify(listed)).not.toContain("clientSecret");
  const registration = listed.clients.find(
    (client: { oauthClientId: string }) =>
      client.oauthClientId === credentials.clientId,
  );
  const updated = await admin.request.post(
    `http://localhost:3100/api/admin/clients/${registration.id}/settings`,
    {
      headers: mutationHeaders,
      data: {
        name: "Updated client",
        environment: "development",
        redirectUris: ["http://localhost:3199/updated-callback"],
        postLogoutRedirectUris: ["http://localhost:3199/"],
      },
    },
  );
  expect(updated.ok()).toBe(true);
  const afterUpdate = await (
    await admin.request.get(
      `http://localhost:3100/api/admin/platforms/${fixture.platforms.crm.id}`,
    )
  ).json();
  expect(
    afterUpdate.clients.find(
      (client: { id: string }) => client.id === registration.id,
    ).oauthClient.redirectUris,
  ).toEqual(["http://localhost:3199/updated-callback"]);
  const rotated = await admin.request.post(
    `http://localhost:3100/api/admin/clients/${registration.id}/rotate`,
    { headers: mutationHeaders, data: {} },
  );
  expect(rotated.ok()).toBe(true);
  expect((await rotated.json()).clientSecret).not.toBe(
    credentials.clientSecret,
  );
  const disabled = await admin.request.post(
    `http://localhost:3100/api/admin/clients/${registration.id}`,
    { headers: mutationHeaders, data: { enabled: false } },
  );
  expect(disabled.ok()).toBe(true);
  await admin.close();
});

test("admin adds a directory resource that unassigned employees can discover", async ({
  browser,
  page,
}) => {
  const admin = await adminContext(browser);
  const adminPage = await admin.newPage();
  await adminPage.goto("/platforms");
  await adminPage
    .getByRole("button", { name: "Add platform", exact: true })
    .first()
    .click();
  await adminPage.getByLabel("Type", { exact: false }).selectOption("LINK");
  await adminPage
    .getByLabel("Resource name", { exact: true })
    .fill("Company handbook");
  await adminPage.getByLabel("Slug", { exact: true }).fill("company-handbook");
  await adminPage
    .getByLabel("Description", { exact: true })
    .fill("Policies and useful team resources");
  await adminPage
    .getByLabel("Launch URL", { exact: false })
    .fill("https://docs.company.test/handbook#leave");
  await adminPage
    .getByRole("button", { name: "Save resource", exact: true })
    .click();
  await expect(adminPage.getByRole("dialog")).not.toBeVisible();
  await adminPage
    .getByRole("button", { name: "Company handbook company-handbook" })
    .click();
  await expect(
    adminPage.getByRole("button", { name: "Resource settings", exact: true }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole("button", { name: "OIDC clients", exact: true }),
  ).not.toBeVisible();
  await page.goto("/sign-in");
  await login(page, "unassigned");
  await page.getByPlaceholder("Search apps and resources...").fill("handbook");
  const resource = page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: "Company handbook" }) });
  await expect(resource).toHaveAttribute(
    "href",
    "https://docs.company.test/handbook#leave",
  );
  await expect(resource).toContainText("Directory resource");
  await expect(resource).toContainText("Open resource");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(resource).toBeVisible();
  await expect(page.getByRole("complementary")).not.toBeInViewport();
  await page.screenshot({
    path: ".generated/directory-mobile.png",
    fullPage: true,
  });
  await adminPage
    .getByRole("button", { name: "Resource settings", exact: true })
    .click();
  await adminPage
    .getByLabel("Resource name", { exact: true })
    .fill("Team handbook");
  await adminPage
    .getByRole("button", { name: "Save resource", exact: true })
    .click();
  await expect(
    adminPage.getByRole("heading", { name: "Team handbook", exact: true }),
  ).toBeVisible();
  await adminPage.screenshot({
    path: ".generated/directory-admin.png",
    fullPage: true,
  });
  await adminPage
    .getByRole("button", { name: "Resource settings", exact: true })
    .click();
  await adminPage.getByLabel("Show in directory").uncheck();
  adminPage.once("dialog", (dialog) => dialog.accept());
  await adminPage
    .getByRole("button", { name: "Save resource", exact: true })
    .click();
  await expect(adminPage.getByText("Hidden", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Team handbook", exact: true }),
  ).not.toBeVisible();
  await admin.close();
});

test("apps renew expired access tokens during reads and form submissions without redirecting to SSO", async ({
  page,
}) => {
  const testEnv = JSON.parse(readFileSync(".generated/test-env.json", "utf8"));
  if (!testEnv.TEST_SCHEMA?.startsWith("test_access_"))
    throw new Error("Isolated test schema required");
  await page.goto("http://localhost:3101/");
  await login(page, "renewal");
  await expect(page).toHaveURL("http://localhost:3101/");
  await page.goto("http://localhost:3102/");
  await expect(page).toHaveURL("http://localhost:3102/");
  const cookies = await page.context().cookies();
  for (const kind of ["crm", "analytics"] as const) {
    const cookie = cookies.find(
      (cookie) => cookie.name === `company-${kind}-session`,
    )!;
    expect(cookie.expires * 1000 - Date.now()).toBeGreaterThan(900_000);
    const store = new DatabaseSync(
      `.generated/${testEnv.TEST_SCHEMA}-${kind}/${kind}.sqlite`,
    );
    try {
      const before = store
        .prepare("SELECT accessToken, refreshToken FROM session WHERE id = ?")
        .get(cookie.value)!;
      expect(typeof before.refreshToken).toBe("string");
      store
        .prepare("UPDATE session SET accessTokenExpires = ? WHERE id = ?")
        .run(Date.now() - 1000, cookie.value);
      if (kind === "crm") {
        const crossSite = await page.request.post(
          "http://localhost:3101/api/create",
          {
            headers: { Origin: "https://untrusted.example" },
            form: { name: "Cross-site denied", detail: "Must not be created" },
          },
        );
        expect(crossSite.status()).toBe(403);
        expect(await crossSite.text()).toContain("Invalid request origin");
        // Leave the already-rendered form intact while its access token expires.
        await page.goto("http://localhost:3101/");
        store
          .prepare("UPDATE session SET accessTokenExpires = ? WHERE id = ?")
          .run(Date.now() - 1000, cookie.value);
        await page
          .getByRole("textbox", { name: "Name", exact: true })
          .fill("Renewed form contact");
        await page
          .getByRole("textbox", { name: "Detail", exact: true })
          .fill("Saved without signing in again");
        const submission = page.waitForResponse(
          (response) => response.url() === "http://localhost:3101/api/create",
        );
        await page
          .getByRole("button", { name: "Add record", exact: true })
          .click();
        const submitted = await submission;
        expect(
          submitted.status(),
          submitted.status() === 302 ? "" : await submitted.text(),
        ).toBe(302);
        await expect(page).toHaveURL("http://localhost:3101/");
        await expect(
          page.getByRole("cell", { name: "Renewed form contact", exact: true }),
        ).toBeVisible();
        // Parallel requests must share a single refresh, without replaying writes.
        store
          .prepare("UPDATE session SET accessTokenExpires = ? WHERE id = ?")
          .run(Date.now() - 1000, cookie.value);
        const responses = await Promise.all(
          [1, 2].map((n) =>
            page.request.post("http://localhost:3101/api/create", {
              headers: { Origin: "http://localhost:3101" },
              form: { name: `Concurrent renewal ${n}`, detail: "One write" },
              maxRedirects: 0,
            }),
          ),
        );
        expect(responses.map((response) => response.status())).toEqual([
          302, 302,
        ]);
        expect(
          store
            .prepare(
              "SELECT count(*) AS n FROM record WHERE name LIKE 'Concurrent renewal %'",
            )
            .get()!.n,
        ).toBe(2);
      } else {
        await page.goto("http://localhost:3102/");
        await expect(page).toHaveURL("http://localhost:3102/");
        await expect(
          page.getByRole("heading", { name: "Your reports" }),
        ).toBeVisible();
      }
      const after = store
        .prepare(
          "SELECT accessToken, refreshToken, accessTokenExpires, expires FROM session WHERE id = ?",
        )
        .get(cookie.value)!;
      expect(after.accessToken !== before.accessToken).toBe(true);
      expect(after.refreshToken !== before.refreshToken).toBe(true);
      expect(Number(after.accessTokenExpires)).toBeGreaterThan(Date.now());
      expect(Number(after.expires)).toBeGreaterThan(
        Number(after.accessTokenExpires),
      );
    } finally {
      store.close();
    }
  }
});
