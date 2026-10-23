import {
  AccessDenied,
  type AccessDecision,
} from "../../access-client/src/index";

export type ToolSession = {
  id: string;
  issuer: string;
  subject: string;
  name: string;
  accessToken: string;
  refreshToken: string | null;
  securityVersion: number;
  accessTokenExpires: number;
  expires: number;
};

export function sessionExpiry(
  decision: Pick<AccessDecision, "expiresAt" | "sessionExpiresAt">,
  now = Date.now(),
) {
  if (
    !Number.isFinite(decision.sessionExpiresAt) ||
    decision.sessionExpiresAt <= now ||
    !Number.isFinite(decision.expiresAt) ||
    decision.expiresAt <= now ||
    decision.expiresAt > decision.sessionExpiresAt
  )
    throw new AccessDenied("invalid_session_expiry");
  return decision.sessionExpiresAt;
}

/** Single-instance example. Shared stores need a distributed lock per session. */
export function createSessionRenewer(options: {
  issuer: string;
  load: (id: string) => ToolSession | undefined;
  save: (previous: ToolSession, next: ToolSession) => boolean;
  remove: (id: string) => void;
  refresh: (session: ToolSession) => Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }>;
  validate: (session: ToolSession) => Promise<AccessDecision>;
  now?: () => number;
}) {
  const pending = new Map<string, Promise<ToolSession>>();
  const now = options.now ?? Date.now;
  return async function getSession(id: string): Promise<ToolSession> {
    // Join before reading so callers cannot use a token being rotated.
    const inflight = pending.get(id);
    if (inflight) return inflight;
    const session = options.load(id);
    if (
      !session ||
      session.issuer !== options.issuer ||
      session.expires <= now()
    )
      throw new AccessDenied("session_expired");
    if (session.accessTokenExpires > now() + 60_000) return session;
    if (!session.refreshToken) {
      if (session.accessTokenExpires > now()) return session;
      throw new AccessDenied("session_expired");
    }
    const renewal = (async () => {
      try {
        const started = now();
        const token = await options.refresh(session);
        if (
          !token.accessToken ||
          !token.refreshToken ||
          !Number.isFinite(token.expiresIn) ||
          token.expiresIn <= 0
        )
          throw new AccessDenied("invalid_token_response");
        const next = {
          ...session,
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
        };
        // Always bypass the authorization cache and retain the original identity
        // and generation. A renewal must never switch users or revive a session.
        const decision = await options.validate(next);
        if (
          !decision.allowed ||
          decision.subject !== session.subject ||
          decision.issuer !== session.issuer ||
          decision.securityVersion !== session.securityVersion
        )
          throw new AccessDenied("session_or_access_denied");
        next.expires = sessionExpiry(decision, now());
        next.accessTokenExpires = Math.min(
          decision.expiresAt,
          started + token.expiresIn * 1000,
        );
        if (next.accessTokenExpires <= now() || !options.save(session, next))
          throw new AccessDenied("session_expired");
        return next;
      } catch (error) {
        // A lost response may already have rotated the refresh token. Never
        // retry the old token, and never recreate a session removed by logout.
        options.remove(id);
        if (error instanceof AccessDenied) throw error;
        throw new AccessDenied("authorization_unavailable");
      }
    })();
    pending.set(id, renewal);
    try {
      return await renewal;
    } finally {
      pending.delete(id);
    }
  };
}
