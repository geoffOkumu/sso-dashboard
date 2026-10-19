"use client";
import { useState, type FormEvent } from "react";
import { Monitor } from "lucide-react";
import { MfaSettings } from "./mfa-settings";
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
    [busy, setBusy] = useState(false);
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
      {error && <ErrorNotice message={error} />}
      <MfaSettings me={me} refresh={refresh} />
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
