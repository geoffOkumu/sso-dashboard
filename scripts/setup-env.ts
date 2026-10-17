import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env.local"))
  console.log(".env.local already exists; left unchanged.");
else {
  writeFileSync(
    ".env.local",
    `BETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}\nBETTER_AUTH_URL=http://localhost:3000\n`,
    { mode: 0o600 },
  );
  console.log(
    "Created a private local authentication configuration. Existing .env was not changed.",
  );
}
