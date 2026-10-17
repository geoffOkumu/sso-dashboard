"use client";
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
export const authClient = createAuthClient({
  // Navigation is handled once by the forms, including MFA/OIDC continuation.
  disableDefaultFetchPlugins: true,
  plugins: [twoFactorClient(), oauthProviderClient()],
});
