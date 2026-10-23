import { createHash } from "node:crypto";
export type AccessDecision = {
  allowed: boolean;
  reason: string;
  subject: string;
  issuer: string;
  platformId: string;
  role: string | null;
  permissions: string[];
  superadmin: boolean;
  securityVersion: number;
  expiresAt: number;
  sessionExpiresAt: number;
};
export class AccessDenied extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "AccessDenied";
  }
}
export function createAccessClient(options: {
  issuer: string;
  clientId: string;
  clientSecret: string;
  endpoint: string;
  cacheMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}) {
  const cache = new Map<string, { until: number; value: AccessDecision }>();
  const now = options.now ?? Date.now;
  const ttl = Math.max(0, Math.min(options.cacheMs ?? 30_000, 60_000));
  return {
    async check(
      session: {
        accessToken: string;
        subject: string;
        securityVersion: number;
        sessionId: string;
      },
      permission?: string,
      sensitive = false,
    ): Promise<AccessDecision> {
      const key = createHash("sha256")
        .update(
          JSON.stringify([
            options.issuer,
            options.clientId,
            session.subject,
            session.sessionId,
            session.securityVersion,
            session.accessToken,
          ]),
        )
        .digest("hex");
      let value =
        !sensitive && cache.get(key)?.until && cache.get(key)!.until > now()
          ? cache.get(key)!.value
          : undefined;
      if (!value) {
        cache.delete(key);
        const started = now();
        let response: Response;
        try {
          response = await (options.fetch ?? fetch)(options.endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Basic ${Buffer.from(`${encodeURIComponent(options.clientId)}:${encodeURIComponent(options.clientSecret)}`).toString("base64")}`,
            },
            body: JSON.stringify({ token: session.accessToken }),
            cache: "no-store",
            signal: AbortSignal.timeout(5000),
          });
        } catch {
          throw new AccessDenied("authorization_unavailable");
        }
        if (!response.ok)
          throw new AccessDenied(
            response.status === 503
              ? "authorization_unavailable"
              : "session_or_access_denied",
          );
        const data = (await response.json()) as AccessDecision;
        if (
          !data.allowed ||
          data.subject !== session.subject ||
          data.issuer !== options.issuer ||
          data.securityVersion !== session.securityVersion ||
          !Array.isArray(data.permissions) ||
          !Number.isFinite(data.expiresAt) ||
          data.expiresAt <= now()
        )
          throw new AccessDenied("session_or_access_denied");
        value = data;
        if (cache.size > 1000) cache.clear();
        cache.set(key, {
          value,
          until: Math.min(started + ttl, data.expiresAt),
        });
      }
      if (
        permission &&
        !value.permissions.includes("*") &&
        !value.permissions.includes(permission)
      )
        throw new AccessDenied("permission_denied");
      return value;
    },
    clear() {
      cache.clear();
    },
  };
}
