"use client";
import { useState, type FormEvent } from "react";
import { Copy, Monitor, ShieldCheck, Smartphone } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  api,
  DateText,
  ErrorNotice,
  Field,
  PageTitle,
  Panel,
} from "./portal-shared";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import type { Me, User } from "./portal-types";
export function Account({
  user,
  refresh,
}: {
  user: Pick<User, "name" | "email" | "globalRole">;
  refresh: () => void;
}) {
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>, password = false) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const result = password
        ? await authClient.changePassword({
            currentPassword: String(f.get("current")),
            newPassword: String(f.get("password")),
            revokeOtherSessions: true,
          })
        : await authClient.updateUser({ name: String(f.get("name")) });
      if (result.error) throw new Error(result.error.message);
      setSuccess(
        password
          ? "Password changed. Other central sessions have been revoked."
          : "Profile updated.",
      );
      refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Your account"
        description="Manage the details of your company identity."
      />
      {error && <ErrorNotice message={error} />}{" "}
      {success && (
        <p role="status" className="mb-5 text-xs text-emerald-700">
          {success}
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel className="p-6">
          <h2 className="mb-1 text-sm font-semibold">Profile details</h2>
          <p className="mb-6 text-xs text-muted-foreground">
            How you appear across your workspace.
          </p>
          <form onSubmit={(e) => submit(e)} className="space-y-5">
            <Field label="Full name">
              <Input
                name="name"
                defaultValue={user.name}
                required
                minLength={2}
                maxLength={100}
              />
            </Field>
            <Field
              label="Work email"
              hint="Your verified email is managed by your administrator."
            >
              <Input value={user.email} readOnly />
            </Field>
            <Field label="Global role">
              <div>
                <Badge tone="blue">
                  {user.globalRole === "SUPERADMIN" ? "Superadmin" : "Employee"}
                </Badge>
              </div>
            </Field>
            <Button disabled={busy}>Save changes</Button>
          </form>
        </Panel>
        <Panel className="p-6">
          <h2 className="mb-1 text-sm font-semibold">Change password</h2>
          <p className="mb-6 text-xs text-muted-foreground">
            Use a unique password with at least 12 characters.
          </p>
          <form onSubmit={(e) => submit(e, true)} className="space-y-5">
            <Field label="Current password">
              <Input
                name="current"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="New password">
              <Input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </Field>
            <Button disabled={busy} variant="outline">
              Update password
            </Button>
          </form>
        </Panel>
      </div>
    </>
  );
}
export function Security({ me, refresh }: { me: Me; refresh: () => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [setup, setSetup] = useState<{
      totpURI: string;
      backupCodes: string[];
    } | null>(null),
    [success, setSuccess] = useState("");
  async function mfa(
    e: FormEvent<HTMLFormElement>,
    action: "enable" | "verify" | "disable",
  ) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      if (action === "enable") {
        const result = await authClient.twoFactor.enable({
          password: String(f.get("password")),
        });
        if (result.error) throw new Error(result.error.message);
        if (result.data.method !== "totp")
          throw new Error("TOTP setup unavailable");
        setSetup(result.data);
      } else if (action === "verify") {
        const result = await authClient.twoFactor.verifyTotp({
          code: String(f.get("code")),
        });
        if (result.error) throw new Error(result.error.message);
        setSuccess(
          "MFA is enabled. Save your recovery codes before leaving this page.",
        );
        refresh();
      } else {
        const result = await authClient.twoFactor.disable({
          password: String(f.get("password")),
        });
        if (result.error) throw new Error(result.error.message);
        setSetup(null);
        refresh();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "MFA update failed");
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id?: string) {
    setBusy(true);
    setError("");
    try {
      await api(
        id ? "/api/me/revoke-session" : "/api/me/logout-everywhere",
        id ? { id } : {},
      );
      if (!id || id === me.currentSessionId) window.location.assign("/sign-in");
      else refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Revocation failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Security & sessions"
        description="Keep your account protected and control where you're signed in."
      />
      {error && <ErrorNotice message={error} />}{" "}
      {success && (
        <div
          role="status"
          className="mb-5 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-xs text-emerald-800"
        >
          {success}
        </div>
      )}
      <Panel className="mb-6 p-6">
        <div className="mb-5 flex items-start gap-4">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-primary">
            <Smartphone size={20} />
          </span>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold">
                Multi-factor authentication
              </h2>
              <Badge tone={me.user.twoFactorEnabled ? "green" : "amber"}>
                {me.user.twoFactorEnabled ? "Enabled" : "Not configured"}
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              Add another layer of protection with an authenticator app.
              {me.user.globalRole === "SUPERADMIN" &&
                " Required for all superadmins."}
            </p>
          </div>
        </div>
        {!me.user.twoFactorEnabled && !setup && (
          <form
            onSubmit={(e) => mfa(e, "enable")}
            className="flex max-w-lg flex-wrap items-end gap-3"
          >
            <Field label="Confirm your password">
              <Input
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </Field>
            <Button disabled={busy}>
              <ShieldCheck size={14} />
              Set up MFA
            </Button>
          </form>
        )}
        {setup && (
          <div className="space-y-5 rounded-lg bg-muted p-5">
            <div>
              <p className="mb-2 text-xs font-medium">
                1. Add this account to your authenticator
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                Use this setup key for a time-based account, or copy the full
                authenticator URI.
              </p>
              <div className="flex items-center gap-2">
                <code className="break-all rounded bg-white p-3 text-xs">
                  {new URL(setup.totpURI).searchParams.get("secret")}
                </code>
                <Button
                  size="icon"
                  variant="outline"
                  title="Copy authenticator URI"
                  aria-label="Copy authenticator URI"
                  onClick={() => navigator.clipboard.writeText(setup.totpURI)}
                >
                  <Copy size={14} />
                </Button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium">
                2. Save these single-use recovery codes
              </p>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Keep them in your password manager. They are only shown here.
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-white p-3 font-mono text-xs">
                {setup.backupCodes.map((code) => (
                  <span key={code}>{code}</span>
                ))}
              </div>
            </div>
            {!me.user.twoFactorEnabled && (
              <form
                onSubmit={(e) => mfa(e, "verify")}
                className="flex flex-wrap items-end gap-3"
              >
                <Field label="3. Verify a six-digit code">
                  <Input
                    name="code"
                    required
                    pattern="[0-9]{6}"
                    autoComplete="one-time-code"
                    placeholder="000000"
                  />
                </Field>
                <Button disabled={busy}>Verify and enable</Button>
              </form>
            )}
          </div>
        )}
        {me.user.twoFactorEnabled && me.user.globalRole !== "SUPERADMIN" && (
          <details className="mt-5">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Disable MFA
            </summary>
            <form
              onSubmit={(e) => mfa(e, "disable")}
              className="mt-3 flex max-w-lg gap-3"
            >
              <Input
                type="password"
                name="password"
                required
                aria-label="Confirm password to disable MFA"
                placeholder="Confirm password"
              />
              <Button disabled={busy} variant="outline">
                Disable
              </Button>
            </form>
          </details>
        )}
      </Panel>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 className="text-sm font-semibold">Active sessions</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Connected tools enforce revocation within 60 seconds. Sensitive
              writes recheck immediately.
            </p>
          </div>
          <Button
            disabled={busy}
            variant="outline"
            size="sm"
            onClick={() => {
              if (
                confirm(
                  "Sign out everywhere? This revokes all central and connected tool sessions.",
                )
              )
                void revoke();
            }}
          >
            Sign out everywhere
          </Button>
        </div>
        {me.sessions.map((session) => (
          <div
            className="flex flex-wrap items-center gap-4 border-b border-border p-5 last:border-0"
            key={session.id}
          >
            <Monitor size={22} className="text-slate-400" />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <p
                  className="max-w-[430px] truncate text-xs font-medium"
                  title={session.userAgent || "Unknown browser"}
                >
                  {session.userAgent?.includes("Chrome")
                    ? "Chrome"
                    : session.userAgent?.includes("Safari")
                      ? "Safari"
                      : session.userAgent?.includes("Firefox")
                        ? "Firefox"
                        : "Browser session"}
                </p>
                {session.id === me.currentSessionId && (
                  <Badge tone="green">This session</Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {session.ipAddress || "IP not recorded"} · Started{" "}
                <DateText value={session.createdAt} />
              </p>
            </div>
            <Button
              disabled={busy}
              variant="ghost"
              size="sm"
              onClick={() => {
                if (
                  confirm(
                    "Revoke this session and its connected tool sessions?",
                  )
                )
                  void revoke(session.id);
              }}
            >
              Revoke
            </Button>
          </div>
        ))}
      </Panel>
    </>
  );
}
