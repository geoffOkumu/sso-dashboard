import { createHash } from "node:crypto";
import { db } from "./db";
import { HttpError } from "./http";
/** PostgreSQL UPSERT makes the counter atomic across all application instances. */
export async function rateLimit(key: string, max = 10, windowSeconds = 60) {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const id = createHash("sha256").update(`${key}:${bucket}`).digest("hex");
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RequestLimit" ("id", "count", "expiresAt") VALUES (${id}, 1, ${new Date((bucket + 2) * windowSeconds * 1000)})
    ON CONFLICT ("id") DO UPDATE SET "count" = "RequestLimit"."count" + 1 RETURNING "count"`;
  if (rows[0].count > max)
    throw new HttpError(429, "Too many requests. Please try again later.");
}
export function requestAddress(request: Request) {
  const header = process.env.TRUSTED_IP_HEADER;
  return header
    ? request.headers.get(header)?.split(",")[0].trim() || "unknown"
    : "shared";
}
