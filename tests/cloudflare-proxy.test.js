import test from "node:test";
import assert from "node:assert/strict";
import pages from "../cloudflare/pages-worker.js";

test("Pages serves role deep links and protects forwarding, body limits and response headers", async () => {
  let forwarded, assetPath;
  const env = {
    APP_ORIGIN: "https://gympassjust.pages.dev",
    GYM: { idFromName: n => n, get: () => ({ fetch: async req => { forwarded = req; return Response.json({ ok: true }); } }) },
    ASSETS: { fetch: async req => {
      assetPath = new URL(req.url).pathname;
      // Pages canonicalizes /index.html to /. Rewriting every SPA route to that
      // file would therefore create a redirect loop on the deployed home page.
      if (assetPath === "/index.html") return new Response(null, { status: 308, headers: { location: "/" } });
      return new Response("<html>GymPassJUST</html>");
    } },
  };
  const deep = await pages.fetch(new Request(env.APP_ORIGIN + "/instructor/classes"), env);
  assert.equal(deep.status, 200);
  assert.equal(assetPath, "/instructor/classes");
  assert.equal(deep.headers.get("x-frame-options"), "DENY");
  assert.equal((await pages.fetch(new Request("https://untrusted.example/api/plans"), env)).status, 403);
  const request = new Request(env.APP_ORIGIN + "/api/bookings", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.10", "x-gym-client-ip": "spoofed" }, body: '{"classId":1}' });
  const response = await pages.fetch(request, env);
  assert.equal(response.status, 200);
  assert.equal(forwarded.headers.get("x-gym-client-ip"), "192.0.2.10");
  assert.equal(await forwarded.text(), '{"classId":1}');
  const large = new Request(env.APP_ORIGIN + "/auth/local/register", { method: "POST", body: "x".repeat(17000) });
  const rejected = await pages.fetch(large, env);
  assert.equal(rejected.status, 413);
  assert.equal(rejected.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await pages.fetch(new Request(env.APP_ORIGIN + "/style.css", { method: "POST" }), env)).status, 405);
});
