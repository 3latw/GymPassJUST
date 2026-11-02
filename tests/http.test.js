import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { startTestApp, login } from "./http-helpers.js";

test("HTTP API, actual OIDC redirects, authorisation, validation and role workflows", async (t) => {
  const app = await startTestApp();
  try {
    const member = await login(app.origin),
      manager = await login(app.origin, "manager"),
      instructor = await login(app.origin, "instructor-1");
    await t.test("unauthenticated and forged CSRF requests fail", async () => {
      assert.equal((await fetch(app.origin + "/api/bootstrap")).status, 401);
      assert.equal((await member.api("/dashboard")).status, 403);
      assert.equal(
        (
          await member.api(
            "/bookings",
            "POST",
            { classId: 1 },
            { "x-csrf-token": "forged" },
          )
        ).status,
        403,
      );
      assert.equal(
        (await fetch(app.origin + "/auth/callback?state=forged&code=forged"))
          .status,
        403,
      );
      assert.equal(
        (await fetch(app.origin + "/idp/authorize?client_id=evil")).status,
        422,
      );
      assert.equal(
        (
          await fetch(app.origin + "/idp/token", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: "code=fake",
          })
        ).status,
        400,
      );
    });
    await t.test(
      "membership purchases are idempotent and roles cannot choose another owner",
      async () => {
        const plans = await (await member.api("/plans")).json();
        assert.ok(plans.length >= 3);
        const headers = { "Idempotency-Key": "membership-test-001" };
        const first = await (
          await member.api(
            "/memberships",
            "POST",
            { planId: 1, userId: "member-2" },
            headers,
          )
        ).json();
        const second = await (
          await member.api("/memberships", "POST", { planId: 1 }, headers)
        ).json();
        assert.equal(first.id, second.id);
        assert.equal(first.user_id, "member-1");
        assert.equal(
          (await member.api("/memberships", "POST", { planId: 2 }, headers))
            .status,
          409,
        );
        assert.equal(
          (await member.api("/memberships", "POST", { planId: 1 })).status,
          422,
        );
        assert.ok((await (await member.api("/memberships")).json()).length > 0);
        assert.equal(
          (
            await manager.api(
              "/memberships",
              "POST",
              { planId: 1, userId: "member-1400" },
              { "Idempotency-Key": "desk-purchase-001" },
            )
          ).status,
          201,
        );
      },
    );
    await t.test(
      "timetable and capacity booking APIs protect duplicate requests",
      async () => {
        const result = await (
          await member.api("/classes?type=strength")
        ).json();
        assert.ok(result.data.length > 0);
        const c = result.data.find(
          (c) => c.starts > Date.now() && c.starts - Date.now() <= 48 * 3600000,
        );
        assert.ok(c);
        const booking = await (
          await member.api("/bookings", "POST", { classId: c.id })
        ).json();
        assert.equal(booking.state, "confirmed");
        assert.equal(
          (await member.api("/bookings", "POST", { classId: c.id })).status,
          409,
        );
        assert.equal(
          (await member.api("/bookings", "POST", { classId: "x" })).status,
          422,
        );
        assert.equal(
          (await member.api("/bookings/-1/cancellation", "POST")).status,
          422,
        );
        assert.equal(
          (await member.api(`/bookings/${booking.id}/cancellation`, "POST"))
            .status,
          200,
        );
        assert.equal(
          (await member.api(`/bookings/${booking.id}/cancellation`, "POST"))
            .status,
          422,
        );
        assert.ok((await (await member.api("/bookings")).json()).length > 0);
      },
    );
    await t.test(
      "only the assigned instructor scans QR to validate subscription and class booking",
      async () => {
        app.db
          .prepare("UPDATE classes SET starts=?,ends=? WHERE id=1")
          .run(Date.now() - 40 * 60000, Date.now() + 20 * 60000);
        app.db
          .prepare(
            "INSERT INTO bookings(user_id,class_id,state,created) VALUES ('member-1',1,'confirmed',?)",
          )
          .run(Date.now() - 3600000);
        const pass = await (await member.api("/membership-pass")).json();
        assert.ok(pass.image.startsWith("data:image/png"));
        assert.equal(
          (
            await member.api("/class-qr-check-ins", "POST", {
              classId: 1,
              token: pass.token,
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await manager.api("/class-qr-check-ins", "POST", {
              classId: 1,
              token: pass.token,
            })
          ).status,
          403,
        );
        const checked = await (
          await instructor.api("/class-qr-check-ins", "POST", {
            classId: 1,
            token: pass.token,
          })
        ).json();
        assert.equal(checked.checkedIn, true);
        assert.equal(checked.member.id, "member-1");
        assert.equal(
          (
            await instructor.api("/class-qr-check-ins", "POST", {
              classId: 1,
              token: "bad",
            })
          ).status,
          403,
        );
        assert.equal(
          (await member.api("/studio-check-in", "POST", { token: pass.token }))
            .status,
          404,
        );
        assert.equal(
          (await instructor.api("/classes/1/studio-pass")).status,
          404,
        );
      },
    );
    await t.test(
      "manager publishes plans and classes with boundary validation",
      async () => {
        assert.equal(
          (
            await manager.api("/plans", "POST", {
              name: "New Plan",
              price: 1000,
              days: 15,
              types: ["yoga"],
            })
          ).status,
          201,
        );
        assert.equal(
          (
            await manager.api("/plans", "POST", {
              name: "x",
              price: -1,
              days: 0,
              types: [],
            })
          ).status,
          422,
        );
        const c = {
          title: "Test Yoga",
          type: "yoga",
          studio: "Test studio",
          instructorId: "instructor-1",
          starts: Date.now() + 30 * 3600000,
          ends: Date.now() + 31 * 3600000,
          capacity: 2,
        };
        const result = await manager.api("/classes", "POST", c);
        assert.equal(result.status, 201);
        const { id } = await result.json();
        assert.equal((await manager.api("/classes", "POST", c)).status, 409);
        assert.equal(
          (await manager.api("/classes", "POST", { ...c, capacity: 0 })).status,
          422,
        );
        assert.equal(
          (await instructor.api(`/classes/${id}/roster`)).status,
          200,
        );
        assert.equal((await instructor.api("/classes/2/roster")).status, 403);
        assert.equal(
          (await instructor.api(`/classes/${id}/cancellation`, "POST")).status,
          200,
        );
        assert.equal(
          (await instructor.api("/classes/2/cancellation", "POST")).status,
          403,
        );
        assert.equal(
          (await instructor.api("/bookings/9999/check-in", "POST")).status,
          404,
        );
      },
    );
    await t.test(
      "member search, notifications, dashboard and audit",
      async () => {
        const result = await (await manager.api("/members?q=member-1")).json();
        assert.ok(result.data.length > 0);
        assert.ok(
          (await (await member.api("/notifications")).json()).data.length > 0,
        );
        assert.equal(
          (await member.api("/notifications/read", "POST")).status,
          200,
        );
        const d = await (await manager.api("/dashboard")).json();
        assert.ok(d.activeMembers >= 1200);
        assert.ok((await (await manager.api("/audit")).json()).data.length > 0);
        assert.equal((await member.api("/does-not-exist")).status, 404);
        assert.equal((await member.api("/logout", "POST")).status, 200);
        assert.equal((await member.api("/bootstrap")).status, 401);
      },
    );
  } finally {
    await app.close();
  }
});

test("FIFO promotion and its notification are visible through HTTP within one minute", async () => {
  const app = await startTestApp();
  try {
    app.db
      .prepare("UPDATE classes SET capacity=1,starts=?,ends=? WHERE id=1")
      .run(Date.now() + 4 * 3600000, Date.now() + 5 * 3600000);
    const first = await login(app.origin, "member-1"),
      waiting = await login(app.origin, "member-2");
    const confirmed = await (
      await first.api("/bookings", "POST", { classId: 1 })
    ).json();
    const queued = await (
      await waiting.api("/bookings", "POST", { classId: 1 })
    ).json();
    assert.equal(queued.state, "waitlisted");
    const started = performance.now();
    assert.equal(
      (await first.api(`/bookings/${confirmed.id}/cancellation`, "POST"))
        .status,
      200,
    );
    const history = await (await waiting.api("/bookings")).json(),
      inbox = await (await waiting.api("/notifications")).json();
    const elapsedMs = Number((performance.now() - started).toFixed(2));
    assert.equal(history.find((b) => b.id === queued.id).state, "confirmed");
    assert.ok(inbox.data.some((n) => n.kind === "promotion"));
    assert.ok(elapsedMs < 60000);
    mkdirSync("evidence", { recursive: true });
    writeFileSync(
      "evidence/promotion-results.json",
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          elapsedMs,
          limitMs: 60000,
          confirmed: true,
          notificationVisible: true,
          transport: "local HTTP with real cookie sessions",
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
});
