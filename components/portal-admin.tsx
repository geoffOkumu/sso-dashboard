"use client";
import { useState, type FormEvent } from "react";
import {
  Plus,
  Mail,
  ArrowUpRight,
  KeyRound,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  api,
  AppIcon,
  DateText,
  Empty,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  PageTitle,
  Pagination,
  Panel,
  SearchBox,
  useData,
} from "./portal-shared";
import type { Audit, Platform, User } from "./portal-types";
function UserIdentity({ user }: { user: User }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-[10px] font-semibold text-primary">
        {user.name
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()}
      </span>
      <div>
        <p className="text-xs font-medium">{user.name}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">{user.email}</p>
      </div>
    </div>
  );
}
function Status({ value }: { value: string }) {
  return (
    <Badge
      tone={
        value === "ACTIVE" ? "green" : value === "INVITED" ? "amber" : "neutral"
      }
    >
      <span
        className={`h-1 w-1 rounded-full ${value === "ACTIVE" ? "bg-emerald-500" : value === "INVITED" ? "bg-amber-500" : "bg-slate-400"}`}
      />
      {value[0] + value.slice(1).toLowerCase()}
    </Badge>
  );
}
export function UserManagement() {
  const [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [version, setVersion] = useState(0),
    [inviting, setInviting] = useState(false),
    [selected, setSelected] = useState<User | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const { data, error: loadError } = useData<{ items: User[]; total: number }>(
    `/api/admin/users?q=${encodeURIComponent(q)}&status=${status}&page=${page}`,
    version,
  );
  const platforms = useData<{ items: Platform[] }>(
    "/api/admin/platforms?type=SSO",
    version,
  );
  function done() {
    setVersion((v) => v + 1);
    setSelected(null);
    setInviting(false);
  }
  async function resend(user: User) {
    try {
      await api("/api/admin/invitations/resend", { email: user.email });
      setNotice(
        "A new invitation was sent. The previous link is no longer valid.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send invitation");
    }
  }
  return (
    <>
      <PageTitle
        title="Users"
        description="Manage your team and their company accounts."
      >
        <Button onClick={() => setInviting(true)}>
          <Plus size={14} />
          Add user
        </Button>
      </PageTitle>
      {(error || loadError) && (
        <ErrorNotice message={error || loadError} />
      )}{" "}
      {notice && (
        <p role="status" className="mb-4 text-xs text-emerald-700">
          {notice}
        </p>
      )}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex gap-1">
            {[
              ["", "All users"],
              ["ACTIVE", "Active"],
              ["INVITED", "Invited"],
              ["SUSPENDED", "Suspended"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => {
                  setStatus(value);
                  setPage(1);
                }}
                className={`rounded-md px-3 py-2 text-xs ${status === value ? "bg-muted font-medium text-slate-800" : "text-muted-foreground hover:bg-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Search name or email..."
          />
        </div>
        {!data ? (
          <Loading />
        ) : data.items.length ? (
          <>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>TEAM MEMBER</th>
                    <th>GLOBAL ROLE</th>
                    <th>STATUS</th>
                    <th>APPLICATIONS</th>
                    <th>MFA</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <button
                          className="text-left"
                          onClick={() => setSelected(user)}
                        >
                          <UserIdentity user={user} />
                        </button>
                      </td>
                      <td>
                        <Badge
                          tone={
                            user.globalRole === "SUPERADMIN"
                              ? "blue"
                              : "neutral"
                          }
                        >
                          {user.globalRole === "SUPERADMIN"
                            ? "Superadmin"
                            : "Employee"}
                        </Badge>
                      </td>
                      <td>
                        <Status value={user.status} />
                      </td>
                      <td className="text-muted-foreground">
                        {user.globalRole === "SUPERADMIN"
                          ? "All platforms"
                          : user.assignments.filter(
                              (a) =>
                                !a.revokedAt &&
                                (!a.expiresAt ||
                                  new Date(a.expiresAt) > new Date()),
                            ).length}
                      </td>
                      <td>
                        {user.twoFactorEnabled ? (
                          <ShieldCheck size={15} className="text-emerald-600" />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex justify-end gap-2">
                          {user.status === "INVITED" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Resend invitation"
                              aria-label={`Resend invitation to ${user.name}`}
                              onClick={() => void resend(user)}
                            >
                              <Mail size={14} />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Manage ${user.name}`}
                            title="Manage user"
                            onClick={() => setSelected(user)}
                          >
                            <ArrowUpRight size={15} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={data.total} setPage={setPage} />
          </>
        ) : (
          <Empty
            title="No users found"
            description="Invite your first teammate or try a different search."
          />
        )}
      </Panel>
      {inviting && (
        <Modal title="Add a teammate" close={() => setInviting(false)}>
          <InviteForm platforms={platforms.data?.items || []} done={done} />
        </Modal>
      )}
      {selected && (
        <Modal title="Manage team member" close={() => setSelected(null)}>
          <UserDetail
            user={selected}
            platforms={platforms.data?.items || []}
            done={done}
          />
        </Modal>
      )}
    </>
  );
}
function InviteForm({
  platforms,
  done,
}: {
  platforms: Platform[];
  done: () => void;
}) {
  const [error, setError] = useState(""),
    [method, setMethod] = useState("invitation"),
    [busy, setBusy] = useState(false),
    [platformId, setPlatformId] = useState(""),
    [roleId, setRoleId] = useState(""),
    [grants, setGrants] = useState<{ platformId: string; roleId: string }[]>(
      [],
    );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api(
        method === "password" ? "/api/admin/users" : "/api/admin/invitations",
        {
          name: f.get("name"),
          email: f.get("email"),
          globalRole: f.get("globalRole"),
          grants,
          ...(method === "password"
            ? {
                password: f.get("password"),
                passwordChangeRequired:
                  f.get("passwordChangeRequired") === "on",
              }
            : {}),
        },
      );
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add user");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="Account setup">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="w-full"
        >
          <option value="invitation">Send email invitation</option>
          <option value="password">Set a password</option>
        </select>
      </Field>
      <p className="text-xs leading-6 text-muted-foreground">
        {method === "invitation"
          ? "We’ll email a secure invitation. The link expires in 24 hours."
          : "The account will be active immediately. Share the password securely with your teammate; no invitation email is sent."}
      </p>
      {error && <ErrorNotice message={error} />}
      <Field label="Full name">
        <Input
          name="name"
          required
          minLength={2}
          maxLength={100}
          placeholder="Alex Morgan"
        />
      </Field>
      <Field label="Work email">
        <Input
          name="email"
          type="email"
          required
          placeholder="alex@company.com"
        />
      </Field>
      <Field label="Global role">
        <select name="globalRole" className="w-full">
          <option value="EMPLOYEE">Employee</option>
          <option value="SUPERADMIN">Superadmin — full company access</option>
        </select>
      </Field>
      {method === "password" && (
        <>
          <Field label="Password" hint="Use 12–128 characters.">
            <Input
              aria-label="Password"
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
          <label className="flex items-start gap-2 text-xs leading-5">
            <input
              type="checkbox"
              name="passwordChangeRequired"
              className="mt-1"
            />
            One-time password — require a password change on first sign-in
          </label>
        </>
      )}
      <div className="border-t border-border pt-4">
        <h3 className="mb-3 text-xs font-medium">Initial platform access</h3>
        {grants.map((grant) => (
          <div
            key={grant.platformId}
            className="mb-2 flex items-center justify-between rounded-md bg-muted p-2 text-xs"
          >
            <span>
              {platforms.find((p) => p.id === grant.platformId)?.name} ·{" "}
              {
                platforms
                  .find((p) => p.id === grant.platformId)
                  ?.roles.find((r) => r.id === grant.roleId)?.name
              }
            </span>
            <button
              type="button"
              aria-label="Remove initial grant"
              onClick={() =>
                setGrants(
                  grants.filter((g) => g.platformId !== grant.platformId),
                )
              }
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Initial platform"
            value={platformId}
            onChange={(e) => {
              setPlatformId(e.target.value);
              setRoleId("");
            }}
          >
            <option value="">Select platform</option>
            {platforms
              .filter((p) => !grants.some((g) => g.platformId === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <select
            aria-label="Initial platform role"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            <option value="">Role</option>
            {platforms
              .find((p) => p.id === platformId)
              ?.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!platformId || !roleId}
            onClick={() => {
              setGrants([...grants, { platformId, roleId }]);
              setPlatformId("");
              setRoleId("");
            }}
          >
            Add
          </Button>
        </div>
      </div>
      <Button disabled={busy} className="w-full">
        {method === "invitation" ? <Mail size={14} /> : <KeyRound size={14} />}
        {method === "invitation"
          ? busy
            ? "Sending invitation…"
            : "Send invitation"
          : busy
            ? "Creating user…"
            : "Create user"}
      </Button>
    </form>
  );
}
function UserDetail({
  user,
  platforms,
  done,
}: {
  user: User;
  platforms: Platform[];
  done: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [assignment, setAssignment] = useState(false);
  async function change(body: unknown, message: string) {
    if (!confirm(message)) return;
    setBusy(true);
    try {
      await api(`/api/admin/users/${user.id}`, body);
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Change failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <UserIdentity user={user} />
      {error && <ErrorNotice message={error} />}
      <div className="flex gap-2">
        <Status value={user.status} />
        <Badge tone="blue">{user.globalRole}</Badge>
      </div>
      <div className="border-t border-border pt-4">
        <h3 className="mb-3 text-xs font-semibold">Platform assignments</h3>
        {user.globalRole === "SUPERADMIN" ? (
          <p className="text-xs leading-6 text-muted-foreground">
            Full access to every enabled platform, including future platforms.
            MFA is required.
          </p>
        ) : (
          user.assignments
            .filter((a) => !a.revokedAt)
            .map((a) => (
              <div key={a.id} className="mb-3 flex items-center gap-3 text-xs">
                <AppIcon icon={a.platform.icon} small />
                <span className="flex-1">{a.platform.name}</span>
                <Badge>{a.role.name}</Badge>
                {a.expiresAt && (
                  <span className="text-[10px] text-muted-foreground">
                    Until <DateText value={a.expiresAt} />
                  </span>
                )}
              </div>
            ))
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setAssignment(!assignment)}
        >
          <KeyRound size={13} />
          Edit access
        </Button>
        {assignment && (
          <div className="mt-4">
            <AssignmentForm user={user} platforms={platforms} done={done} />
          </div>
        )}
      </div>
      <div className="space-y-3 border-t border-border pt-4">
        <h3 className="text-xs font-semibold">Account controls</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            size="sm"
            variant="outline"
            onClick={() =>
              void change(
                { revokeSessions: true },
                `Revoke all sessions for ${user.name}? Existing tool sessions will stop within 60 seconds.`,
              )
            }
          >
            Revoke all sessions
          </Button>
          {user.status !== "INVITED" && (
            <Button
              disabled={busy}
              size="sm"
              variant="outline"
              onClick={() =>
                void change(
                  {
                    status:
                      user.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED",
                  },
                  `${user.status === "SUSPENDED" ? "Reactivate" : "Suspend"} ${user.name}?`,
                )
              }
            >
              {user.status === "SUSPENDED" ? "Reactivate" : "Suspend account"}
            </Button>
          )}
          <Button
            disabled={busy}
            size="sm"
            variant="outline"
            onClick={() =>
              void change(
                {
                  globalRole:
                    user.globalRole === "SUPERADMIN"
                      ? "EMPLOYEE"
                      : "SUPERADMIN",
                },
                `Change ${user.name} to ${user.globalRole === "SUPERADMIN" ? "employee" : "superadmin with full company-wide privileges"}? This revokes their existing sessions.`,
              )
            }
          >
            {user.globalRole === "SUPERADMIN"
              ? "Demote to employee"
              : "Promote to superadmin"}
          </Button>
        </div>
      </div>
    </div>
  );
}
export function AssignmentForm({
  user,
  platforms,
  done,
}: {
  user: User;
  platforms: Platform[];
  done: () => void;
}) {
  const [platformId, setPlatformId] = useState(platforms[0]?.id || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const platform = platforms.find((p) => p.id === platformId),
    existing = user.assignments?.find((a) => a.platformId === platformId);
  async function submit(e: FormEvent<HTMLFormElement>, revoke = false) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (
      !confirm(
        revoke
          ? `Remove ${user.name}'s access to ${platform?.name}?`
          : `Save ${user.name}'s access to ${platform?.name}? Changes take effect within 60 seconds.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/access", {
        userId: user.id,
        platformId,
        roleId: f.get("roleId"),
        expiresAt: f.get("expiresAt")
          ? new Date(String(f.get("expiresAt"))).toISOString()
          : null,
        revoke,
      });
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update access");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="space-y-4" onSubmit={submit}>
      {error && <ErrorNotice message={error} />}
      <Field label="Platform">
        <select
          className="w-full"
          value={platformId}
          onChange={(e) => setPlatformId(e.target.value)}
        >
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.enabled ? "" : " (disabled)"}
            </option>
          ))}
        </select>
      </Field>
      <div key={platformId} className="space-y-4">
        <Field label="Platform role">
          <select
            className="w-full"
            name="roleId"
            required
            defaultValue={existing?.roleId || ""}
          >
            <option value="" disabled>
              Select role
            </option>
            {platform?.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Expires at (optional)"
          hint="Times use your browser's timezone. Leave blank for ongoing access."
        >
          <Input name="expiresAt" type="datetime-local" />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button disabled={busy || !platform?.roles.length} size="sm">
          Save access
        </Button>
        {existing && !existing.revokedAt && (
          <Button
            disabled={busy}
            size="sm"
            variant="outline"
            type="button"
            onClick={(e) => {
              const form = e.currentTarget.form;
              if (form)
                void submit(
                  {
                    preventDefault() {},
                    currentTarget: form,
                  } as FormEvent<HTMLFormElement>,
                  true,
                );
            }}
          >
            Remove access
          </Button>
        )}
      </div>
    </form>
  );
}
export function AccessManagement() {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [version, setVersion] = useState(0),
    [selected, setSelected] = useState<User | null>(null);
  const users = useData<{ items: User[]; total: number }>(
      `/api/admin/users?q=${encodeURIComponent(q)}&page=${page}`,
      version,
    ),
    platforms = useData<{ items: Platform[] }>(
      "/api/admin/platforms?type=SSO",
      version,
    );
  return (
    <>
      <PageTitle
        title="Access management"
        description="The right tools, for the right people. Review and manage platform access."
      />
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <h2 className="text-sm font-semibold">Access matrix</h2>
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Find a team member..."
          />
        </div>
        {users.error || platforms.error ? (
          <ErrorNotice message={users.error || platforms.error} />
        ) : !users.data || !platforms.data ? (
          <Loading />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>TEAM MEMBER</th>
                    {platforms.data.items.map((p) => (
                      <th key={p.id}>{p.name.toUpperCase()}</th>
                    ))}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.items.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <UserIdentity user={user} />
                      </td>
                      {platforms.data!.items.map((platform) => {
                        const assignment = user.assignments.find(
                          (a) =>
                            a.platformId === platform.id &&
                            !a.revokedAt &&
                            (!a.expiresAt ||
                              new Date(a.expiresAt) > new Date()),
                        );
                        return (
                          <td key={platform.id}>
                            {user.status !== "ACTIVE" || !platform.enabled ? (
                              <span className="text-slate-300">—</span>
                            ) : user.globalRole === "SUPERADMIN" ? (
                              <Badge tone="blue">Full access</Badge>
                            ) : assignment ? (
                              <Badge tone="neutral">
                                {assignment.role.name}
                              </Badge>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelected(user)}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!users.data.items.length && (
              <Empty title="No matching team members" />
            )}
            <Pagination
              page={page}
              total={users.data.total}
              setPage={setPage}
            />
          </>
        )}
      </Panel>
      <p className="mt-4 text-[11px] leading-6 text-muted-foreground">
        Superadmins have full access to enabled platforms after enrolling in
        MFA. Inactive accounts are denied. Changes affect existing sessions
        within 60 seconds.
      </p>
      {selected && (
        <Modal
          title={`Access for ${selected.name}`}
          close={() => setSelected(null)}
        >
          <AssignmentForm
            user={selected}
            platforms={platforms.data?.items || []}
            done={() => {
              setSelected(null);
              setVersion((v) => v + 1);
            }}
          />
        </Modal>
      )}
    </>
  );
}
export function AuditLogs() {
  const [filters, setFilters] = useState({
      action: "",
      actor: "",
      platform: "",
      target: "",
      from: "",
      to: "",
    }),
    [page, setPage] = useState(1),
    [advanced, setAdvanced] = useState(false);
  const { data, error } = useData<{ items: Audit[]; total: number }>(
    `/api/admin/audit?${new URLSearchParams({ ...filters, page: String(page) })}`,
  );
  const set = (key: string, value: string) => {
    setFilters({ ...filters, [key]: value });
    setPage(1);
  };
  return (
    <>
      <PageTitle
        title="Audit logs"
        description="A traceable record of changes across your workspace."
      />
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <SearchBox
            value={filters.action}
            onChange={(v) => set("action", v)}
            placeholder="Filter by action..."
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdvanced(!advanced)}
          >
            <SlidersHorizontal size={13} />
            Filters
          </Button>
        </div>
        {advanced && (
          <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-3">
            {[
              ["actor", "Actor user ID"],
              ["platform", "Platform ID"],
              ["target", "Target ID"],
              ["from", "From date"],
              ["to", "Through date"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <Input
                  type={key === "from" || key === "to" ? "date" : "text"}
                  value={filters[key as keyof typeof filters]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </Field>
            ))}
          </div>
        )}
        {error ? (
          <ErrorNotice message={error} />
        ) : !data ? (
          <Loading />
        ) : data.items.length ? (
          <>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>EVENT</th>
                    <th>ACTOR</th>
                    <th>TARGET</th>
                    <th>TIME</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <span className="font-mono text-[11px] text-slate-600">
                          {event.action}
                        </span>
                        {event.details && (
                          <details className="mt-2 text-[10px] text-muted-foreground">
                            <summary className="cursor-pointer">
                              Details
                            </summary>
                            <pre className="mt-2 max-w-xs overflow-auto">
                              {JSON.stringify(event.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </td>
                      <td>
                        <p>{event.actor?.name || "System"}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {event.actor?.email}
                        </p>
                      </td>
                      <td>
                        <code
                          className="text-[10px] text-muted-foreground"
                          title={event.targetId || ""}
                        >
                          {event.targetId?.slice(0, 18) || "—"}
                          {event.targetId && event.targetId.length > 18
                            ? "…"
                            : ""}
                        </code>
                      </td>
                      <td>
                        <div className="whitespace-nowrap text-[10px] text-muted-foreground">
                          <DateText value={event.createdAt} />
                          <p className="mt-1">
                            {new Date(event.createdAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={data.total} setPage={setPage} />
          </>
        ) : (
          <Empty
            title="No events found"
            description="Try changing the filters. Administrative changes are recorded automatically."
          />
        )}
      </Panel>
    </>
  );
}
