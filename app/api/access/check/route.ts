import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentAccess } from "@/lib/access";
import { handle, HttpError, json } from "@/lib/http";
import { rateLimit, requestAddress } from "@/lib/rate-limit";
import { getEnv } from "@/lib/env";
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimit(`access:${requestAddress(request)}`, 600);
    const { token } = z
      .object({ token: z.string().min(10).max(16000) })
      .strict()
      .parse(await request.json());
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Basic "))
      throw new HttpError(401, "Client credentials required");
    const decoded = Buffer.from(header.slice(6), "base64").toString(),
      separator = decoded.indexOf(":");
    if (separator < 1) throw new HttpError(401, "Invalid client credentials");
    const clientId = decodeURIComponent(decoded.slice(0, separator));
    // The provider reads Basic credentials from the actual Request, not only
    // endpoint-call headers. Dispatch through its handler to retain that context.
    const introspection = await auth.handler(
      new Request(`${getEnv().BETTER_AUTH_URL}/api/auth/oauth2/introspect`, {
        method: "POST",
        headers: {
          Authorization: header,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ token }),
      }),
    );
    if (!introspection.ok)
      throw new HttpError(
        introspection.status >= 500 ? 503 : 401,
        "Token introspection rejected",
      );
    const tokenInfo = (await introspection.json()) as Record<string, unknown>;
    if (
      !tokenInfo.active ||
      tokenInfo.client_id !== clientId ||
      typeof tokenInfo.sub !== "string"
    )
      throw new HttpError(401, "Inactive token");
    const registration = await db.platformClient.findUnique({
      where: { oauthClientId: clientId },
      include: { oauthClient: { select: { disabled: true } } },
    });
    const sessionId = tokenInfo.central_session_id ?? tokenInfo.sid;
    if (!registration || typeof sessionId !== "string")
      throw new HttpError(
        403,
        "Unregistered client or missing session binding",
      );
    const session = await db.session.findUnique({ where: { id: sessionId } });
    if (
      !session ||
      session.userId !== tokenInfo.sub ||
      session.expiresAt <= new Date()
    )
      throw new HttpError(401, "Session revoked");
    const decision = await currentAccess(
      tokenInfo.sub,
      registration.platformId,
      {
        clientEnabled:
          registration.enabled && !registration.oauthClient.disabled,
        sessionVersion: session.securityVersion,
      },
    );
    if (
      typeof tokenInfo.security_version === "number" &&
      tokenInfo.security_version !== decision.securityVersion
    )
      throw new HttpError(401, "Session revoked");
    if (!decision.allowed) return json(decision, 403);
    return json({
      ...decision,
      subject: tokenInfo.sub,
      issuer: `${getEnv().BETTER_AUTH_URL}/api/auth`,
      platformId: registration.platformId,
      sessionExpiresAt: session.expiresAt.getTime(),
      expiresAt: Math.min(
        Number(tokenInfo.exp) * 1000,
        session.expiresAt.getTime(),
      ),
    });
  });
}
