import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().startsWith("postgres"),
  BETTER_AUTH_URL: z
    .url()
    .default("http://localhost:3000")
    .refine((value) => {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password
      );
    }, "Use an origin without a path, query, or credentials")
    .transform((value) => new URL(value).origin),
  BETTER_AUTH_SECRET: z.string().min(32),
  PRODUCT_NAME: z.string().min(1).max(60).default("Permit Kit"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default("Permit Kit <access@company.test>"),
  TRUSTED_IP_HEADER: z.string().optional(),
});
export function getEnv() {
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      `Invalid environment: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}. See .env.example.`,
    );
  if (
    process.env.NODE_ENV === "production" &&
    !result.data.BETTER_AUTH_URL.startsWith("https://")
  )
    throw new Error("Production BETTER_AUTH_URL must use HTTPS");
  return result.data;
}
export const productName = process.env.PRODUCT_NAME || "Permit Kit";
