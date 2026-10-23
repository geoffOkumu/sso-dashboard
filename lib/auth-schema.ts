import { jwt, twoFactor } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
export const userFields = {
  globalRole: {
    type: "string" as const,
    defaultValue: "EMPLOYEE",
    input: false,
  },
  status: { type: "string" as const, defaultValue: "INVITED", input: false },
  securityVersion: { type: "number" as const, defaultValue: 1, input: false },
  passwordChangeRequired: {
    type: "boolean" as const,
    defaultValue: false,
    input: false,
  },
};
export const schemaPlugins = [
  jwt(),
  twoFactor(),
  oauthProvider({ loginPage: "/sign-in", consentPage: "/consent" }),
];
