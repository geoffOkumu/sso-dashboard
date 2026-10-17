export type Permission = { id: string; key: string; description: string };
export type Role = {
  id: string;
  key: string;
  name: string;
  permissions: { permission: Permission }[];
};
export type Client = {
  id: string;
  oauthClientId: string;
  name: string;
  environment: string;
  enabled: boolean;
  oauthClient: {
    redirectUris: string[];
    postLogoutRedirectUris: string[];
    scopes: string[];
  };
};
export type Platform = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  enabled: boolean;
  launchUrl: string;
  displayOrder: number;
  roles: Role[];
  permissions: Permission[];
  clients: Client[];
  _count?: { assignments: number };
  access?: { role: string; permissions: string[] };
};
export type Assignment = {
  id: string;
  platformId: string;
  roleId: string;
  expiresAt: string | null;
  revokedAt: string | null;
  platform: Platform;
  role: Role;
};
export type User = {
  id: string;
  name: string;
  email: string;
  globalRole: string;
  status: string;
  twoFactorEnabled: boolean;
  createdAt: string;
  assignments: Assignment[];
};
export type Audit = {
  id: string;
  action: string;
  actor: { name: string; email: string } | null;
  targetId: string | null;
  platformId: string | null;
  createdAt: string;
  details: Record<string, unknown> | null;
};
export type Session = {
  id: string;
  createdAt: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
};
export type Me = {
  user: User;
  apps: Platform[];
  sessions: Session[];
  currentSessionId: string;
};
