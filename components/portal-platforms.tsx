"use client";
import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Copy,
  Plus,
  RotateCw,
  Settings2,
  Check,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  api,
  AppIcon,
  Empty,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  PageTitle,
  Panel,
  SearchBox,
  useData,
} from "./portal-shared";
import type { Client, Platform, Role, User } from "./portal-types";
export function Platforms() {
  const [q, setQ] = useState(""),
    [version, setVersion] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState<Platform | "new" | null>(null);
  const { data, error } = useData<{ items: Platform[] }>(
    `/api/admin/platforms?q=${encodeURIComponent(q)}`,
    version,
  );
  const platform = data?.items.find((p) => p.id === selected);
  function done() {
    setVersion((v) => v + 1);
    setEditing(null);
  }
  return (
    <>
      {platform ? (
        <>
          <button
            onClick={() => setSelected(null)}
            className="mb-5 flex items-center gap-2 text-xs text-muted-foreground"
          >
            <ArrowLeft size={13} />
            All platforms
          </button>
          <PlatformDetails
            platform={platform}
            refresh={() => setVersion((v) => v + 1)}
            edit={() => setEditing(platform)}
          />
        </>
      ) : (
        <>
          <PageTitle
            title="Platforms"
            description="Connect and configure your company's internal applications."
          >
            <Button onClick={() => setEditing("new")}>
              <Plus size={14} />
              Add platform
            </Button>
          </PageTitle>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Registered platforms{" "}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {data?.items.length || 0}
              </span>
            </h2>
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder="Search platforms..."
            />
          </div>
          {error ? (
            <ErrorNotice message={error} />
          ) : !data ? (
            <Loading />
          ) : data.items.length ? (
            <Panel>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>PLATFORM</th>
                      <th>STATUS</th>
                      <th>CLIENTS</th>
                      <th>ROLES</th>
                      <th>ASSIGNMENTS</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <button
                            className="flex items-center gap-3 text-left"
                            onClick={() => setSelected(p.id)}
                          >
                            <AppIcon icon={p.icon} small />
                            <div>
                              <p className="text-xs font-medium">{p.name}</p>
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                {p.slug}
                              </p>
                            </div>
                          </button>
                        </td>
                        <td>
                          <Badge tone={p.enabled ? "green" : "neutral"}>
                            {p.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </td>
                        <td className="text-muted-foreground">
                          {p.clients.length}
                        </td>
                        <td className="text-muted-foreground">
                          {p.roles.length}
                        </td>
                        <td className="text-muted-foreground">
                          {p._count?.assignments || 0}
                        </td>
                        <td>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelected(p.id)}
                          >
                            Configure
                            <ArrowUpRight size={13} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : (
            <Panel>
              <Empty
                title="Connect your first platform"
                description="Register an internal tool, define its permissions, and configure an OIDC client."
              >
                <Button
                  className="mt-4"
                  size="sm"
                  onClick={() => setEditing("new")}
                >
                  <Plus size={13} />
                  Add platform
                </Button>
              </Empty>
            </Panel>
          )}
        </>
      )}
      {editing && (
        <Modal
          title={editing === "new" ? "Add platform" : "Platform settings"}
          close={() => setEditing(null)}
        >
          <PlatformForm
            platform={editing === "new" ? undefined : editing}
            done={done}
          />
        </Modal>
      )}
    </>
  );
}
function PlatformForm({
  platform,
  done,
}: {
  platform?: Platform;
  done: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const enabled = f.get("enabled") === "on";
    if (
      platform &&
      platform.enabled !== enabled &&
      !confirm(
        `${enabled ? "Enable" : "Disable"} ${platform.name}? Disabled platforms deny access to everyone, including superadmins.`,
      )
    )
      return;
    setBusy(true);
    try {
      await api(`/api/admin/platforms${platform ? `/${platform.id}` : ""}`, {
        name: f.get("name"),
        slug: f.get("slug"),
        description: f.get("description"),
        icon: f.get("icon"),
        launchUrl: f.get("launchUrl"),
        enabled,
        displayOrder: Number(f.get("displayOrder")),
      });
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save platform");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <ErrorNotice message={error} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Platform name">
          <Input
            name="name"
            required
            minLength={2}
            maxLength={80}
            defaultValue={platform?.name}
            placeholder="Customer CRM"
          />
        </Field>
        <Field label="Slug">
          <Input
            name="slug"
            required
            pattern="[a-z][a-z0-9-]{1,49}"
            defaultValue={platform?.slug}
            placeholder="crm"
          />
        </Field>
      </div>
      <Field label="Description">
        <Input
          name="description"
          maxLength={200}
          defaultValue={platform?.description}
          placeholder="A short description of this tool"
        />
      </Field>
      <Field
        label="Launch URL"
        hint="Use the tool's OIDC login entry point. HTTPS is required outside loopback development."
      >
        <Input
          name="launchUrl"
          type="url"
          required
          defaultValue={platform?.launchUrl}
          placeholder="https://crm.company.com/login"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Icon">
          <select
            name="icon"
            defaultValue={platform?.icon || "layers"}
            className="w-full"
          >
            {[
              "briefcase",
              "chart",
              "layers",
              "code",
              "book",
              "folder",
              "globe",
              "headphones",
            ].map((i) => (
              <option value={i} key={i}>
                {i}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Display order">
          <Input
            name="displayOrder"
            type="number"
            min={0}
            max={10000}
            defaultValue={platform?.displayOrder || 0}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          name="enabled"
          type="checkbox"
          defaultChecked={platform?.enabled ?? true}
        />
        Platform enabled
      </label>
      <Button className="w-full" disabled={busy}>
        {busy ? "Saving…" : "Save platform"}
      </Button>
    </form>
  );
}
function PlatformDetails({
  platform,
  refresh,
  edit,
}: {
  platform: Platform;
  refresh: () => void;
  edit: () => void;
}) {
  const [tab, setTab] = useState("clients"),
    [modal, setModal] = useState<"client" | "permission" | "role" | null>(null),
    [role, setRole] = useState<Role | undefined>(),
    [editingClient, setEditingClient] = useState<Client | null>(null),
    [secret, setSecret] = useState<{
      clientId: string;
      clientSecret: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const settings = useData<{ issuer: string }>("/api/admin/settings");
  async function clientAction(client: Client, action: "rotate" | "toggle") {
    if (
      !confirm(
        action === "rotate"
          ? `Rotate ${client.name}'s secret? Update the tool immediately with the new secret.`
          : `${client.enabled ? "Disable" : "Enable"} ${client.name}?`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await api<{ clientId: string; clientSecret: string }>(
        `/api/admin/clients/${client.id}${action === "rotate" ? "/rotate" : ""}`,
        action === "rotate" ? {} : { enabled: !client.enabled },
      );
      if (action === "rotate") setSecret(result);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Client operation failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle title={platform.name} description={platform.description}>
        <Button variant="outline" onClick={edit}>
          <Settings2 size={14} />
          Platform settings
        </Button>
      </PageTitle>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={platform.enabled ? "green" : "neutral"}>
          {platform.enabled ? "Enabled" : "Disabled"}
        </Badge>
        <code className="text-[11px] text-muted-foreground">
          {platform.slug}
        </code>
        <a
          href={platform.launchUrl}
          className="flex items-center gap-1 text-xs text-primary"
        >
          Launch application
          <ArrowUpRight size={12} />
        </a>
      </div>
      {error && <ErrorNotice message={error} />}
      <div className="mb-6 flex gap-5 overflow-x-auto border-b border-border">
        {[
          ["clients", "OIDC clients"],
          ["roles", "Roles & permissions"],
          ["setup", "Integration guide"],
          ["users", "Assigned users"],
        ].map(([value, label]) => (
          <button
            onClick={() => setTab(value)}
            key={value}
            className={`whitespace-nowrap border-b-2 pb-3 text-xs ${tab === value ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "clients" && (
        <Panel>
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h2 className="text-sm font-semibold">Client registrations</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Separate credentials for each application environment.
              </p>
            </div>
            <Button size="sm" onClick={() => setModal("client")}>
              <Plus size={13} />
              Register client
            </Button>
          </div>
          {platform.clients.length ? (
            platform.clients.map((client) => (
              <div
                key={client.id}
                className="border-b border-border p-5 last:border-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold">{client.name}</h3>
                      <Badge>{client.environment}</Badge>
                      <Badge tone={client.enabled ? "green" : "neutral"}>
                        {client.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <CopyLine label="Client ID" value={client.oauthClientId} />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingClient(client)}
                    >
                      Edit
                    </Button>
                    <Button
                      disabled={busy}
                      size="sm"
                      variant="outline"
                      onClick={() => void clientAction(client, "rotate")}
                    >
                      <RotateCw size={12} />
                      Rotate secret
                    </Button>
                    <Button
                      disabled={busy}
                      size="sm"
                      variant="ghost"
                      onClick={() => void clientAction(client, "toggle")}
                    >
                      {client.enabled ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-[10px] text-muted-foreground">
                  Redirect URIs
                </p>
                {client.oauthClient.redirectUris.map((uri) => (
                  <p
                    key={uri}
                    className="mt-1 break-all font-mono text-[11px] text-slate-500"
                  >
                    {uri}
                  </p>
                ))}
              </div>
            ))
          ) : (
            <Empty
              title="No clients registered"
              description="Register a confidential OIDC client to connect this tool. A launch URL alone does not enable SSO."
            />
          )}
        </Panel>
      )}
      {tab === "roles" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel>
            <div className="flex items-center justify-between border-b border-border p-5">
              <h2 className="text-sm font-semibold">Platform roles</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRole(undefined);
                  setModal("role");
                }}
              >
                <Plus size={13} />
                Add role
              </Button>
            </div>
            {platform.roles.length ? (
              platform.roles.map((role) => (
                <div
                  key={role.id}
                  className="border-b border-border p-5 last:border-0"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold">{role.name}</h3>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {role.key}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRole(role);
                        setModal("role");
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {role.permissions.length ? (
                      role.permissions.map((p) => (
                        <Badge key={p.permission.id}>{p.permission.key}</Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No permissions
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <Empty
                title="No roles yet"
                description="Define permissions, then group them into roles."
              />
            )}
          </Panel>
          <Panel>
            <div className="flex items-center justify-between border-b border-border p-5">
              <h2 className="text-sm font-semibold">Permission keys</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModal("permission")}
              >
                <Plus size={13} />
                Add permission
              </Button>
            </div>
            {platform.permissions.length ? (
              platform.permissions.map((permission) => (
                <div
                  key={permission.id}
                  className="border-b border-border p-5 last:border-0"
                >
                  <code className="text-xs text-primary">{permission.key}</code>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {permission.description}
                  </p>
                </div>
              ))
            ) : (
              <Empty
                title="No permissions yet"
                description="Use action-based keys like contacts.read or reports.export."
              />
            )}
          </Panel>
        </div>
      )}
      {tab === "setup" && (
        <IntegrationGuide
          platform={platform}
          issuer={settings.data?.issuer || ""}
        />
      )}
      {tab === "users" && <PlatformUsers platformId={platform.id} />}
      {modal && (
        <Modal
          title={
            modal === "client"
              ? "Register OIDC client"
              : modal === "permission"
                ? "Add permission"
                : role
                  ? "Edit role"
                  : "Add role"
          }
          close={() => setModal(null)}
        >
          {modal === "client" ? (
            <ClientForm
              platform={platform}
              done={(value) => {
                setSecret(value);
                setModal(null);
                refresh();
              }}
            />
          ) : (
            <RolePermissionForm
              platform={platform}
              mode={modal}
              role={role}
              done={() => {
                setModal(null);
                refresh();
              }}
            />
          )}
        </Modal>
      )}
      {editingClient && (
        <Modal title="Edit OIDC client" close={() => setEditingClient(null)}>
          <ClientForm
            platform={platform}
            existingClient={editingClient}
            done={() => {
              setEditingClient(null);
              refresh();
            }}
          />
        </Modal>
      )}
      {secret && (
        <Modal
          title="Save your client credentials"
          close={() => setSecret(null)}
        >
          <div className="space-y-4">
            <div className="rounded-md bg-amber-50 p-3 text-xs leading-6 text-amber-900">
              This secret is shown once. Save it in the connected tool’s server
              environment or secret manager.
            </div>
            <CopyLine label="Client ID" value={secret.clientId} />
            <CopyLine label="Client secret" value={secret.clientSecret} />
            <p className="text-[11px] leading-6 text-muted-foreground">
              Never place these credentials in browser code or public
              environment variables.
            </p>
            <Button className="w-full" onClick={() => setSecret(null)}>
              <Check size={14} />
              I’ve saved the credentials
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3">
      <p className="mb-1 text-[10px] text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all text-[11px] text-slate-600">
          {value}
        </code>
        <Button
          size="icon"
          variant="ghost"
          title={`Copy ${label}`}
          aria-label={`Copy ${label}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </Button>
      </div>
    </div>
  );
}
function ClientForm({
  platform,
  existingClient,
  done,
}: {
  platform: Platform;
  existingClient?: Client;
  done: (value: { clientId: string; clientSecret: string } | null) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const result = await api<{ clientId: string; clientSecret: string }>(
        existingClient
          ? `/api/admin/clients/${existingClient.id}/settings`
          : `/api/admin/platforms/${platform.id}/clients`,
        {
          name: f.get("name"),
          environment: f.get("environment"),
          redirectUris: String(f.get("redirectUris"))
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          postLogoutRedirectUris: String(f.get("postLogoutRedirectUris"))
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      );
      done(existingClient ? null : result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <ErrorNotice message={error} />}
      <Field label="Client name">
        <Input
          name="name"
          required
          minLength={2}
          defaultValue={existingClient?.name}
          placeholder={`${platform.name} development`}
        />
      </Field>
      <Field label="Environment">
        <select
          name="environment"
          defaultValue={existingClient?.environment || "development"}
          className="w-full"
        >
          <option value="development">Development</option>
          <option value="staging">Staging</option>
          <option value="production">Production</option>
        </select>
      </Field>
      <Field
        label="Exact callback URLs"
        hint="One per line. No wildcards. These must match your application's OIDC callback route."
      >
        <textarea
          name="redirectUris"
          defaultValue={existingClient?.oauthClient.redirectUris.join("\n")}
          required
          rows={3}
          placeholder="http://localhost:3001/callback"
        />
      </Field>
      <Field label="Post-logout URLs (optional)">
        <textarea
          name="postLogoutRedirectUris"
          defaultValue={existingClient?.oauthClient.postLogoutRedirectUris?.join(
            "\n",
          )}
          rows={2}
          placeholder="http://localhost:3001/"
        />
      </Field>
      <div className="rounded-md bg-muted p-3 text-[11px] leading-6 text-muted-foreground">
        Confidential client · Authorization Code + PKCE S256
        <br />
        Scopes: openid, profile, email · No refresh tokens
      </div>
      <Button disabled={busy} className="w-full">
        {busy
          ? "Saving…"
          : existingClient
            ? "Save client settings"
            : "Create client & show secret"}
      </Button>
    </form>
  );
}
function RolePermissionForm({
  platform,
  mode,
  role,
  done,
}: {
  platform: Platform;
  mode: "role" | "permission";
  role?: Role;
  done: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (
      mode === "role" &&
      !confirm(
        "Save this role's permissions? Every user assigned this role will be affected within 60 seconds.",
      )
    )
      return;
    setBusy(true);
    try {
      await api(
        `/api/admin/platforms/${platform.id}/${mode === "role" ? "roles" : "permissions"}`,
        mode === "role"
          ? {
              key: f.get("key"),
              name: f.get("name"),
              permissionIds: f.getAll("permissionIds"),
            }
          : { key: f.get("key"), description: f.get("description") },
      );
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <ErrorNotice message={error} />}
      <Field label="Key">
        <Input
          name="key"
          required
          pattern="[a-z][a-z0-9_.-]{1,79}"
          defaultValue={role?.key}
          readOnly={!!role}
          placeholder={mode === "role" ? "editor" : "contacts.write"}
        />
      </Field>
      <Field label={mode === "role" ? "Display name" : "Description"}>
        <Input
          name={mode === "role" ? "name" : "description"}
          required
          defaultValue={role?.name}
        />
      </Field>
      {mode === "role" && (
        <fieldset className="space-y-3 rounded-lg border border-border p-4">
          <legend className="px-1 text-xs">Role permissions</legend>
          {platform.permissions.map((permission) => (
            <label
              key={permission.id}
              className="flex items-center gap-2 text-xs"
            >
              <input
                type="checkbox"
                name="permissionIds"
                value={permission.id}
                defaultChecked={role?.permissions.some(
                  (p) => p.permission.id === permission.id,
                )}
              />
              <code>{permission.key}</code>
            </label>
          ))}
          {!platform.permissions.length && (
            <p className="text-xs text-muted-foreground">
              Add permissions to this platform first.
            </p>
          )}
        </fieldset>
      )}
      <Button disabled={busy} className="w-full">
        Save {mode}
      </Button>
    </form>
  );
}
function IntegrationGuide({
  platform,
  issuer,
}: {
  platform: Platform;
  issuer: string;
}) {
  const example = `OIDC_ISSUER=${issuer}\nOIDC_CLIENT_ID=${platform.clients[0]?.oauthClientId || "<client-id>"}\nOIDC_CLIENT_SECRET=<server-side-secret>\nAPP_URL=${new URL(platform.launchUrl).origin}`;
  const checklist =
    "1. Register exact callback and post-logout URLs.\n2. Store client credentials on the server.\n3. Use Authorization Code Flow with PKCE S256, state and nonce.\n4. Validate issuer, signature, audience and expiry.\n5. Store tokens on the server in your own app session.\n6. Check /api/access/check for every protected server operation.\n7. Bypass the cache for sensitive actions.\n8. Test revocation, permissions, outages and global logout.";
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel className="p-6">
        <h2 className="text-sm font-semibold">Connection details</h2>
        <CopyLine label="Issuer" value={issuer} />
        <CopyLine
          label="Discovery URL"
          value={`${issuer}/.well-known/openid-configuration`}
        />
        <CopyLine
          label="Access decision endpoint"
          value={`${issuer.replace(/\/api\/auth$/, "")}/api/access/check`}
        />
        <h3 className="mb-3 mt-6 text-xs font-medium">
          Server environment example
        </h3>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-[11px] leading-6 text-slate-300">
          {example}
        </pre>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => navigator.clipboard.writeText(example)}
        >
          <Copy size={12} />
          Copy environment example
        </Button>
      </Panel>
      <Panel className="p-6">
        <h2 className="mb-4 text-sm font-semibold">Integration checklist</h2>
        <div className="space-y-4">
          {checklist.split("\n").map((line) => (
            <p key={line} className="text-xs leading-6 text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-5"
          onClick={() => navigator.clipboard.writeText(checklist)}
        >
          <Copy size={12} />
          Copy checklist
        </Button>
        <p className="mt-5 text-[11px] leading-6 text-muted-foreground">
          See docs/INTEGRATION.md in the repository for the Next.js example and
          framework-neutral guidance.
        </p>
      </Panel>
    </div>
  );
}
function PlatformUsers({ platformId }: { platformId: string }) {
  const { data, error } = useData<{ items: User[]; total: number }>(
    `/api/admin/users?platform=${platformId}`,
  );
  return (
    <Panel>
      {error ? (
        <ErrorNotice message={error} />
      ) : !data ? (
        <Loading />
      ) : data.items.length ? (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>NAME</th>
                <th>EMAIL</th>
                <th>ROLE</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td className="text-muted-foreground">{user.email}</td>
                  <td>
                    <Badge>
                      {
                        user.assignments.find(
                          (a) => a.platformId === platformId,
                        )?.role.name
                      }
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-4 text-[11px] text-muted-foreground">
            Showing up to 20 explicit assignments. Superadmins have implicit
            access to every enabled platform.
          </p>
        </div>
      ) : (
        <Empty
          title="No explicit assignments"
          description="Assign people from the Access page. Superadmins have implicit access."
        />
      )}
    </Panel>
  );
}
