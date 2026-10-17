import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { jwt, twoFactor } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
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
          data: { securityVersion: { increment: 1 } },
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
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/consent",
      scopes: ["openid", "profile", "email"],
      grantTypes: ["authorization_code"],
      validateRedirectUri: (uri, registered, defaultResult) =>
        defaultResult && registered.includes(uri),
      accessTokenExpiresIn: 900,
      allowDynamicClientRegistration: false,
      storeClientSecret: "hashed",
      clientReference: () => "company",
      clientPrivileges: async ({ user }) => {
        if (!user) return false;
        const current = await db.user.findUnique({ where: { id: user.id } });
        return (
          current?.status === "ACTIVE" &&
          current.globalRole === "SUPERADMIN" &&
          !!current.twoFactorEnabled
        );
      },
      extensions: [
        {
          claims: {
            accessToken: async ({ user, client, sessionId, grantType }) => {
              if (!user)
                throw new APIError("FORBIDDEN", { message: "User required" });
              const registration = await db.platformClient.findUnique({
                where: { oauthClientId: client.clientId },
              });
              const session = sessionId
                ? await db.session.findUnique({ where: { id: sessionId } })
                : null;
              if (grantType && (!session || session.expiresAt <= new Date()))
                throw new APIError("FORBIDDEN", { message: "Session expired" });
              if (!registration)
                throw new APIError("FORBIDDEN", {
                  message: "Unregistered platform",
                });
              const access = await currentAccess(
                user.id,
                registration.platformId,
                {
                  clientEnabled: registration.enabled,
                  sessionVersion: session?.securityVersion,
                },
              );
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
    }),
  ],
});
