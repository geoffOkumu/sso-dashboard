import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { schemaPlugins, userFields } from "../lib/auth-schema";
export const auth = betterAuth({
  database: prismaAdapter({} as never, { provider: "postgresql" }),
  advanced: { database: { generateId: "uuid" } },
  user: { additionalFields: userFields },
  session: {
    additionalFields: {
      securityVersion: { type: "number", defaultValue: 1, input: false },
    },
  },
  rateLimit: { storage: "database" },
  plugins: schemaPlugins,
});
