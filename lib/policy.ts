/** Pure policy: browser-supplied roles or decisions never enter this function. */
export type PolicyInput = {
  user: {
    id: string;
    status: string;
    globalRole: string;
    securityVersion: number;
    twoFactorEnabled?: boolean | null;
  } | null;
  platform: { id: string; enabled: boolean } | null;
  clientEnabled?: boolean;
  assignment?: {
    revokedAt: Date | null;
    expiresAt: Date | null;
    role: { key: string; permissions: { permission: { key: string } }[] };
  } | null;
  permission?: string;
  sessionVersion?: number;
  now?: Date;
};
export type Decision = {
  allowed: boolean;
  reason: string;
  role: string | null;
  permissions: string[];
  superadmin: boolean;
  securityVersion: number;
};
export function decideAccess(input: PolicyInput): Decision {
  const { user, platform, assignment, permission } = input;
  const deny = (reason: string): Decision => ({
    allowed: false,
    reason,
    role: null,
    permissions: [],
    superadmin: false,
    securityVersion: user?.securityVersion ?? 0,
  });
  if (!user) return deny("unauthenticated");
  if (user.status !== "ACTIVE") return deny("account_inactive");
  if (!platform?.enabled || input.clientEnabled === false)
    return deny("platform_disabled");
  if (
    input.sessionVersion !== undefined &&
    input.sessionVersion !== user.securityVersion
  )
    return deny("session_revoked");
  if (user.globalRole === "SUPERADMIN") {
    if (!user.twoFactorEnabled) return deny("mfa_required");
    return {
      allowed: true,
      reason: "granted",
      role: "superadmin",
      permissions: ["*"],
      superadmin: true,
      securityVersion: user.securityVersion,
    };
  }
  if (
    !assignment ||
    assignment.revokedAt ||
    (assignment.expiresAt && assignment.expiresAt <= (input.now ?? new Date()))
  )
    return deny("not_assigned");
  const permissions = assignment.role.permissions.map((p) => p.permission.key);
  if (permission && !permissions.includes(permission))
    return deny("permission_denied");
  return {
    allowed: true,
    reason: "granted",
    role: assignment.role.key,
    permissions,
    superadmin: false,
    securityVersion: user.securityVersion,
  };
}
