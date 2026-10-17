import "./load-env";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
const schema = `test_access_${Date.now()}_${randomBytes(4).toString("hex")}`;
const baseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!baseUrl) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL");
const url = new URL(baseUrl);
url.searchParams.set("schema", schema);
const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
const env = {
  ...process.env,
  DATABASE_URL: url.href,
  BETTER_AUTH_URL: "http://localhost:3100",
  BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
  NODE_ENV: "test" as const,
  TEST_SCHEMA: schema,
};
const mode = process.argv[2] || "db";
function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}
try {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  console.log("Created isolated disposable test schema.");
  await run(process.execPath, [
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
  ]);
  if (mode === "e2e") {
    mkdirSync(".generated", { recursive: true });
    writeFileSync(
      ".generated/test-env.json",
      JSON.stringify({
        DATABASE_URL: env.DATABASE_URL,
        BETTER_AUTH_URL: env.BETTER_AUTH_URL,
        BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
        TEST_SCHEMA: env.TEST_SCHEMA,
      }),
      {
        mode: 0o600,
      },
    );
    await run(process.execPath, ["--import", "tsx", "scripts/e2e-fixtures.ts"]);
    await run(process.execPath, [
      "node_modules/@playwright/test/cli.js",
      "test",
    ]);
  } else
    await run(process.execPath, [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "vitest.db.config.ts",
    ]);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Tests failed");
  process.exitCode = 1;
} finally {
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
  if (mode === "e2e") {
    for (const file of [
      ".generated/test-env.json",
      ".generated/e2e-fixture.json",
    ])
      rmSync(file, { force: true });
    for (const kind of ["crm", "analytics"])
      rmSync(`.generated/${schema}-${kind}`, { recursive: true, force: true });
  }
  console.log("Removed disposable test schema and ephemeral credentials.");
}
