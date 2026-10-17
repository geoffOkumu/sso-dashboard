import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { currentAccess } from "@/lib/access";
import { handle, json } from "@/lib/http";
export async function GET(request: Request) {
  return handle(async () => {
    const { user, session } = await requireUser(request.headers);
    const platforms = await db.platform.findMany({
      where: { enabled: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    });
    const apps = (
      await Promise.all(
        platforms.map(async (platform) => ({
          ...platform,
          access: await currentAccess(user.id, platform.id),
        })),
      )
    ).filter((p) => p.access.allowed);
    const sessions = await db.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return json({ user, apps, sessions, currentSessionId: session.id });
  });
}
