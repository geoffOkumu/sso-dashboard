import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import * as oidc from "openid-client";
import {
  createAccessClient,
  AccessDenied,
} from "../../access-client/src/index";
import {
  createSessionRenewer,
  sessionExpiry,
  type ToolSession,
} from "./session";
export function startDemo(kind: "crm" | "analytics") {
  const env = process.env;
  for (const key of [
    "OIDC_ISSUER",
    "OIDC_CLIENT_ID",
    "OIDC_CLIENT_SECRET",
    "APP_URL",
  ])
    if (!env[key]) throw new Error(`${key} is required; see .env.example`);
  const issuer = env.OIDC_ISSUER!,
    appUrl = new URL(env.APP_URL!),
    clientId = env.OIDC_CLIENT_ID!,
    secret = env.OIDC_CLIENT_SECRET!;
  const dev = env.NODE_ENV !== "production";
  for (const value of [issuer, appUrl.href]) {
    const url = new URL(value);
    if (
      url.protocol !== "https:" &&
      !(
        dev &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
    )
      throw new Error("Use HTTPS, except loopback development");
  }
  const directory = env.DATA_DIR || ".data";
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(`${directory}/${kind}.sqlite`);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS flow (id TEXT PRIMARY KEY, verifier TEXT NOT NULL, state TEXT NOT NULL, nonce TEXT NOT NULL, returnPath TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS session (id TEXT PRIMARY KEY, issuer TEXT NOT NULL, subject TEXT NOT NULL, name TEXT NOT NULL, accessToken TEXT NOT NULL, securityVersion INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS identity (issuer TEXT NOT NULL, subject TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY (issuer, subject));
    CREATE TABLE IF NOT EXISTS record (id INTEGER PRIMARY KEY, name TEXT NOT NULL, detail TEXT NOT NULL);`);
  // Preserve existing demo records and sessions when upgrading their store.
  const columns = db.prepare("PRAGMA table_info(session)").all() as {
    name: string;
  }[];
  if (!columns.some((column) => column.name === "refreshToken"))
    db.exec("ALTER TABLE session ADD COLUMN refreshToken TEXT");
  if (!columns.some((column) => column.name === "accessTokenExpires")) {
    db.exec(
      "ALTER TABLE session ADD COLUMN accessTokenExpires INTEGER NOT NULL DEFAULT 0",
    );
    db.exec("UPDATE session SET accessTokenExpires = expires");
  }

  if (
    !(db.prepare("SELECT count(*) AS n FROM record").get() as { n: number }).n
  ) {
    const rows =
      kind === "crm"
        ? [
            ["Jordan Lee", "jordan@example.test"],
            ["Alex Morgan", "alex@example.test"],
          ]
        : [
            ["Quarterly revenue", "$128,400"],
            ["Customer retention", "94.2%"],
          ];
    for (const row of rows)
      db.prepare("INSERT INTO record(name,detail) VALUES (?,?)").run(...row);
  }
  const access = createAccessClient({
    issuer,
    clientId,
    clientSecret: secret,
    endpoint: `${issuer.replace(/\/api\/auth$/, "")}/api/access/check`,
    cacheMs: 30_000,
  });
  let configuration: Promise<oidc.Configuration> | undefined;
  function config() {
    return (configuration ??= oidc
      .discovery(
        new URL(issuer),
        clientId,
        { token_endpoint_auth_method: "client_secret_basic" },
        oidc.ClientSecretBasic(secret),
        {
          execute: [
            ...(dev ? [oidc.allowInsecureRequests] : []),
            oidc.enableNonRepudiationChecks,
          ],
        },
      )
      .catch((error) => {
        configuration = undefined;
        throw error;
      }));
  }
  const prefix = dev ? `company-${kind}` : `__Host-company-${kind}`;
  const cookie = (name: string, value: string, seconds: number) =>
    `${prefix}-${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${dev ? "" : "; Secure"}`;
  const cookies = (request: IncomingMessage) =>
    Object.fromEntries(
      (request.headers.cookie || "").split(";").map((s) => s.trim().split("=")),
    );
  const esc = (s: unknown) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const title = kind === "crm" ? "Customer CRM" : "Analytics";
  const html = (heading: string, content: string) =>
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>body{font:14px system-ui;background:#f7f9fb;color:#0b0e1a;margin:0}header{background:white;border-bottom:1px solid #dfe5ec;padding:20px 5%;display:flex;justify-content:space-between}main{max-width:960px;margin:50px auto;padding:24px}h1{font-size:30px}a{color:#084bff}table{border-collapse:collapse;background:white;width:100%;margin:25px 0}td,th{padding:16px;text-align:left;border-bottom:1px solid #e2e7ee}button{background:#084bff;color:white;border:0;border-radius:6px;padding:10px 16px;cursor:pointer}input{padding:10px;border:1px solid #ccd4df;border-radius:5px}form{display:inline-flex;gap:8px;margin:10px 8px 10px 0}.muted{color:#718096}footer{margin-top:50px;color:#718096}</style><header><strong>${esc(title)}</strong><a href="${esc(issuer.replace(/\/api\/auth$/, ""))}">Permit Kit</a></header><main><h1>${esc(heading)}</h1>${content}<footer>Independent application · Server-enforced access · ${kind === "crm" ? "Contacts" : "Reports"}</footer></main></html>`;
  function send(
    response: ServerResponse,
    status: number,
    content: string,
    type = "text/html",
  ) {
    response.writeHead(status, {
      "Content-Type": `${type}; charset=utf-8`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      // Preserve Origin on same-origin native form POSTs for the CSRF check.
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy":
        "default-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    });
    response.end(content);
  }
  function redirect(response: ServerResponse, location: string) {
    response.writeHead(302, {
      Location: location,
      "Cache-Control": "no-store",
    });
    response.end();
  }
  const renewSession = createSessionRenewer({
    issuer,
    load: (id) =>
      db.prepare("SELECT * FROM session WHERE id = ?").get(id) as
        | ToolSession
        | undefined,
    save: (previous, next) =>
      Number(
        db
          .prepare(
            "UPDATE session SET accessToken = ?, refreshToken = ?, accessTokenExpires = ?, expires = ? WHERE id = ? AND refreshToken = ?",
          )
          .run(
            next.accessToken,
            next.refreshToken,
            next.accessTokenExpires,
            next.expires,
            previous.id,
            previous.refreshToken,
          ).changes,
      ) === 1,
    remove: (id) => {
      db.prepare("DELETE FROM session WHERE id = ?").run(id);
    },
    refresh: async (session) => {
      let token;
      try {
        token = await oidc.refreshTokenGrant(
          await config(),
          session.refreshToken!,
        );
      } catch (error) {
        if (
          error instanceof oidc.ResponseBodyError &&
          error.status < 500 &&
          error.status !== 429
        )
          throw new AccessDenied("session_expired");
        throw error;
      }
      const claims = token.claims();
      if (claims && (claims.iss !== issuer || claims.sub !== session.subject))
        throw new AccessDenied("invalid_identity");
      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token!,
        expiresIn: token.expires_in!,
      };
    },
    validate: (session) =>
      access.check({ ...session, sessionId: session.id }, undefined, true),
  });
  async function protectedSession(
    request: IncomingMessage,
    response: ServerResponse,
    permission?: string,
    sensitive = false,
  ) {
    const session = await renewSession(
      cookies(request)[`${prefix}-session`] || "",
    );
    const decision = await access.check(
      { ...session, sessionId: session.id },
      permission,
      sensitive,
    );
    response.setHeader(
      "Set-Cookie",
      cookie(
        "session",
        session.id,
        Math.max(1, Math.floor((session.expires - Date.now()) / 1000)),
      ),
    );
    return { session, decision };
  }
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", appUrl); // Never trust the inbound Host for callback validation.
    try {
      if (url.pathname === "/health")
        return send(response, 200, '{"status":"ok"}', "application/json");
      if (request.method === "POST" && request.headers.origin !== appUrl.origin)
        return send(
          response,
          403,
          html("Request rejected", "Invalid request origin."),
        );
      if (url.pathname === "/login") {
        const configuration = await config(),
          verifier = oidc.randomPKCECodeVerifier(),
          state = oidc.randomState(),
          nonce = oidc.randomNonce(),
          id = randomBytes(32).toString("base64url");
        const requested = url.searchParams.get("returnTo"),
          returnPath = requested === "/" ? requested : "/";
        db.prepare("DELETE FROM flow WHERE expires < ?").run(Date.now());
        db.prepare("INSERT INTO flow VALUES (?,?,?,?,?,?)").run(
          id,
          verifier,
          state,
          nonce,
          returnPath,
          Date.now() + 300000,
        );
        const target = oidc.buildAuthorizationUrl(configuration, {
          redirect_uri: `${appUrl.origin}/callback`,
          scope: "openid profile email offline_access",
          code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
          code_challenge_method: "S256",
          state,
          nonce,
        });
        response.setHeader("Set-Cookie", cookie("flow", id, 300));
        return redirect(response, target.href);
      }
      if (url.pathname === "/callback") {
        const id = cookies(request)[`${prefix}-flow`] || "";
        const flow = db
          .prepare("DELETE FROM flow WHERE id = ? RETURNING *")
          .get(id) as
          | {
              verifier: string;
              state: string;
              nonce: string;
              expires: number;
              returnPath: string;
            }
          | undefined;
        response.setHeader("Set-Cookie", cookie("flow", "", 0));
        if (!flow || flow.expires < Date.now())
          throw new AccessDenied("invalid_login_flow");
        const token = await oidc.authorizationCodeGrant(await config(), url, {
          pkceCodeVerifier: flow.verifier,
          expectedState: flow.state,
          expectedNonce: flow.nonce,
          idTokenExpected: true,
        });
        const claims = token.claims();
        if (!claims || claims.iss !== issuer || typeof claims.sub !== "string")
          throw new AccessDenied("invalid_identity");
        const check = await fetch(
          `${issuer.replace(/\/api\/auth$/, "")}/api/access/check`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`).toString("base64")}`,
            },
            body: JSON.stringify({ token: token.access_token }),
            signal: AbortSignal.timeout(5000),
          },
        );
        if (!check.ok) throw new AccessDenied("not_assigned");
        const decision = (await check.json()) as {
          allowed: boolean;
          subject: string;
          issuer: string;
          securityVersion: number;
          expiresAt: number;
          sessionExpiresAt: number;
        };
        if (
          !decision.allowed ||
          decision.subject !== claims.sub ||
          decision.issuer !== issuer ||
          !Number.isInteger(decision.securityVersion) ||
          !token.refresh_token ||
          !Number.isFinite(token.expires_in) ||
          token.expires_in! <= 0
        )
          throw new AccessDenied("invalid_identity");
        const sessionId = randomBytes(32).toString("base64url"),
          name = typeof claims.name === "string" ? claims.name : "Team member";
        const expires = sessionExpiry(decision);
        const accessTokenExpires = Math.min(
          decision.expiresAt,
          Date.now() + token.expires_in! * 1000,
        );
        db.prepare(
          "INSERT INTO identity VALUES (?,?,?) ON CONFLICT(issuer,subject) DO UPDATE SET name=excluded.name",
        ).run(issuer, claims.sub, name);
        db.prepare(
          "INSERT INTO session (id, issuer, subject, name, accessToken, securityVersion, expires, refreshToken, accessTokenExpires) VALUES (?,?,?,?,?,?,?,?,?)",
        ).run(
          sessionId,
          issuer,
          claims.sub,
          name,
          token.access_token,
          decision.securityVersion,
          expires,
          token.refresh_token,
          accessTokenExpires,
        );
        response.setHeader("Set-Cookie", [
          cookie("flow", "", 0),
          cookie(
            "session",
            sessionId,
            Math.max(1, Math.floor((expires - Date.now()) / 1000)),
          ),
        ]);
        return redirect(response, flow.returnPath);
      }
      if (url.pathname === "/logout" && request.method === "POST") {
        db.prepare("DELETE FROM session WHERE id = ?").run(
          cookies(request)[`${prefix}-session`] || "",
        );
        response.setHeader("Set-Cookie", cookie("session", "", 0));
        return send(
          response,
          200,
          html(
            "Signed out here",
            '<p>Your session in this application has ended.</p><a href="/login">Sign in again</a>',
          ),
        );
      }
      const readPermission = kind === "crm" ? "contacts.read" : "reports.read";
      if (url.pathname.startsWith("/api/")) {
        const permission =
          url.pathname === "/api/delete"
            ? "contacts.delete"
            : url.pathname === "/api/export"
              ? "reports.export"
              : kind === "crm"
                ? "contacts.write"
                : "dashboards.manage";
        if (request.method !== "POST")
          return send(
            response,
            405,
            '{"error":"POST required"}',
            "application/json",
          );
        await protectedSession(request, response, permission, true);
        let raw = "";
        for await (const chunk of request) {
          raw += chunk;
          if (raw.length > 4096)
            return send(
              response,
              413,
              '{"error":"Request too large"}',
              "application/json",
            );
        }
        const values = new URLSearchParams(raw);
        if (url.pathname === "/api/export" && kind === "analytics") {
          const rows = db.prepare("SELECT * FROM record").all();
          return send(response, 200, JSON.stringify(rows), "application/json");
        } else if (url.pathname === "/api/delete" && kind === "crm")
          db.prepare("DELETE FROM record WHERE id = ?").run(
            Number(values.get("id")),
          );
        else if (url.pathname === "/api/create") {
          const name = values.get("name")?.trim(),
            detail = values.get("detail")?.trim();
          if (!name || !detail || name.length > 100 || detail.length > 200)
            return send(
              response,
              400,
              '{"error":"Name and detail are required"}',
              "application/json",
            );
          db.prepare("INSERT INTO record(name,detail) VALUES (?,?)").run(
            name,
            detail,
          );
        } else
          return send(
            response,
            404,
            '{"error":"Not found"}',
            "application/json",
          );
        return redirect(response, "/");
      }
      if (url.pathname !== "/")
        return send(
          response,
          404,
          html("Not found", '<a href="/">Go home</a>'),
        );
      if (!cookies(request)[`${prefix}-session`])
        return redirect(response, "/login");
      const { session, decision } = await protectedSession(
        request,
        response,
        readPermission,
      );
      const can = (permission: string) =>
        decision.permissions.includes("*") ||
        decision.permissions.includes(permission);
      const rows = db
        .prepare("SELECT * FROM record ORDER BY id DESC")
        .all() as { id: number; name: string; detail: string }[];
      return send(
        response,
        200,
        html(
          kind === "crm" ? "Your contacts" : "Your reports",
          `<p class="muted">Signed in as ${esc(session.name)} · ${esc(decision.role)}</p><table><tr><th>Name</th><th>${kind === "crm" ? "Email" : "Value"}</th><th>Actions</th></tr>${rows.map((row) => `<tr><td>${esc(row.name)}</td><td>${esc(row.detail)}</td><td>${kind === "crm" && can("contacts.delete") ? `<form method="post" action="/api/delete"><input type="hidden" name="id" value="${row.id}"><button>Delete contact</button></form>` : "—"}</td></tr>`).join("")}</table>${can(kind === "crm" ? "contacts.write" : "dashboards.manage") ? '<form method="post" action="/api/create"><input name="name" aria-label="Name" placeholder="Name" required maxlength="100"><input name="detail" aria-label="Detail" placeholder="Detail" required maxlength="200"><button>Add record</button></form>' : ""}${kind === "analytics" && can("reports.export") ? '<form action="/api/export" method="post"><button>Export reports</button></form>' : ""}<hr><form action="/logout" method="post"><button>Sign out here</button></form><a href="${esc(issuer.replace(/\/api\/auth$/, ""))}/security">Manage sessions or sign out everywhere</a>`,
        ),
      );
    } catch (error) {
      const reason =
        error instanceof AccessDenied
          ? error.reason
          : "invalid_or_unavailable_identity_provider";
      if (url.pathname.startsWith("/api/"))
        return send(
          response,
          reason === "authorization_unavailable" ? 503 : 403,
          JSON.stringify({ error: reason }),
          "application/json",
        );
      return send(
        response,
        403,
        html(
          "Access unavailable",
          `<p>${esc(reason.replaceAll("_", " "))}</p><p>Your administrator may need to assign access, or your session may have expired.</p><a href="/login">Sign in again</a>`,
        ),
      );
    }
  });
  server.listen(
    Number(env.PORT || appUrl.port || (kind === "crm" ? 3001 : 3002)),
    "127.0.0.1",
    () => console.log(`${title} is running at ${appUrl.origin}`),
  );
  return server;
}
