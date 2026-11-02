import { randomBytes, createHash } from "node:crypto";
import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  createRemoteJWKSet,
  jwtVerify,
} from "jose";
import { AppError, fail } from "./service.js";
import { installLocalAuth, installAccountRoutes } from "./local-auth.js";

export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const hash = (value) => createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");
function cookie(req, name) {
  return req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + "="))
    ?.slice(name.length + 1);
}

export async function installAuth(app, db, config) {
  const { origin, demo, clock } = config,
    secure = origin.startsWith("https:");
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 3600000,
  };
  const pending = new Map(),
    codes = new Map();
  const issuer = demo ? `${origin}/idp` : process.env.OIDC_ISSUER;
  const oidcEnabled =
    demo || process.env.AUTH_MODE === "oidc" || Boolean(issuer);
  const local = !oidcEnabled ? await installLocalAuth(app, db, config) : null;
  if (oidcEnabled)
    app.get("/auth/config", (req, res) => res.json({ mode: "oidc" }));
  fail(
    oidcEnabled && !issuer,
    "CONFIG",
    "Configure OIDC_ISSUER when the demo provider is disabled",
    500,
  );
  const clientId = process.env.OIDC_CLIENT_ID || "gympass",
    redirectUri = `${origin}/auth/callback`;
  let keys, jwk;
  if (demo) {
    keys = await generateKeyPair("RS256");
    jwk = {
      ...(await exportJWK(keys.publicKey)),
      kid: "gympass-demo",
      alg: "RS256",
      use: "sig",
    };
    app.get("/idp/.well-known/openid-configuration", (req, res) =>
      res.json({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
      }),
    );
    app.get("/idp/jwks", (req, res) => res.json({ keys: [jwk] }));
    app.get("/idp/authorize", (req, res) => {
      const q = req.query;
      fail(
        q.client_id !== clientId ||
          q.redirect_uri !== redirectUri ||
          q.response_type !== "code" ||
          q.code_challenge_method !== "S256" ||
          typeof q.code_challenge !== "string" ||
          typeof q.state !== "string" ||
          typeof q.nonce !== "string",
        "OIDC_REQUEST",
        "Invalid OIDC request",
      );
      if (!q.demo_subject) {
        const choices = [
          ["member-1", "أحمد خالد — عضو فعال"],
          ["member-2", "سارة محمد — عضو فعال"],
          ["member-1400", "عضو بعضوية منتهية"],
          ["instructor-1", "مدرب الحصص"],
          ["manager", "مدير المركز"],
        ];
        const hidden = Object.entries(q)
          .map(
            ([k, v]) =>
              `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`,
          )
          .join("");
        res
          .type("html")
          .send(
            `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>الدخول التجريبي إلى GymPass</title><link rel="stylesheet" href="/style.css"><main class="identity-page"><span class="eyebrow">GYMPASS UNIVERSITY</span><h1>اختَر حساب العرض</h1><p>موفر هوية تجريبي للتقييم الجامعي. جميع الحسابات والبيانات المعروضة افتراضية.</p><form action="/idp/authorize" method="get">${hidden}<div class="identity-options">${choices.map(([id, name]) => `<button name="demo_subject" value="${id}">${name}<span aria-hidden="true">←</span></button>`).join("")}</div></form><a href="/">العودة للرئيسية</a></main></html>`,
          );
        return;
      }
      fail(
        !db
          .prepare(
            "SELECT id FROM users WHERE id=? AND role IN ('member','instructor','manager')",
          )
          .get(q.demo_subject),
        "OIDC_USER",
        "Unknown demo identity",
      );
      for (const [k, v] of codes) if (v.expires < clock()) codes.delete(k);
      const code = random();
      codes.set(code, {
        sub: q.demo_subject,
        challenge: q.code_challenge,
        nonce: q.nonce,
        expires: clock() + 60000,
      });
      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      target.searchParams.set("state", q.state);
      res.redirect(target.href);
    });
    app.post("/idp/token", (req, res, next) => {
      (async () => {
        const code = codes.get(req.body.code);
        codes.delete(req.body.code);
        fail(
          !code ||
            code.expires <= clock() ||
            req.body.client_id !== clientId ||
            req.body.redirect_uri !== redirectUri ||
            req.body.grant_type !== "authorization_code",
          "OIDC_CODE",
          "Invalid authorization code",
          400,
        );
        const challenge = createHash("sha256")
          .update(String(req.body.code_verifier || ""))
          .digest("base64url");
        fail(
          challenge !== code.challenge,
          "OIDC_PKCE",
          "Invalid PKCE verifier",
          400,
        );
        const user = db.prepare("SELECT * FROM users WHERE id=?").get(code.sub);
        const token = await new SignJWT({
          name: user.name,
          email: user.email,
          email_verified: true,
          nonce: code.nonce,
          gympass_role: user.role,
        })
          .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
          .setSubject(user.id)
          .setIssuer(issuer)
          .setAudience(clientId)
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(keys.privateKey);
        res.json({
          access_token: random(),
          token_type: "Bearer",
          expires_in: 300,
          id_token: token,
        });
      })().catch(next);
    });
  }
  let discovery;
  async function getDiscovery() {
    if (!discovery) {
      const response = await fetch(
        `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
        { signal: AbortSignal.timeout(8000) },
      );
      fail(!response.ok, "OIDC_DISCOVERY", "Identity service unavailable", 503);
      discovery = await response.json();
      fail(
        discovery.issuer !== issuer,
        "OIDC_DISCOVERY",
        "Identity issuer mismatch",
        503,
      );
      for (const key of [
        "authorization_endpoint",
        "token_endpoint",
        "jwks_uri",
      ]) {
        const url = new URL(discovery[key]);
        fail(
          !demo && url.protocol !== "https:",
          "OIDC_DISCOVERY",
          "Identity endpoints must use HTTPS",
          503,
        );
      }
    }
    return discovery;
  }
  app.get("/auth/login", async (req, res) => {
    if (!oidcEnabled) return res.redirect("/login");
    const meta = await getDiscovery();
    for (const [k, v] of pending) if (v.expires < clock()) pending.delete(k);
    fail(pending.size >= 1000, "RATE_LIMIT", "Too many sign in attempts", 429);
    const state = random(),
      nonce = random(),
      verifier = random();
    pending.set(state, { nonce, verifier, expires: clock() + 10 * 60000 });
    res.cookie("gp_oidc", state, {
      ...cookieOptions,
      path: "/auth",
      maxAge: 10 * 60000,
    });
    const target = new URL(meta.authorization_endpoint);
    for (const [k, v] of Object.entries({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "openid email profile",
      state,
      nonce,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    }))
      target.searchParams.set(k, v);
    res.redirect(target.href);
  });
  let jwks;
  app.get("/auth/callback", async (req, res) => {
    fail(
      !oidcEnabled,
      "FORBIDDEN",
      "University sign in is not configured",
      403,
    );
    const state = req.query.state,
      p = pending.get(state);
    pending.delete(state);
    fail(
      !p ||
        p.expires <= clock() ||
        cookie(req, "gp_oidc") !== state ||
        typeof req.query.code !== "string",
      "OIDC_STATE",
      "Sign in expired or state is invalid",
      403,
    );
    const meta = await getDiscovery();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: req.query.code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: p.verifier,
    });
    if (process.env.OIDC_CLIENT_SECRET)
      body.set("client_secret", process.env.OIDC_CLIENT_SECRET);
    const response = await fetch(meta.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    fail(!response.ok, "OIDC_TOKEN", "Identity token exchange failed", 403);
    const tokens = await response.json();
    jwks ||= createRemoteJWKSet(new URL(meta.jwks_uri));
    let payload;
    try {
      ({ payload } = await jwtVerify(tokens.id_token, jwks, {
        issuer,
        audience: clientId,
        algorithms: ["RS256"],
      }));
    } catch {
      throw new AppError("OIDC_TOKEN", "Identity token validation failed", 403);
    }
    fail(
      payload.nonce !== p.nonce ||
        !payload.sub ||
        typeof payload.email !== "string" ||
        payload.email_verified !== true,
      "OIDC_CLAIMS",
      "Identity claims are invalid",
      403,
    );
    const userId = demo
      ? payload.sub
      : `oidc:${hash(issuer).slice(0, 12)}:${payload.sub}`;
    if (!db.prepare("SELECT id FROM users WHERE id=?").get(userId))
      db.prepare(
        "INSERT INTO users(id,name,email,role) VALUES (?,?,?,'member')",
      ).run(
        userId,
        String(payload.name || payload.email).slice(0, 100),
        payload.email.slice(0, 254),
      );
    // Privileged external roles are provisioned by an operator, never accepted from a browser or arbitrary claim.
    const id = random(),
      csrf = random();
    db.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run(
      hash(id),
      userId,
      csrf,
      clock() + 8 * 3600000,
    );
    res.clearCookie("gp_oidc", { path: "/auth" });
    res.cookie("gp_session", id, cookieOptions);
    res.redirect("/");
  });
  app.use("/api", (req, res, next) => {
    const value = cookie(req, "gp_session");
    const session =
      value &&
      db
        .prepare(
          `SELECT s.*,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires>?`,
        )
        .get(hash(value), clock());
    if (!session || !["member", "instructor", "manager"].includes(session.role))
      return next(new AppError("UNAUTHENTICATED", "Please sign in", 401));
    req.user = {
      id: session.user_id,
      name: session.name,
      email: session.email,
      role: session.role,
    };
    req.session = session;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (
        req.headers.origin !== origin ||
        req.headers["x-csrf-token"] !== session.csrf
      )
        return next(
          new AppError("CSRF", "The request could not be verified", 403),
        );
    }
    next();
  });
  app.post("/api/logout", (req, res) => {
    db.prepare("DELETE FROM sessions WHERE id=?").run(req.session.id);
    res.clearCookie("gp_session", { path: "/" });
    res.json({ ok: true });
  });
  installAccountRoutes(app, db, { clock, local });
}
