import { z } from "zod";
export const iconKeys = [
  "briefcase",
  "chart",
  "layers",
  "code",
  "book",
  "folder",
  "globe",
  "headphones",
] as const;
export function isSafeUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      !value.includes("*") &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (url.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" &&
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}
export const safeUrl = z
  .string()
  .url()
  .refine(
    isSafeUrl,
    "Use HTTPS or a loopback development URL, without wildcards, credentials or fragments.",
  );
export const platformInput = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().regex(/^[a-z][a-z0-9-]{1,49}$/),
  description: z.string().trim().max(200),
  icon: z.enum(iconKeys),
  launchUrl: safeUrl,
  enabled: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(10000).default(0),
});
export const roleKey = z.string().regex(/^[a-z][a-z0-9_.-]{1,79}$/);
export const uuid = z.string().uuid();
export const grantInput = z.object({
  platformId: uuid,
  roleId: uuid,
  expiresAt: z.iso.datetime().nullable().optional(),
});
export const inviteInput = z.object({
  email: z.email().toLowerCase(),
  name: z.string().trim().min(2).max(100),
  globalRole: z.enum(["EMPLOYEE", "SUPERADMIN"]).default("EMPLOYEE"),
  grants: z.array(grantInput).max(100).default([]),
});
export function safeReturnPath(value: unknown) {
  return typeof value === "string" &&
    /^\/(?!\/)[a-zA-Z0-9/_?=&.-]*$/.test(value)
    ? value
    : "/";
}
