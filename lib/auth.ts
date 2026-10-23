import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { jwt, twoFactor } from "better-auth/plugins";
import {
  oauthProvider,
  getOAuthProviderApi,
  type OAuthOptions,
} from "@better-auth/oauth-provider";
import { requireOAuthSession } from "./oauth-session";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { db } from "./db";
import { getEnv } from "./env";
import { sendMail } from "./mail";
import { userFields } from "./auth-schema";
import { currentAccess } from "./access";
const env = getEnv();
const oauthOptions = {
  loginPage: "/sign-in",
  consentPage: "/consent",
  postLogin: {
    page: "/change-password",
    consentReferenceId: () => undefined,
    shouldRedirect: async ({ user }: { user: { id: string } }) => {
      const current = await db.user.findUnique({ where: { id: user.id } });
      return !!current?.passwordChangeRequired;
    },
  },
  scopes: ["openid", "profile", "email", "offline_access"],
  grantTypes: ["authorization_code", "refresh_token"],
  validateRedirectUri: (uri, registered, defaultResult) =>
    defaultResult && registered.includes(uri),
  accessTokenExpiresIn: 900,
  refreshTokenExpiresIn: 60 * 60 * 8,
  refreshTokenReuseInterval: 0,
  allowDynamicClientRegistration: false,
  storeClientSecret: "hashed",
  clientReference: () => "company",
  clientPrivileges: async ({ user }) => {
    if (!user) return false;
    const current = await db.user.findUnique({ where: { id: user.id } });
    return (
      current?.status === "ACTIVE" &&
      !current.passwordChangeRequired &&
      current.globalRole === "SUPERADMIN" &&
      !!current.twoFactorEnabled
    );
  },
  extensions: [
    {
      claims: {
        // ID-token claims run before opaque tokens are minted too.
        idToken: async ({ user, client, sessionId }) => {
          if (!user)
            throw new APIError("FORBIDDEN", { message: "User required" });
          await requireOAuthSession(user.id, client.clientId, sessionId);
          return {};
        },
        accessToken: async ({ user, client, sessionId, grantType }) => {
          if (!user)
            throw new APIError("FORBIDDEN", { message: "User required" });
          // Opaque introspection omits sessionId in this provider version.
          // The access endpoint checks the authoritative sid from introspection.
          const registration = await db.platformClient.findUnique({
            where: { oauthClientId: client.clientId },
          });
          if (!registration)
            throw new APIError("FORBIDDEN", {
              message: "Unregistered platform",
            });
          const access = grantType
            ? (await requireOAuthSession(user.id, client.clientId, sessionId))
                .access
            : await currentAccess(user.id, registration.platformId, {
                clientEnabled: registration.enabled && !client.disabled,
              });
          if (!access.allowed)
            throw new APIError("FORBIDDEN", {
              message: "Platform access denied",
            });
          return {
            security_version: access.securityVersion,
            platform_id: registration.platformId,
            central_session_id: sessionId,
          };
        },
      },
    },
  ],
} satisfies OAuthOptions;
export const auth = betterAuth({
  appName: env.PRODUCT_NAME,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
  disabledPaths: [
    "/token",
    "/sign-up/email",
    "/delete-user",
    "/change-email",
    "/oauth2/register",
    "/oauth2/create-client",
    "/oauth2/update-client",
    "/oauth2/delete-client",
    "/oauth2/get-client",
    "/oauth2/get-clients",
    "/oauth2/client/rotate-secret",
  ],
  advanced: {
    database: { generateId: "uuid" },
    useSecureCookies: process.env.NODE_ENV === "production",
    cookiePrefix: "company-access",
    ipAddress: {
      ipAddressHeaders: env.TRUSTED_IP_HEADER ? [env.TRUSTED_IP_HEADER] : [],
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 1800,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail(
        user.email,
        "Reset your password",
        `Reset your ${env.PRODUCT_NAME} password using this link within 30 minutes:\n${url}\nIf you did not request this, ignore this email.`,
      );
    },
    onPasswordReset: async ({ user }) => {
      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            securityVersion: { increment: 1 },
            passwordChangeRequired: false,
          },
        });
        await tx.session.deleteMany({ where: { userId: user.id } });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: "account.password_reset",
            targetId: user.id,
          },
        });
      });
    },
  },
  user: { additionalFields: userFields },
  session: {
    expiresIn: 60 * 60 * 8,
    updateAge: 60 * 30,
    cookieCache: { enabled: false },
    additionalFields: {
      securityVersion: { type: "number", defaultValue: 1, input: false },
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/request-password-reset": { window: 60, max: 5 },
      "/two-factor/*": { window: 60, max: 10 },
    },
  },
  databaseHooks: {
    user: {
      update: {
        after: async (user, ctx) => {
          if (
            ctx?.path.startsWith("/two-factor/") &&
            ["/two-factor/verify-totp", "/two-factor/disable"].includes(
              ctx.path,
            )
          ) {
            await db.$transaction(async (tx) => {
              await tx.user.update({
                where: { id: user.id },
                data: { securityVersion: { increment: 1 } },
              });
              await tx.session.deleteMany({ where: { userId: user.id } });
              await tx.auditLog.create({
                data: {
                  actorId: user.id,
                  action: user.twoFactorEnabled
                    ? "mfa.enabled"
                    : "mfa.disabled",
                  targetId: user.id,
                },
              });
            });
          }
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const user = await db.user.findUnique({
            where: { id: session.userId },
          });
          if (!user || user.status !== "ACTIVE")
            throw new APIError("FORBIDDEN", {
              message: "Account is not active",
            });
          return {
            data: { ...session, securityVersion: user.securityVersion },
          };
        },
        after: async (session) => {
          await db.auditLog.create({
            data: {
              actorId: session.userId,
              action: "session.created",
              targetId: session.userId,
            },
          });
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // A temporary-password session may only complete onboarding or sign out.
      // Authorization is allowed through to the provider's post-login redirect;
      // token issuance and access checks still enforce the authoritative policy.
      if (
        ![
          "/get-session",
          "/sign-in/email",
          "/sign-out",
          "/request-password-reset",
          "/reset-password",
          "/oauth2/authorize",
          "/oauth2/continue",
        ].includes(ctx.path) &&
        !ctx.path.startsWith("/reset-password/")
      ) {
        const session = await getSessionFromCtx(ctx);
        if (session) {
          const user = await db.user.findUnique({
            where: { id: session.user.id },
          });
          if (user?.passwordChangeRequired)
            throw new APIError("FORBIDDEN", {
              code: "PASSWORD_CHANGE_REQUIRED",
              message: "Change your temporary password before continuing",
            });
        }
      }
      if (
        ctx.path === "/oauth2/token" &&
        ctx.body?.grant_type === "refresh_token"
      ) {
        // Enforce policy before rotation, even for opaque tokens and downscoped
        // refreshes without openid (which do not invoke the claim extensions).
        const provider = getOAuthProviderApi(
          ctx,
          oauthOptions,
          "refresh_token",
        );
        const client = await provider.authenticateClient();
        const value = ctx.body.refresh_token;
        const token =
          typeof value === "string" && value.length <= 16000
            ? await db.oauthRefreshToken.findUnique({
                where: {
                  token: await provider.hashToken(value, "refresh_token"),
                },
              })
            : null;
        if (
          !token ||
          token.clientId !== client.clientId ||
          token.expiresAt <= new Date()
        )
          throw new APIError("BAD_REQUEST", {
            error: "invalid_grant",
            error_description: "Session or access expired",
          });
        await requireOAuthSession(
          token.userId,
          client.clientId,
          token.sessionId,
        );
        // The provider still validates scopes and handles rotation/replay.
      }
      if (ctx.path === "/two-factor/disable") {
        const session = await getSessionFromCtx(ctx);
        if (session?.user.globalRole === "SUPERADMIN")
          throw new APIError("FORBIDDEN", {
            message: "Superadmins must keep MFA enabled",
          });
      }
      if (ctx.path === "/oauth2/authorize") {
        const session = await getSessionFromCtx(ctx);
        if (session) {
          const user = await db.user.findUnique({
            where: { id: session.user.id },
          });
          if (
            user?.passwordChangeRequired &&
            user.status === "ACTIVE" &&
            user.securityVersion === session.session.securityVersion
          )
            return;
          const clientId = String(ctx.query?.client_id || "");
          const client = await db.platformClient.findUnique({
            where: { oauthClientId: clientId },
          });
          if (
            !client ||
            !(
              await currentAccess(session.user.id, client.platformId, {
                clientEnabled: client.enabled,
                sessionVersion: Number(session.session.securityVersion),
              })
            ).allowed
          )
            throw new APIError("FORBIDDEN", {
              message: "You do not have access to this application",
            });
        }
      }
    }),
  },
  plugins: [
    jwt({
      jwks: {
        rotationInterval: 60 * 60 * 24 * 30,
        gracePeriod: 60 * 60 * 24 * 7,
      },
      jwt: { issuer: `${env.BETTER_AUTH_URL}/api/auth` },
    }),
    twoFactor({ issuer: env.PRODUCT_NAME }),
    oauthProvider(oauthOptions),
  ],
});
