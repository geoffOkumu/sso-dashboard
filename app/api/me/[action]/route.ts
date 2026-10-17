import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { handle, HttpError, json, sameOrigin } from "@/lib/http";
import { audit, revokeSessions } from "@/lib/admin";
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  return handle(async () => {
    sameOrigin(request);
    const { user } = await requireUser(request.headers);
    const { action } = await context.params;
    if (action === "logout-everywhere")
      await db.$transaction(async (tx) => {
        await revokeSessions(tx, user.id);
        await audit(tx, user.id, "session.global_logout", user.id);
      });
    else if (action === "revoke-session") {
      const { id } = z
        .object({ id: z.string().uuid() })
        .parse(await request.json());
      await db.$transaction(async (tx) => {
        await tx.session.deleteMany({ where: { id, userId: user.id } });
        await audit(tx, user.id, "session.revoked", id);
      });
    } else throw new HttpError(404, "Unknown action");
    return json({ success: true });
  });
}
