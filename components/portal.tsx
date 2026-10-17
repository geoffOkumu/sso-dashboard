"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutGrid,
  UserRound,
  ShieldCheck,
  LayoutDashboard,
  Users,
  Layers3,
  KeyRound,
  ScrollText,
  Settings,
  ChevronDown,
  ArrowUpRight,
  LogOut,
  Menu,
  X,
  CircleHelp,
  Plus,
  Activity,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { authClient } from "@/lib/auth-client";
import {
  AppIcon,
  DateText,
  Empty,
  ErrorNotice,
  Loading,
  PageTitle,
  Panel,
  SearchBox,
  useData,
} from "./portal-shared";
import type { Audit, Me, User } from "./portal-types";
import { UserManagement, AccessManagement, AuditLogs } from "./portal-admin";
import { Platforms } from "./portal-platforms";
import { Account, Security } from "./portal-account";
const employeeNav = [
  { href: "/", name: "My apps", icon: LayoutGrid },
  { href: "/account", name: "Account", icon: UserRound },
  { href: "/security", name: "Security & sessions", icon: ShieldCheck },
];
const adminNav = [
  { href: "/overview", name: "Overview", icon: LayoutDashboard },
  { href: "/users", name: "Users", icon: Users },
  { href: "/platforms", name: "Platforms", icon: Layers3 },
  { href: "/access", name: "Access", icon: KeyRound },
  { href: "/audit", name: "Audit logs", icon: ScrollText },
  { href: "/settings", name: "Settings", icon: Settings },
];
export function Portal({
  initialUser,
  productName,
}: {
  initialUser: Pick<
    User,
    "id" | "name" | "email" | "globalRole" | "twoFactorEnabled"
  >;
  productName: string;
}) {
  const path = usePathname(),
    [mobile, setMobile] = useState(false),
    [version, setVersion] = useState(0),
    [logoutError, setLogoutError] = useState("");
  const { data: me, error } = useData<Me>("/api/me", version);
  const user = me?.user || initialUser,
    admin = user.globalRole === "SUPERADMIN";
  const active =
    [...employeeNav, ...adminNav].find((item) => item.href === path)?.name ||
    "Workspace";
  const refresh = () => setVersion((v) => v + 1);
  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-white focus:p-3"
      >
        Skip to content
      </a>
      {mobile && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[238px] flex-col border-r border-border bg-white transition-transform lg:translate-x-0 ${mobile ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-[84px] shrink-0 items-center px-6">
          <Brand name={productName} />
          <button
            aria-label="Close navigation"
            className="ml-auto lg:hidden"
            onClick={() => setMobile(false)}
          >
            <X size={17} />
          </button>
        </div>
        <div className="mx-4 mb-7 flex items-center gap-2.5 rounded-lg border border-border bg-[#fafbfc] p-3">
          <div className="grid h-8 w-8 place-items-center rounded-md border border-border bg-white text-xs font-bold">
            CO
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold">Company workspace</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Internal applications
            </p>
          </div>
          <ChevronDown size={13} className="text-muted-foreground" />
        </div>
        <nav
          aria-label="Main navigation"
          className="flex-1 overflow-y-auto px-3"
        >
          <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[1.4px] text-muted-foreground">
            Workspace
          </p>
          {employeeNav.map((item) => (
            <Link
              onClick={() => setMobile(false)}
              key={item.href}
              href={item.href}
              aria-current={path === item.href ? "page" : undefined}
              className={`mb-1 flex items-center gap-3 rounded-md px-3 py-2.5 text-xs ${path === item.href ? "bg-[#edf1ff] font-medium text-primary" : "text-slate-500 hover:bg-muted"}`}
            >
              <item.icon size={17} strokeWidth={1.7} />
              {item.name}
              {path === item.href && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </Link>
          ))}
          {admin && (
            <>
              <p className="mb-2 mt-8 px-3 text-[9px] font-semibold uppercase tracking-[1.4px] text-muted-foreground">
                Administration
              </p>
              {adminNav.map((item) => (
                <Link
                  onClick={() => setMobile(false)}
                  key={item.href}
                  href={item.href}
                  aria-current={path === item.href ? "page" : undefined}
                  className={`mb-1 flex items-center gap-3 rounded-md px-3 py-2.5 text-xs ${path === item.href ? "bg-[#edf1ff] font-medium text-primary" : "text-slate-500 hover:bg-muted"}`}
                >
                  <item.icon size={17} strokeWidth={1.7} />
                  {item.name}
                </Link>
              ))}
            </>
          )}
        </nav>
        <div className="sidebar-note m-4 rounded-lg border border-blue-100 bg-[#f8faff] p-3.5">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium">
            <ShieldCheck size={15} className="text-primary" />A secure place to
            work
          </div>
          <p className="text-[10px] leading-5 text-muted-foreground">
            Your identity. Your applications.
            <br />
            The right access, all in one place.
          </p>
        </div>
        <div className="flex items-center gap-2.5 border-t border-border px-5 py-4">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{user.name}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {admin ? "Superadmin" : "Employee"}
            </p>
          </div>
          <button
            title="Sign out here"
            aria-label="Sign out here"
            className="text-muted-foreground hover:text-primary"
            onClick={async () => {
              try {
                const r = await authClient.signOut();
                if (r.error) throw new Error(r.error.message);
                window.location.assign("/sign-in");
              } catch {
                setLogoutError("Sign out failed. Please try again.");
              }
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="lg:pl-[238px]">
        <header className="flex h-[66px] items-center justify-between border-b border-border bg-white px-5 lg:px-10">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span className="text-xs text-muted-foreground">Workspace</span>
            <span className="text-xs text-slate-300">/</span>
            <span className="text-xs font-medium">{active}</span>
          </div>
          <div className="flex items-center gap-5">
            <span className="hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Private workspace
            </span>
            <Link
              href="/security"
              aria-label="Security settings"
              title="Security settings"
              className="text-muted-foreground"
            >
              <ShieldCheck size={17} />
            </Link>
            <div className="h-5 border-l border-border" />
            <Avatar name={user.name} small />
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto max-w-[1480px] px-5 py-9 sm:px-8 lg:px-10"
        >
          <div className="fade-in" key={path}>
            {(error || logoutError) && (
              <ErrorNotice message={error || logoutError} />
            )}
            {admin && !user.twoFactorEnabled && (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                <span>
                  <strong>Protect your administrator account.</strong> Enroll in
                  MFA to unlock administration and applications.
                </span>
                <Link href="/security" className="font-semibold underline">
                  Set up MFA
                </Link>
              </div>
            )}
            {path === "/" ? (
              me ? (
                <MyApps me={me} />
              ) : (
                <Loading />
              )
            ) : path === "/account" ? (
              <Account user={user} refresh={refresh} />
            ) : path === "/security" ? (
              me ? (
                <Security me={me} refresh={refresh} />
              ) : (
                <Loading />
              )
            ) : !admin ? (
              <Empty
                title="You don't have access to this page"
                description="Only a company superadmin can administer this workspace."
              />
            ) : !user.twoFactorEnabled ? (
              <Empty
                title="MFA enrollment required"
                description="Set up your authenticator in Security & sessions, then return to this page."
              />
            ) : path === "/overview" ? (
              <Overview />
            ) : path === "/users" ? (
              <UserManagement />
            ) : path === "/platforms" ? (
              <Platforms />
            ) : path === "/access" ? (
              <AccessManagement />
            ) : path === "/audit" ? (
              <AuditLogs />
            ) : (
              <WorkspaceSettings />
            )}
          </div>
          <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-[10px] text-muted-foreground">
            <span>
              {productName} <span className="mx-2 text-slate-300">/</span> Your
              connected workspace
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={12} />
              Secure by design
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
export function Avatar({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-[#dce4f8] bg-[#edf2ff] font-semibold text-[#5f75b4] ${small ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-[11px]"}`}
    >
      {name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()}
    </span>
  );
}
function MyApps({ me }: { me: Me }) {
  const [search, setSearch] = useState(""),
    apps = me.apps.filter((app) =>
      `${app.name} ${app.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  return (
    <>
      <PageTitle
        title="My apps"
        description="Your tools, together in one place."
      />
      <div className="relative mb-8 overflow-hidden rounded-xl border border-[#dce5fa] bg-[#edf3ff] px-7 py-7 sm:px-8">
        <div className="relative z-10">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-[#7387b2]">
            YOUR WORKSPACE, SIMPLIFIED
          </p>
          <h2 className="text-[23px] font-semibold tracking-[-.5px] text-[#24385e]">
            Good to see you, {me.user.name.split(" ")[0]}.
          </h2>
          <p className="mt-2 max-w-md text-xs leading-6 text-[#7586a6]">
            Everything you need to do your best work. Open an application below
            and pick up where you left off.
          </p>
          <div className="mt-5 flex items-center gap-2 text-[11px] text-[#5b75ac]">
            <ShieldCheck size={14} />
            <span>
              One account. Secure access to {me.apps.length} application
              {me.apps.length !== 1 ? "s" : ""}.
            </span>
          </div>
        </div>
        <div
          aria-hidden
          className="absolute -right-12 -top-20 h-80 w-80 rotate-[-20deg] rounded-[65px] border-[24px] border-[#dfe8fc]"
        >
          <div className="absolute inset-10 rounded-[35px] border-[20px] border-[#dfe8fc]" />
        </div>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Your applications</h2>
          <Badge>{me.apps.length}</Badge>
        </div>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search applications..."
        />
      </div>
      {apps.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => (
            <a
              key={app.id}
              href={app.launchUrl}
              className="group flex min-h-[200px] flex-col rounded-xl border border-border bg-white p-5 transition-all hover:border-blue-200 hover:shadow-[0_5px_20px_#24385e08]"
            >
              <div className="mb-4 flex items-start justify-between">
                <AppIcon icon={app.icon} />
                <ArrowUpRight
                  size={17}
                  className="text-slate-300 transition-colors group-hover:text-primary"
                />
              </div>
              <h3 className="text-sm font-semibold">{app.name}</h3>
              <p className="mb-5 mt-2 flex-1 text-xs leading-5 text-muted-foreground">
                {app.description}
              </p>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <Badge tone="blue">
                  {app.access?.role === "superadmin"
                    ? "Full access"
                    : app.access?.role}
                </Badge>
                <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
                  Open application
                  <ArrowRight size={12} />
                </span>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <Panel>
          <Empty
            title={
              search
                ? "No matching applications"
                : "Your workspace is ready for applications"
            }
            description={
              search
                ? "Try a different name or keyword."
                : "Your administrator can assign applications to your account. They'll appear here once access is granted."
            }
          />
        </Panel>
      )}
      <div className="mt-7 flex items-start gap-3 rounded-lg border border-dashed border-slate-200 p-4">
        <CircleHelp size={17} className="mt-0.5 text-muted-foreground" />
        <div>
          <p className="text-xs font-medium">Missing an application?</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Contact your company administrator to request access to another
            tool.
          </p>
        </div>
      </div>
    </>
  );
}
function Overview() {
  const { data, error } = useData<{
    users: number;
    activeUsers: number;
    platforms: number;
    assignments: number;
    pendingInvitations: number;
    events: Audit[];
  }>("/api/admin/overview");
  if (error) return <ErrorNotice message={error} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageTitle
        title="Workspace overview"
        description="A clear picture of your people, applications and access."
      >
        <Button asChild>
          <Link href="/users">
            <Plus size={14} />
            Invite a teammate
          </Link>
        </Button>
      </PageTitle>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: "Team members",
            value: data.users,
            sub: `${data.activeUsers} active accounts`,
            icon: Users,
          },
          {
            title: "Connected platforms",
            value: data.platforms,
            sub: "Enabled in your workspace",
            icon: Layers3,
          },
          {
            title: "Active assignments",
            value: data.assignments,
            sub: "Role-based platform access",
            icon: KeyRound,
          },
          {
            title: "Pending invitations",
            value: data.pendingInvitations,
            sub: "Waiting for your teammates",
            icon: UserRound,
          },
        ].map((item) => (
          <Panel key={item.title} className="p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {item.title}
              <item.icon size={17} className="text-slate-400" />
            </div>
            <p className="my-4 text-[31px] font-semibold tracking-tight">
              {item.value}
            </p>
            <p className="text-[10px] text-muted-foreground">{item.sub}</p>
          </Panel>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <Panel>
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="text-sm font-semibold">Recent activity</h2>
            <Link
              href="/audit"
              className="flex items-center gap-1 text-xs text-primary"
            >
              View audit log
              <ArrowRight size={12} />
            </Link>
          </div>
          {data.events.length ? (
            <div>
              {data.events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 border-b border-border px-5 py-4 last:border-0"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-muted">
                    <Activity size={14} className="text-slate-500" />
                  </span>
                  <div className="flex-1">
                    <p className="text-xs font-medium">
                      {event.action.replaceAll(/[._]/g, " ")}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {event.actor?.name || "System"}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    <DateText value={event.createdAt} />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Your audit trail starts here"
              description="Administrative and authentication events will appear here."
            />
          )}
        </Panel>
        <div className="space-y-5">
          <Panel className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary" />
              <h2 className="text-sm font-semibold">Workspace safeguards</h2>
            </div>
            {[
              "Invitation-only membership",
              "Administrator MFA required",
              "Live access enforcement",
              "Audited administration",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 py-2.5 text-[11px] text-slate-500"
              >
                <CheckCircle2 size={13} className="text-emerald-500" />
                {item}
              </div>
            ))}
          </Panel>
          <Panel className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Build your workspace</h2>
            <p className="mb-5 text-xs leading-6 text-muted-foreground">
              Connect an internal tool and give your team one less password to
              remember.
            </p>
            <Button variant="outline" asChild className="w-full">
              <Link href="/platforms">
                <Plus size={14} />
                Add a platform
              </Link>
            </Button>
          </Panel>
        </div>
      </div>
    </>
  );
}
function WorkspaceSettings() {
  const { data, error } = useData<{
    productName: string;
    issuer: string;
    accessCacheSeconds: number;
    sessionHours: number;
    invitationHours: number;
  }>("/api/admin/settings");
  return (
    <>
      <PageTitle
        title="Workspace settings"
        description="Your company identity and security configuration."
      />
      {error ? (
        <ErrorNotice message={error} />
      ) : !data ? (
        <Loading />
      ) : (
        <Panel className="max-w-3xl">
          <div className="border-b border-border p-6">
            <h2 className="text-sm font-semibold">General & security</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Deployment settings are managed through server environment
              variables.
            </p>
          </div>
          {[
            ["Product name", data.productName],
            ["OIDC issuer", data.issuer],
            ["Central session lifetime", `${data.sessionHours} hours`],
            ["Maximum access cache", `${data.accessCacheSeconds} seconds`],
            ["Invitation lifetime", `${data.invitationHours} hours`],
            ["Administrator MFA", "Required"],
            ["Public registration", "Disabled"],
            ["Refresh token grant", "Disabled"],
          ].map(([key, value]) => (
            <div
              key={key}
              className="flex flex-wrap justify-between gap-3 border-b border-border px-6 py-4 text-xs last:border-0"
            >
              <span className="text-muted-foreground">{key}</span>
              <span className="break-all font-medium">{value}</span>
            </div>
          ))}
        </Panel>
      )}
    </>
  );
}
