import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { BookOpen, ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { getPublicDocs } from "@/lib/public-docs";

export const metadata: Metadata = { title: "Integration docs" };

function Code({ title, children }: { title: string; children: string }) {
  return (
    <figure className="my-6 min-w-0 overflow-hidden rounded-xl border border-slate-700 bg-brand-ink text-slate-100">
      <figcaption className="border-b border-white/10 px-5 py-3 text-xs text-slate-300">
        {title}
      </figcaption>
      <pre className="overflow-x-auto p-5 text-xs leading-6">
        <code>{children}</code>
      </pre>
    </figure>
  );
}

const sections = [
  ["overview", "Overview"],
  ["register", "Register your application"],
  ["endpoints", "Environment & endpoints"],
  ["sign-in", "Sign in with OIDC"],
  ["authorization", "Check permissions"],
  ["sessions", "Sessions & sign-out"],
] as const;

export default async function DocsPage() {
  await connection();
  const docs = getPublicDocs();
  const endpoints = [
    ["GET", "OpenID discovery", docs.discovery],
    ["GET", "Authorization", docs.authorize],
    ["POST", "Token exchange", docs.token],
    ["GET", "User info", docs.userinfo],
    ["GET", "Signing keys (JWKS)", docs.jwks],
    ["POST", "Token introspection", docs.introspect],
    ["POST", "Live access check", docs.accessCheck],
  ];

  return (
    <div className="min-h-screen">
      <a
        href="#overview"
        className="sr-only focus:not-sr-only focus:block focus:p-4"
      >
        Skip to documentation
      </a>
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link href="/" aria-label={`${docs.name} home`}>
            <Brand name={docs.name} />
          </Link>
          <Link
            href="/sign-in"
            className="flex items-center gap-2 text-sm font-medium text-primary"
          >
            Sign in <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16 lg:py-14">
        <aside>
          <nav aria-label="Documentation" className="lg:sticky lg:top-8">
            <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <BookOpen size={16} /> Developer docs
            </p>
            <div className="flex flex-wrap gap-2 lg:flex-col">
              {sections.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-white hover:text-primary"
                >
                  {label}
                </a>
              ))}
            </div>
          </nav>
        </aside>
        <main className="min-w-0 max-w-4xl space-y-12 text-sm leading-7 text-slate-600 [&_h2]:mb-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_section]:scroll-mt-8">
          <section id="overview">
            <span className="rounded-full border border-primary-border bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
              Public integration guide
            </span>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground">
              Connect your application
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8">
              Use {docs.name} for employee sign-in and live, platform-specific
              permissions. Integrate on your application server with OpenID
              Connect Authorization Code Flow and PKCE S256.
            </p>
            <div className="mt-6 rounded-xl border border-border bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                This deployment
              </p>
              <p className="mt-2 break-all font-mono text-sm text-foreground">
                {docs.origin}
              </p>
              <p className="mt-2 text-xs">
                All provider URLs below come from this running deployment’s
                BETTER_AUTH_URL. Set it to the public origin for each
                environment and restart the server. Client credentials and your
                application’s callback URL are specific to your registration.
              </p>
            </div>
          </section>

          <section id="register">
            <h2>1. Register your application</h2>
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                Ask a superadmin with MFA enabled to create your platform in{" "}
                <strong>Platforms</strong>. Set its launch URL to your
                application’s login route.
              </li>
              <li>
                Define permission keys, such as <code>contacts.read</code> and{" "}
                <code>contacts.delete</code>, and group them into roles.
              </li>
              <li>
                Register a separate confidential OIDC client for each
                environment with exact callback URLs. Use HTTPS in production.
                Copy the generated secret immediately; it is shown once.
              </li>
              <li>
                Assign employees a platform role in <strong>Access</strong>.
                Registering a client or setting a launch URL alone does not
                grant access.
              </li>
            </ol>
          </section>

          <section id="endpoints">
            <h2>2. Configure your environment</h2>
            <p>
              Keep this configuration on your application server. Replace the
              credential and callback placeholders with your own registration;
              the provider URLs are ready for this deployment.
            </p>
            <Code title="Application server environment">{`OIDC_ISSUER=${docs.issuer}
ACCESS_CHECK_URL=${docs.accessCheck}
OIDC_CLIENT_ID=<your-registered-client-id>
OIDC_CLIENT_SECRET=<your-client-secret>
OIDC_REDIRECT_URI=<your-exact-registered-callback-url>`}</Code>
            <p>
              Never put client secrets or tokens in NEXT_PUBLIC_ variables,
              browser storage, URLs or logs. Discover provider metadata using
              the URL below; let your OIDC library use the advertised endpoints.
            </p>
            <Code title="Fetch provider metadata">{`curl --fail --silent --show-error '${docs.discovery}'`}</Code>
            <div className="overflow-x-auto rounded-xl border border-border bg-white">
              <table>
                <caption className="sr-only">
                  Provider endpoints for this deployment
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Method</th>
                    <th scope="col">Endpoint</th>
                    <th scope="col">URL</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map(([method, label, url]) => (
                    <tr key={url}>
                      <td className="font-mono text-primary">{method}</td>
                      <td className="whitespace-nowrap font-medium">{label}</td>
                      <td>
                        <code className="break-all">{url}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="sign-in">
            <h2>3. Sign in with OpenID Connect</h2>
            <p>
              Use a maintained server-side OIDC client. This configuration uses
              openid-client 6.x, the same library as the included demo
              applications.
            </p>
            <Code title="Node.js · provider discovery">{`import * as oidc from "openid-client";

const issuer = new URL(${JSON.stringify(docs.issuer)});
const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(issuer.hostname);
const config = await oidc.discovery(
  issuer,
  process.env.OIDC_CLIENT_ID,
  { token_endpoint_auth_method: "client_secret_basic" },
  oidc.ClientSecretBasic(process.env.OIDC_CLIENT_SECRET),
  {
    execute: [
      ...(process.env.NODE_ENV !== "production" && loopback && issuer.protocol === "http:"
        ? [oidc.allowInsecureRequests] : []),
      oidc.enableNonRepudiationChecks,
    ],
  },
);`}</Code>
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                Generate a random state, nonce and PKCE verifier. Store a
                short-lived, one-use flow record on your server, bound to an
                HttpOnly cookie.
              </li>
              <li>
                Build an authorization URL with <code>response_type=code</code>,
                scopes <code>openid profile email</code>, the registered
                redirect URI, state, nonce and an S256 PKCE challenge. Redirect
                the browser there.
              </li>
              <li>
                At the callback, atomically consume the flow record. Exchange
                the code using <code>authorizationCodeGrant</code> with{" "}
                <code>pkceCodeVerifier</code>, <code>expectedState</code>,{" "}
                <code>expectedNonce</code> and{" "}
                <code>idTokenExpected: true</code>. Validate the signature,
                issuer, audience and expiry.
              </li>
              <li>
                Call the live access endpoint with the access token. Require an
                allowed decision whose issuer and subject match the validated ID
                token. Save its securityVersion in your server session.
              </li>
              <li>
                Identify your local user by issuer + subject. Store tokens on
                the server and give the browser only a random, Secure, HttpOnly,
                SameSite=Lax session cookie.
              </li>
            </ol>
            <p className="mt-4">
              The discovery snippet is the configuration step. The repository’s{" "}
              <code>packages/demo-runtime/src/server.ts</code> provides the
              complete flow, callback validation and session storage
              implementation.
            </p>
          </section>

          <section id="authorization">
            <h2>4. Check permissions on the server</h2>
            <p>
              Before protected reads, API calls or mutations, authenticate your
              client with HTTP Basic and send the access token as JSON. The
              client ID and secret are individually URL-encoded before Base64
              encoding.
            </p>
            <Code title="Node.js · live access request">{`const basic = Buffer.from(
  encodeURIComponent(process.env.OIDC_CLIENT_ID) + ":" +
  encodeURIComponent(process.env.OIDC_CLIENT_SECRET)
).toString("base64");

const response = await fetch(${JSON.stringify(docs.accessCheck)}, {
  method: "POST",
  headers: {
    Authorization: "Basic " + basic,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ token: session.accessToken }),
  cache: "no-store",
  signal: AbortSignal.timeout(5000),
});
if (!response.ok) throw new Error("Access denied");
const decision = await response.json();
if (!decision.allowed ||
    decision.issuer !== ${JSON.stringify(docs.issuer)} ||
    decision.subject !== session.subject ||
    decision.securityVersion !== session.securityVersion ||
    !Number.isFinite(decision.expiresAt) ||
    decision.expiresAt <= Date.now() ||
    !Array.isArray(decision.permissions) ||
    !decision.permissions.some(p => p === "*" || p === "contacts.read")) {
  throw new Error("Access denied");
}
// Only now read protected application data.`}</Code>
            <p>
              Here, <code>session</code> is your validated, unexpired server
              session established after the callback. Never populate it from
              browser-submitted identity or permission fields. A successful
              response contains <code>allowed</code>, <code>reason</code>,{" "}
              <code>subject</code>, <code>issuer</code>, <code>platformId</code>
              , <code>role</code>, <code>permissions</code>,{" "}
              <code>superadmin</code>, <code>securityVersion</code> and{" "}
              <code>expiresAt</code> (Unix milliseconds).
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5">
              <li>
                <strong>400:</strong> malformed request. Send only a nonempty
                access token in the JSON body.
              </li>
              <li>
                <strong>401:</strong> invalid credentials, inactive token or
                revoked session.
              </li>
              <li>
                <strong>403:</strong> platform access denied or client/session
                binding missing.
              </li>
              <li>
                <strong>429:</strong> rate limit reached. Back off and deny the
                protected operation.
              </li>
              <li>
                <strong>503 or network failure:</strong> authorization
                unavailable. Fail closed.
              </li>
            </ul>
            <p className="mt-4">
              The workspace package <code>@company/access-client</code>{" "}
              implements these checks and permission enforcement. Positive
              decisions may be cached for 30 seconds by default, with a
              60-second maximum and a cap at token expiry. Always bypass the
              cache for sensitive writes.
            </p>
          </section>

          <section id="sessions">
            <h2>5. Handle expiry and sign-out</h2>
            <p>
              Access tokens last 15 minutes. Refresh grants and offline scopes
              are disabled. Cap your local session at token expiry and start a
              fresh OIDC flow when it expires; an active central session can
              sign the user in again.
            </p>
            <p className="mt-4">
              For local sign-out, use a CSRF-protected POST that deletes your
              application’s server session and clears its cookie. For global
              sign-out, direct users to{" "}
              <a
                className="font-medium text-primary underline"
                href={docs.security}
              >
                Security &amp; sessions
              </a>
              . Global logout revokes existing app sessions through live access
              checks, even after the user signs in centrally again.
            </p>
            <p className="mt-4">
              Before release, verify denied direct navigation, missing
              permissions, disabled clients, expired assignments, callback
              tampering, central outages and global logout. Rotate client
              credentials in Platforms and update your application’s server
              secret immediately.
            </p>
          </section>
          <footer className="border-t border-border pt-6 text-xs text-muted-foreground">
            {docs.name} · Integration documentation · No sign-in required
          </footer>
        </main>
      </div>
    </div>
  );
}
