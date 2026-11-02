import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { performance } from "node:perf_hooks";

// Wrangler owns this version of Miniflare; use its supported v4 option adapter.
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const origin = "https://gympassjust.pages.dev";
const password = "Isolated-QA-password-2026!";
const initialAccounts = [
  { name: "QA Manager", email: "manager@qa.example", password, role: "manager" },
  { name: "QA Instructor", email: "coach@qa.example", password, role: "instructor" },
  { name: "QA Student One", email: "one@qa.example", password, role: "member" },
  { name: "QA Student Two", email: "two@qa.example", password, role: "member" },
];
const objectName = "gympassjust-main-v1";
const bundle = resolve(process.env.CLOUDFLARE_TEST_BUNDLE || ".wrangler/backend-build/worker.js");

test("Cloudflare SQLite runtime preserves authentication, atomic booking, QR and restart persistence", async () => {
  const folder = await mkdtemp(join(tmpdir(), "gympass-cloudflare-"));
  let mf;
  const start = async () => {
    const options = convertV4MiniflareOptions({
      resourcePersistencePath: folder,
      unsafeInspectDurableObjects: true,
      workers: [{ name: "pages", modules: true, script: await readFile("cloudflare/pages-worker.js", "utf8"),
        compatibilityDate: "2026-11-02",
        bindings: { APP_ORIGIN: origin },
        durableObjects: { GYM: { className: "GymDatabase", scriptName: "backend", useSQLite: true } },
      }, { name: "backend", rootPath: dirname(bundle), modules: true, scriptPath: bundle,
        compatibilityDate: "2026-11-02", compatibilityFlags: ["nodejs_compat"],
        durableObjects: { GYM: { className: "GymDatabase", useSQLite: true } },
        bindings: { APP_ORIGIN: origin, SIGNING_SECRET: "isolated-test-signing-secret-longer-than-32-characters", BOOTSTRAP_ACCOUNTS: JSON.stringify(initialAccounts) },
      }],
    });
    mf = new Miniflare(options);
    return { fetch: (input, init) => mf.dispatchFetch(input, init) };
  };
  let stub;
  const client = (cookie = "", csrf = "") => ({
    cookie, csrf,
    async request(path, method = "GET", body, extra = {}) {
      const response = await stub.fetch(origin + path, {
        method, headers: { origin, cookie: this.cookie, "x-csrf-token": this.csrf, "content-type": "application/json", ...extra },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) this.cookie = setCookie.split(";")[0];
      return response;
    },
    async api(path, method = "GET", body, extra) { return this.request("/api" + path, method, body, extra); },
  });
  const login = async email => {
    const c = client();
    const response = await c.request("/auth/local/login", "POST", { email, password });
    assert.equal(response.status, 200, await response.clone().text());
    assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
    assert.match(response.headers.get("set-cookie"), /Secure/i);
    assert.match(response.headers.get("set-cookie"), /SameSite=Lax/i);
    c.bootstrap = await (await c.api("/bootstrap")).json();
    c.csrf = c.bootstrap.csrf;
    return c;
  };
  const results = { date: new Date().toISOString(), runtime: "Local workerd + real SQLite Durable Object; isolated synthetic QA records", checks: [], load: [] };
  try {
    stub = await start();
    const unsigned = await client().api("/bootstrap");
    assert.equal(unsigned.status, 401, await unsigned.text());
    assert.equal((await client().request("/auth/local/login", "POST", { email: initialAccounts[0].email, password: "wrong" })).status, 401);
    const manager = await login(initialAccounts[0].email), coach = await login(initialAccounts[1].email);
    const one = await login(initialAccounts[2].email), two = await login(initialAccounts[3].email);
    const dashboard = await (await manager.api("/dashboard")).json();
    assert.equal(dashboard.activeMembers, 0);
    assert.equal((await one.api("/dashboard")).status, 403);
    assert.equal((await manager.api("/plans", "POST", {}, { "x-csrf-token": "forged" })).status, 403);
    const fresh = client();
    assert.equal((await fresh.request("/auth/local/register", "POST", { name: "QA Signup", email: "signup@qa.example", password, role: "manager" })).status, 201);
    assert.equal((await (await fresh.api("/bootstrap")).json()).user.role, "member");
    results.checks.push("Secure local login, wrong-password rejection, public signup cannot create staff, role/CSRF enforcement");

    assert.equal((await one.api("/memberships", "POST", { planId: 1 }, { "idempotency-key": "qa-member-one" })).status, 201);
    assert.equal((await one.api("/memberships", "POST", { planId: 1 }, { "idempotency-key": "qa-member-one" })).status, 201);
    assert.equal((await one.api("/memberships", "POST", { planId: 1 }, { "idempotency-key": "qa-member-repeat" })).status, 409);
    assert.equal((await two.api("/memberships", "POST", { planId: 1 }, { "idempotency-key": "qa-member-two" })).status, 201);
    const now = Date.now();
    const publish = async (offset, capacity, studio) => {
      const response = await coach.api("/classes", "POST", { title: "Isolated Cloudflare QA", type: "yoga", studio, starts: now + offset, ends: now + offset + 3600000, capacity });
      assert.equal(response.status, 201, await response.clone().text());
      return response.json();
    };
    const gymClass = await publish(4 * 3600000, 1, "qa-fifo");
    const b1 = await (await one.api("/bookings", "POST", { classId: gymClass.id })).json();
    const b2 = await (await two.api("/bookings", "POST", { classId: gymClass.id })).json();
    assert.equal(b1.state, "confirmed"); assert.equal(b2.state, "waitlisted");
    assert.equal((await one.api(`/bookings/${b1.id}/cancellation`, "POST", {})).status, 200);
    assert.equal((await (await two.api("/bookings")).json())[0].state, "confirmed");
    results.checks.push("Same-plan duplicate blocked; payment retry safe; full-class FIFO promotion is atomic");

    const storage = await mf.unsafeGetDurableObjectStorage("backend", "GymDatabase", { name: objectName });
    const qrClass = await publish(6 * 3600000, 3, "qa-qr");
    assert.equal((await one.api("/bookings", "POST", { classId: qrClass.id })).status, 201);
    const pass = await (await one.api("/membership-pass")).json();
    assert.match(pass.image, /^data:image\/png;base64,/);
    await storage.exec("UPDATE classes SET starts=?,ends=? WHERE id=?", Date.now() - 1000, Date.now() + 60000, qrClass.id);
    const scan = await coach.api("/class-qr-check-ins", "POST", { classId: qrClass.id, token: pass.token });
    assert.equal(scan.status, 200, await scan.clone().text());
    assert.equal((await scan.json()).checkedIn, true);
    assert.equal((await (await coach.api("/class-qr-check-ins", "POST", { classId: qrClass.id, token: pass.token })).json()).alreadyCheckedIn, true);
    const otherPass = await (await two.api("/membership-pass")).json();
    assert.equal((await coach.api("/class-qr-check-ins", "POST", { classId: qrClass.id, token: otherPass.token })).status, 422);
    await storage.exec("UPDATE memberships SET ends=? WHERE user_id=?", Date.now() - 1, one.bootstrap.user.id);
    assert.equal((await coach.api("/class-qr-check-ins", "POST", { classId: qrClass.id, token: pass.token })).status, 422);
    await storage.exec("UPDATE memberships SET ends=? WHERE user_id=?", Date.now() + 30 * 86400000, one.bootstrap.user.id);
    results.checks.push("Real QR PNG, assigned instructor scan, duplicate scan safe; missing booking and expired plan rejected");
    assert.equal((await coach.api(`/classes/${qrClass.id}/cancellation`, "POST", {})).status, 200);
    assert.equal((await manager.api(`/classes/${qrClass.id}/cancellation`, "POST", {})).status, 200);

    const ending = await publish(14 * 3600000, 2, "qa-background-alarm");
    for (const c of [one, two]) assert.equal((await c.api("/bookings", "POST", { classId: ending.id })).status, 201);
    const endedAt = Date.now() + 2000;
    await storage.exec("UPDATE classes SET starts=?,ends=? WHERE id=?", endedAt - 4000, endedAt, ending.id);
    await coach.api(`/classes/${ending.id}/roster`);
    // Reschedule through a genuine mutation, then leave HTTP completely idle.
    const currentPass = await (await one.api("/membership-pass")).json();
    assert.equal((await coach.api("/class-qr-check-ins", "POST", { classId: ending.id, token: currentPass.token })).status, 200);
    await new Promise(resolve => setTimeout(resolve, 3300));
    const completed = await storage.exec("SELECT user_id,state,no_show_at FROM bookings WHERE class_id=? ORDER BY user_id", ending.id);
    assert.equal(completed.find(b => b.user_id === one.bootstrap.user.id).state, "attended");
    assert.equal(completed.find(b => b.user_id === two.bootstrap.user.id).state, "no_show");
    assert.equal(completed.find(b => b.user_id === two.bootstrap.user.id).no_show_at, endedAt);
    results.checks.push("Background alarm finalizes attendance without browser requests; original end time retained");

    // Fixture access exists only in the local simulator, never in public APIs.
    const count = 300;
    await storage.exec("INSERT INTO users(id,name,email,role) VALUES " + Array.from({ length: count }, (_, i) => `('burst-${i}','Synthetic QA ${i}','burst-${i}@qa.example','member')`).join(","));
    await storage.exec("INSERT INTO memberships(user_id,plan_id,starts,ends,created) VALUES " + Array.from({ length: count }, (_, i) => `('burst-${i}',1,${now - 10000},${now + 30 * 86400000},${now})`).join(","));
    for (let i = 0; i < count; i++) {
      await storage.exec("INSERT INTO sessions VALUES (?,?,?,?)", createHash("sha256").update(`burst-token-${i}`).digest("hex"), `burst-${i}`, `burst-csrf-${i}`, now + 3600000);
    }
    for (const burst of [100, 300]) {
      const raceClass = await publish((burst === 100 ? 10 : 12) * 3600000, 20, "qa-race-" + burst);
      const requests = await Promise.all(Array.from({ length: burst }, (_, i) => (async () => {
        const c = client(`gp_session=burst-token-${i}`, `burst-csrf-${i}`), started = performance.now();
        const response = await c.api("/bookings", "POST", { classId: raceClass.id });
        const data = await response.json();
        return { status: response.status, state: data.state, ms: performance.now() - started };
      })()));
      assert.ok(requests.every(r => r.status === 201));
      assert.equal(requests.filter(r => r.state === "confirmed").length, 20);
      assert.equal(requests.filter(r => r.state === "waitlisted").length, burst - 20);
      const latency = requests.map(r => r.ms).sort((a, b) => a - b);
      results.load.push({ concurrentMembers: burst, capacity: 20, confirmed: 20, waiting: burst - 20, errors: 0, p95Ms: Math.round(latency[Math.ceil(burst * .95) - 1] * 100) / 100 });
      if (burst === 300) assert.ok(results.load.at(-1).p95Ms < 2000, JSON.stringify(results.load));
    }
    results.checks.push("100/300 simultaneous booking requests: no overbooking, zero request errors");
    const before = await storage.exec("SELECT password_hash FROM credentials WHERE user_id=?", manager.bootstrap.user.id);
    await mf.dispose(); mf = undefined;
    stub = await start();
    const managerAgain = await login(initialAccounts[0].email);
    assert.equal(managerAgain.bootstrap.user.id, manager.bootstrap.user.id);
    const afterStorage = await mf.unsafeGetDurableObjectStorage("backend", "GymDatabase", { name: objectName });
    assert.deepEqual(await afterStorage.exec("SELECT password_hash FROM credentials WHERE user_id=?", manager.bootstrap.user.id), before);
    assert.ok((await (await managerAgain.api("/classes")).json()).data.length >= 3);
    results.checks.push("Disk-backed restart preserves account IDs, password hashes and classes");
    await writeFile("evidence/cloudflare-runtime-checks.json", JSON.stringify(results, null, 2) + "\n");
    console.log(JSON.stringify(results));
  } finally {
    if (mf) await mf.dispose();
    await rm(folder, { recursive: true, force: true });
  }
});
