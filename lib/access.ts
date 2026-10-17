import { db } from "./db";
import { decideAccess } from "./policy";
export async function currentAccess(
  userId: string,
  platformId: string,
  options: {
    clientEnabled?: boolean;
    permission?: string;
    sessionVersion?: number;
  } = {},
) {
  const [user, platform, assignment] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.platform.findUnique({ where: { id: platformId } }),
    db.userPlatformAccess.findUnique({
      where: { userId_platformId: { userId, platformId } },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    }),
  ]);
  return decideAccess({ user, platform, assignment, ...options });
}
