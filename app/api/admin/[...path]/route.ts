import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/session";
import { adminTransaction, audit, updateUser } from "@/lib/admin";
import { invite } from "@/lib/invitations";
import { handle, HttpError, json, sameOrigin } from "@/lib/http";
import {
  grantInput,
  inviteInput,
  platformInput,
  roleKey,
  clientInput,
  uuid,
} from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { getEnv } from "@/lib/env";
type Context = { params: Promise<{ path: string[] }> };
const clientSelect = {
  id: true,
  oauthClientId: true,
  name: true,
  environment: true,
  enabled: true,
  createdAt: true,
  oauthClient: {
    select: {
      redirectUris: true,
      postLogoutRedirectUris: true,
      scopes: true,
      disabled: true,
    },
  },
} as const;
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    await requireAdmin(request.headers);
    const {
      path: [resource, id],
    } = await context.params;
    const query = new URL(request.url).searchParams;
    const page = Math.max(1, Math.min(10000, Number(query.get("page")) || 1));
    const q = query.get("q")?.slice(0, 100) || "";
    const pagination = { take: 20, skip: (page - 1) * 20 };
    if (resource === "overview") {
      const [
        users,
        activeUsers,
        platforms,
        assignments,
        pendingInvitations,
        events,
      ] = await Promise.all([
        db.user.count(),
        db.user.count({ where: { status: "ACTIVE" } }),
        db.platform.count({ where: { enabled: true } }),
        db.userPlatformAccess.count({
          where: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        }),
        db.invitation.count({
          where: { acceptedAt: null, expiresAt: { gt: new Date() } },
        }),
        db.auditLog.findMany({
          take: 7,
          orderBy: { createdAt: "desc" },
          include: { actor: { select: { name: true, email: true } } },
        }),
      ]);
      return json({
        users,
        activeUsers,
        platforms,
        assignments,
        pendingInvitations,
        events,
      });
    }
    if (resource === "users") {
      if (id)
        return json(
          await db.user.findUniqueOrThrow({
            where: { id: uuid.parse(id) },
            include: {
              assignments: { include: { platform: true, role: true } },
            },
          }),
        );
      const status = z
        .enum(["ACTIVE", "INVITED", "SUSPENDED"])
        .optional()
        .parse(query.get("status") || undefined);
      const where = {
        status,
        assignments: query.get("platform")
          ? {
              some: {
                platformId: uuid.parse(query.get("platform")),
                revokedAt: null,
              },
            }
          : undefined,
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      };
      const [items, total] = await Promise.all([
        db.user.findMany({
          where,
          ...pagination,
          orderBy: { createdAt: "desc" },
          include: { assignments: { include: { platform: true, role: true } } },
        }),
        db.user.count({ where }),
      ]);
      return json({ items, total, page });
    }
    if (resource === "invitations") {
      const items = await db.invitation.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          globalRole: true,
          expiresAt: true,
          acceptedAt: true,
          grants: true,
        },
        ...pagination,
        orderBy: { createdAt: "desc" },
      });
      return json({ items, page, total: await db.invitation.count() });
    }
    if (resource === "platforms") {
      const include = {
        roles: { include: { permissions: { include: { permission: true } } } },
        permissions: true,
        clients: { select: clientSelect },
        _count: { select: { assignments: true } },
      };
      if (id)
        return json(
          await db.platform.findUniqueOrThrow({
            where: { id: uuid.parse(id) },
            include,
          }),
        );
      return json({
        items: await db.platform.findMany({
          where: {
            type: z
              .enum(["SSO", "LINK"])
              .optional()
              .parse(query.get("type") || undefined),
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
          include,
          orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        }),
      });
    }
    if (resource === "audit") {
      const from = query.get("from"),
        to = query.get("to");
      const where = {
        action: query.get("action")
          ? { contains: query.get("action")!, mode: "insensitive" as const }
          : undefined,
        actorId: query.get("actor")
          ? uuid.parse(query.get("actor"))
          : undefined,
        platformId: query.get("platform")
          ? uuid.parse(query.get("platform"))
          : undefined,
        targetId: query.get("target") || undefined,
        createdAt:
          from || to
            ? {
                gte: from ? z.coerce.date().parse(from) : undefined,
                lte: to
                  ? z.coerce.date().parse(`${to}T23:59:59.999Z`)
                  : undefined,
              }
            : undefined,
      };
      const [items, total] = await Promise.all([
        db.auditLog.findMany({
          where,
          ...pagination,
          orderBy: { createdAt: "desc" },
          include: { actor: { select: { name: true, email: true } } },
        }),
        db.auditLog.count({ where }),
      ]);
      return json({ items, total, page });
    }
    if (resource === "settings")
      return json({
        productName: getEnv().PRODUCT_NAME,
        issuer: `${getEnv().BETTER_AUTH_URL}/api/auth`,
        accessCacheSeconds: 60,
        sessionHours: 8,
        invitationHours: 24,
        mfaRequired: true,
      });
    throw new HttpError(404, "Unknown resource");
  });
}
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    sameOrigin(request);
    const { user } = await requireAdmin(request.headers);
    await rateLimit(`admin:${user.id}`, 60);
    const { path } = await context.params;
    if (path.length !== 2 || path[0] !== "platforms")
      throw new HttpError(404, "Unknown operation");
    const id = uuid.parse(path[1]);
    return json(
      await adminTransaction(user.id, async (tx) => {
        const platform = await tx.platform.findUnique({
          where: { id },
          include: { clients: { select: { oauthClientId: true } } },
        });
        if (!platform) throw new HttpError(404, "Platform not found");
        // Remove role references before the platform cascades to its roles.
        await tx.invitationGrant.deleteMany({ where: { platformId: id } });
        await tx.userPlatformAccess.deleteMany({ where: { platformId: id } });
        // PlatformClient cascades do not delete the underlying OAuth clients.
        // Deleting those clients also removes their tokens and consents.
        await tx.oauthClient.deleteMany({
          where: {
            clientId: {
              in: platform.clients.map((client) => client.oauthClientId),
            },
          },
        });
        await tx.platform.delete({ where: { id } });
        await audit(tx, user.id, "platform.deleted", id, id, {
          name: platform.name,
          slug: platform.slug,
          type: platform.type,
        });
        return { success: true };
      }),
    );
  });
}
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    sameOrigin(request);
    const { user } = await requireAdmin(request.headers);
    await rateLimit(`admin:${user.id}`, 60);
    const {
      path: [resource, id, action],
    } = await context.params;
    const body = await request.json();
    if (resource === "invitations" && id === "resend") {
      const { email } = z.object({ email: z.email() }).parse(body);
      const saved = await db.invitation.findUniqueOrThrow({
        where: { email },
        include: { grants: true },
      });
      return json(
        await invite(user.id, {
          email: saved.email,
          name: saved.name,
          globalRole: saved.globalRole as "EMPLOYEE" | "SUPERADMIN",
          grants: saved.grants.map((g) => ({
            platformId: g.platformId,
            roleId: g.roleId,
            expiresAt: g.expiresAt?.toISOString(),
          })),
        }),
      );
    }
    if (resource === "invitations")
      return json(await invite(user.id, inviteInput.parse(body)), 201);
    if (resource === "users" && id)
      return json(
        await updateUser(
          user.id,
          uuid.parse(id),
          z
            .object({
              status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
              globalRole: z.enum(["EMPLOYEE", "SUPERADMIN"]).optional(),
              revokeSessions: z.boolean().optional(),
            })
            .strict()
            .parse(body),
        ),
      );
    if (resource === "access") {
      const input = grantInput
        .extend({ userId: uuid, revoke: z.boolean().default(false) })
        .parse(body);
      return json(
        await adminTransaction(user.id, async (tx) => {
          const role = await tx.platformRole.findUnique({
            where: { id: input.roleId },
          });
          if (!role || role.platformId !== input.platformId)
            throw new HttpError(400, "Role must belong to this platform");
          const assignment = await tx.userPlatformAccess.upsert({
            where: {
              userId_platformId: {
                userId: input.userId,
                platformId: input.platformId,
              },
            },
            create: {
              userId: input.userId,
              platformId: input.platformId,
              roleId: input.roleId,
              expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
              revokedAt: input.revoke ? new Date() : null,
            },
            update: {
              roleId: input.roleId,
              expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
              revokedAt: input.revoke ? new Date() : null,
            },
          });
          await audit(
            tx,
            user.id,
            input.revoke ? "access.revoked" : "access.granted",
            input.userId,
            input.platformId,
            { role: role.key },
          );
          return assignment;
        }),
      );
    }
    if (resource === "platforms") {
      if (!id || !action) {
        return json(
          await adminTransaction(user.id, async (tx) => {
            const existing = id
              ? await tx.platform.findUniqueOrThrow({
                  where: { id: uuid.parse(id) },
                })
              : null;
            const input = platformInput.parse({
              ...body,
              type: body.type ?? existing?.type ?? "SSO",
            });
            if (existing && existing.type !== input.type)
              throw new HttpError(
                400,
                "Platform type cannot be changed. Add a new platform or resource instead.",
              );
            const platform = id
              ? await tx.platform.update({
                  where: { id: uuid.parse(id) },
                  data: input,
                })
              : await tx.platform.create({ data: input });
            await audit(
              tx,
              user.id,
              id ? "platform.updated" : "platform.created",
              platform.id,
              platform.id,
              { enabled: platform.enabled, type: platform.type },
            );
            return platform;
          }),
          id ? 200 : 201,
        );
      }
      uuid.parse(id);
      const target = await db.platform.findUniqueOrThrow({ where: { id } });
      if (target.type === "LINK")
        throw new HttpError(
          400,
          "Directory resources do not use SSO clients, roles or permissions",
        );
      if (action === "permissions") {
        const input = z
          .object({ key: roleKey, description: z.string().max(200) })
          .parse(body);
        return json(
          await adminTransaction(user.id, async (tx) => {
            const permission = await tx.platformPermission.upsert({
              where: { platformId_key: { platformId: id, key: input.key } },
              create: { platformId: id, ...input },
              update: { description: input.description },
            });
            await audit(tx, user.id, "permission.saved", permission.id, id);
            return permission;
          }),
        );
      }
      if (action === "roles") {
        const input = z
          .object({
            key: roleKey,
            name: z.string().min(2).max(80),
            permissionIds: z.array(uuid).max(100),
          })
          .parse(body);
        return json(
          await adminTransaction(user.id, async (tx) => {
            const count = await tx.platformPermission.count({
              where: { platformId: id, id: { in: input.permissionIds } },
            });
            if (count !== new Set(input.permissionIds).size)
              throw new HttpError(
                400,
                "Permissions must belong to this platform",
              );
            const role = await tx.platformRole.upsert({
              where: { platformId_key: { platformId: id, key: input.key } },
              create: { platformId: id, key: input.key, name: input.name },
              update: { name: input.name },
            });
            await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
            await tx.rolePermission.createMany({
              data: [...new Set(input.permissionIds)].map((permissionId) => ({
                roleId: role.id,
                platformId: id,
                permissionId,
              })),
            });
            await audit(tx, user.id, "role.permissions_updated", role.id, id, {
              permissions: input.permissionIds,
            });
            return role;
          }),
        );
      }
      if (action === "clients") {
        const input = clientInput.parse(body);
        await db.platform.findUniqueOrThrow({ where: { id } });
        const client = await auth.api.adminCreateOAuthClient({
          headers: request.headers,
          body: {
            client_name: input.name,
            redirect_uris: input.redirectUris,
            post_logout_redirect_uris: input.postLogoutRedirectUris,
            scope: "openid profile email",
            grant_types: ["authorization_code"],
            response_types: ["code"],
            token_endpoint_auth_method: "client_secret_basic",
            application_type: input.applicationType,
            subject_type: "public",
            require_pkce: true,
            skip_consent: true,
            enable_end_session: true,
          },
        });
        try {
          await adminTransaction(user.id, async (tx) => {
            await tx.platformClient.create({
              data: {
                platformId: id,
                oauthClientId: client.client_id,
                name: input.name,
                environment: input.environment,
              },
            });
            await audit(tx, user.id, "client.created", client.client_id, id);
          });
        } catch (error) {
          await db.oauthClient.update({
            where: { clientId: client.client_id },
            data: { disabled: true },
          });
          throw error;
        }
        return json(
          { clientId: client.client_id, clientSecret: client.client_secret },
          201,
        );
      }
    }
    if (resource === "clients" && id) {
      const client = await db.platformClient.findUniqueOrThrow({
        where: { id: uuid.parse(id) },
      });
      if (action === "settings") {
        const input = clientInput.parse(body);
        await auth.api.adminUpdateOAuthClient({
          headers: request.headers,
          body: {
            client_id: client.oauthClientId,
            update: {
              client_name: input.name,
              application_type: input.applicationType,
              redirect_uris: input.redirectUris,
              post_logout_redirect_uris: input.postLogoutRedirectUris,
            },
          },
        });
        await adminTransaction(user.id, async (tx) => {
          await tx.platformClient.update({
            where: { id },
            data: { name: input.name, environment: input.environment },
          });
          await audit(
            tx,
            user.id,
            "client.configuration_updated",
            client.oauthClientId,
            client.platformId,
          );
        });
        return json({ success: true });
      }
      if (action === "rotate") {
        const result = await auth.api.rotateClientSecret({
          headers: request.headers,
          body: { client_id: client.oauthClientId },
        });
        await db.auditLog.create({
          data: {
            actorId: user.id,
            action: "client.secret_rotated",
            targetId: client.oauthClientId,
            platformId: client.platformId,
          },
        });
        return json({
          clientId: result.client_id,
          clientSecret: result.client_secret,
        });
      }
      const input = z.object({ enabled: z.boolean() }).parse(body);
      return json(
        await adminTransaction(user.id, async (tx) => {
          await tx.platformClient.update({ where: { id }, data: input });
          await tx.oauthClient.update({
            where: { clientId: client.oauthClientId },
            data: { disabled: !input.enabled },
          });
          await audit(
            tx,
            user.id,
            "client.status_updated",
            client.oauthClientId,
            client.platformId,
            input,
          );
          return { success: true };
        }),
      );
    }
    throw new HttpError(404, "Unknown operation");
  });
}
