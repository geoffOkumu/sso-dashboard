import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
const env = JSON.parse(readFileSync(".generated/test-env.json", "utf8"));
const fixture = JSON.parse(readFileSync(".generated/e2e-fixture.json", "utf8"));
const kind = process.argv[2];
if (!env.TEST_SCHEMA?.startsWith("test_access_"))
  throw new Error("Isolated test schema required");
const port = kind === "crm" ? 3101 : 3102;
const args =
  kind === "identity"
    ? ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "3100"]
    : ["--import", "tsx", `apps/demo-${kind}/server.ts`];
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: {
    ...env,
    NODE_ENV: "development",
    ...(kind === "identity"
      ? {}
      : {
          APP_URL: `http://localhost:${port}`,
          PORT: String(port),
          OIDC_ISSUER: "http://localhost:3100/api/auth",
          OIDC_CLIENT_ID: fixture.platforms[kind].clientId,
          OIDC_CLIENT_SECRET: fixture.platforms[kind].clientSecret,
          DATA_DIR: `.generated/${env.TEST_SCHEMA}-${kind}`,
        }),
  },
});
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
child.on("exit", (code) => process.exit(code || 0));
