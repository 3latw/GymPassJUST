import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase, seed } from "../src/db.js";
import { createService } from "../src/service.js";
import { startTestApp, login } from "./http-helpers.js";

const BASE = Date.now(),
  HOUR = 3600000;
function fixture() {
  const db = openDatabase(":memory:");
  seed(db, BASE, { demo: true });
  let now = BASE;
  const s = createService(db, {
    clock: () => now,
    secret: "a-test-only-secret-for-this-isolated-suite",
  });
  db.prepare("UPDATE classes SET starts=?,ends=?,capacity=3 WHERE id=1").run(
    BASE + HOUR,
    BASE + 2 * HOUR,
  );
  return { db, s, at: (t) => (now = t), close: () => db.close() };
}
test("QR attendance requires both active subscription and a confirmed booking, throughout the class", () => {
  const f = fixture();
  try {
    const actor = { id: "instructor-1", role: "instructor" },
      b = f.s.book("member-1", 1),
      missed = f.s.book("member-2", 1);
    f.at(BASE + HOUR - 1);
    assert.throws(
      () =>
        f.s.scanAttendance(actor, 1, f.s.makeToken("membership", "member-1")),
      (e) => e.code === "CHECKIN_WINDOW",
    );
    f.at(BASE + HOUR + 40 * 60000);
    f.s.tick();
    assert.equal(
      f.db.prepare("SELECT state FROM bookings WHERE id=?").get(b.id).state,
      "confirmed",
    );
    assert.throws(
      () =>
        f.s.scanAttendance(actor, 1, f.s.makeToken("membership", "member-3")),
      (e) => e.code === "NOT_BOOKED",
    );
    assert.throws(
      () =>
        f.s.scanAttendance(
          actor,
          1,
          f.s.makeToken("membership", "member-1400"),
        ),
      (e) => e.code === "MEMBERSHIP_REQUIRED",
    );
    assert.throws(
      () =>
        f.s.scanAttendance(
          { id: "instructor-2", role: "instructor" },
          1,
          f.s.makeToken("membership", "member-1"),
        ),
      (e) => e.code === "FORBIDDEN",
    );
    assert.equal(
      f.db
        .prepare("SELECT COUNT(*) n FROM bookings WHERE checked_at IS NOT NULL")
        .get().n,
      0,
    );
    f.at(BASE + 2 * HOUR - 1);
    const token = f.s.makeToken("membership", "member-1");
    assert.equal(f.s.scanAttendance(actor, 1, token).checkedIn, true);
    assert.equal(f.s.scanAttendance(actor, 1, token).alreadyCheckedIn, true);
    assert.equal(
      f.db
        .prepare("SELECT COUNT(*) n FROM audit WHERE action='attendance.qr'")
        .get().n,
      1,
    );
    f.at(BASE + 2 * HOUR);
    assert.throws(
      () => f.s.scanAttendance(actor, 1, token),
      (e) => e.code === "CHECKIN_WINDOW",
    );
    f.s.tick();
    f.s.tick();
    assert.equal(
      f.db.prepare("SELECT state FROM bookings WHERE id=?").get(b.id).state,
      "attended",
    );
    assert.equal(
      f.db.prepare("SELECT state FROM bookings WHERE id=?").get(missed.id)
        .state,
      "no_show",
    );
    assert.equal(
      f.db.prepare("SELECT no_show_at FROM bookings WHERE id=?").get(missed.id)
        .no_show_at,
      BASE + 2 * HOUR,
    );
    assert.equal(
      f.db
        .prepare("SELECT COUNT(*) n FROM notifications WHERE kind='no_show'")
        .get().n,
      1,
    );
  } finally {
    f.close();
  }
});
test("QR attendance rejects a membership that expires or excludes the selected class", () => {
  const f = fixture();
  try {
    const b = f.s.book("member-1", 1),
      actor = { id: "instructor-1", role: "instructor" };
    f.at(BASE + HOUR);
    const token = f.s.makeToken("membership", "member-1");
    f.db
      .prepare("UPDATE memberships SET plan_id=3 WHERE user_id='member-1'")
      .run();
    assert.throws(
      () => f.s.scanAttendance(actor, 1, token),
      (e) => e.code === "MEMBERSHIP_REQUIRED",
    );
    f.db
      .prepare(
        "UPDATE memberships SET plan_id=2,ends=? WHERE user_id='member-1'",
      )
      .run(BASE + HOUR - 1);
    assert.throws(
      () => f.s.scanAttendance(actor, 1, token),
      (e) => e.code === "MEMBERSHIP_REQUIRED",
    );
    assert.equal(
      f.db.prepare("SELECT state FROM bookings WHERE id=?").get(b.id).state,
      "confirmed",
    );
  } finally {
    f.close();
  }
});
test("an active or queued plan cannot be bought twice; retries are idempotent and expiry allows another purchase", () => {
  const f = fixture();
  try {
    const first = f.s.buy("member-1", "member-1", 1, "first-payment");
    assert.equal(
      f.s.buy("member-1", "member-1", 1, "first-payment").id,
      first.id,
    );
    assert.throws(
      () => f.s.buy("member-1", "member-1", 1, "second-payment"),
      (e) => e.code === "ALREADY_SUBSCRIBED",
    );
    assert.equal(
      f.db
        .prepare("SELECT COUNT(*) n FROM payments WHERE membership_id=?")
        .get(first.id).n,
      1,
    );
    f.at(first.ends);
    assert.ok(f.s.buy("member-1", "member-1", 1, "after-expiry").id > first.id);
  } finally {
    f.close();
  }
});
test("only the instructor can submit class QR; manual student check-in endpoints are absent", async () => {
  let now = BASE;
  const app = await startTestApp({ clock: () => now });
  try {
    app.db
      .prepare("UPDATE classes SET starts=?,ends=? WHERE id=1")
      .run(BASE + HOUR, BASE + 2 * HOUR);
    const student = await login(app.origin),
      teacher = await login(app.origin, "instructor-1"),
      other = await login(app.origin, "member-2");
    const b = await (
      await student.api("/bookings", "POST", { classId: 1 })
    ).json();
    now = BASE + HOUR + 40 * 60000;
    const pass = await (await student.api("/membership-pass")).json(),
      payload = { classId: 1, token: pass.token };
    assert.equal(
      (await student.api("/class-qr-check-ins", "POST", payload)).status,
      403,
    );
    assert.equal(
      (await teacher.api("/class-qr-check-ins", "POST", payload)).status,
      200,
    );
    const otherPass = await (await other.api("/membership-pass")).json();
    assert.equal(
      (
        await teacher.api("/class-qr-check-ins", "POST", {
          classId: 1,
          token: otherPass.token,
        })
      ).status,
      422,
    );
    assert.equal(
      (await student.api(`/bookings/${b.id}/check-in`, "POST")).status,
      404,
    );
    assert.equal(
      (await student.api("/studio-check-in", "POST", { token: pass.token }))
        .status,
      404,
    );
  } finally {
    await app.close();
  }
});
