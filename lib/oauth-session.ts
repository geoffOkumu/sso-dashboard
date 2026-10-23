import { APIError } from "better-auth/api";
import { db } from "./db";
import { currentAccess } from "./access";

/** Refresh grants never outlive or replace their original central session. */
export async function requireOAuthSession(
  userId: string,
  clientId: string,
  sessionId: string | null | undefined,
) {
  const [session, registration] = await Promise.all([
    sessionId ? db.session.findUnique({ where: { id: sessionId } }) : null,
    db.platformClient.findUnique({
      where: { oauthClientId: clientId },
      include: { oauthClient: { select: { disabled: true } } },
    }),
  ]);
  const deny = () =>
    new APIError("BAD_REQUEST", {
      error: "invalid_grant",
      error_description: "Session or access expired",
    });
  if (
    !session ||
    session.userId !== userId ||
    session.expiresAt <= new Date() ||
    !registration
  )
    throw deny();
  const access = await currentAccess(userId, registration.platformId, {
    clientEnabled: registration.enabled && !registration.oauthClient.disabled,
    sessionVersion: session.securityVersion,
  });
  if (!access.allowed) throw deny();
  return { session, registration, access };
}
