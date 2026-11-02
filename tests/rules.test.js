import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase, seed } from "../src/db.js";
import { createService } from "../src/service.js";

const BASE = Date.UTC(2026, 9, 31, 9);
function fixture() {
  const db = openDatabase(":memory:");
  seed(db, BASE, { demo: true });
  let time = BASE;
  const s = createService(db, {
    clock: () => time,
    secret: "test-secret-with-at-least-thirty-two-characters",
  });
  db.prepare("UPDATE classes SET starts=?, ends=?, capacity=2 WHERE id=1").run(
    BASE + 4 * 3600000,
    BASE + 5 * 3600000,
  );
  return { db, s, setTime: (t) => (time = t), close: () => db.close() };
}
test("capacity and FIFO promotion are atomic; duplicate booking is rejected", () => {
  const f = fixture();
  try {
    const a = f.s.book("member-1", 1),
      b = f.s.book("member-2", 1),
      c = f.s.book("member-3", 1);
    assert.equal(a.state, "confirmed");
    assert.equal(b.state, "confirmed");
    assert.equal(c.state, "waitlisted");
    assert.throws(() => f.s.book("member-1", 1), /already/i);
    f.s.cancel("member-1", a.id);
    assert.equal(
      f.db.prepare("SELECT state FROM bookings WHERE id=?").get(c.id).state,
      "confirmed",
    );
    assert.equal(
      f.db
        .prepare("SELECT COUNT(*) n FROM bookings WHERE state='confirmed'")
        .get().n,
      2,
    );
  } finally {
    f.close();
  }
});
test("48 hour window, expired membership and plan exclusions are enforced", () => {
  const f = fixture();
  try {
    f.db
      .prepare("UPDATE classes SET starts=?,ends=? WHERE id=1")
      .run(BASE + 49 * 3600000, BASE + 50 * 3600000);
    assert.throws(() => f.s.book("member-1", 1), /48/);
    f.db
      .prepare("UPDATE classes SET starts=?,ends=? WHERE id=1")
      .run(BASE + 4 * 3600000, BASE + 5 * 3600000);
    assert.throws(() => f.s.book("member-1400", 1), /membership/i);
    f.db
      .prepare("UPDATE memberships SET plan_id=3 WHERE user_id=?")
      .run("member-1");
    assert.throws(() => f.s.book("member-1", 1), /membership/i);
  } finally {
    f.close();
  }
});
test("cancellation cutoff is inclusive at two hours and rejects late cancellation", () => {
  const f = fixture();
  try {
    const a = f.s.book("member-1", 1),
      b = f.s.book("member-2", 1);
    f.setTime(BASE + 2 * 3600000);
    f.s.cancel("member-1", a.id);
    f.setTime(BASE + 2 * 3600000 + 1);
    assert.throws(() => f.s.cancel("member-2", b.id), /2 hours/);
  } finally {
    f.close();
  }
});
test("signed student QR records attendance only with a valid subscription and confirmed class booking", () => {
  const f = fixture();
  try {
    const b = f.s.book("member-1", 1);
    f.setTime(BASE + 4 * 3600000 + 40 * 60000);
    const actor = { id: "instructor-1", role: "instructor" },
      token = f.s.makeToken("membership", "member-1");
    assert.equal(f.s.scanAttendance(actor, 1, token).checkedIn, true);
    assert.equal(f.s.scanAttendance(actor, 1, token).alreadyCheckedIn, true);
    assert.equal(
      f.db.prepare("SELECT state FROM bookings WHERE id=?").get(b.id).state,
      "checked_in",
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
        f.s.scanAttendance(actor, 1, f.s.makeToken("membership", "member-2")),
      (e) => e.code === "NOT_BOOKED",
    );
    f.setTime(BASE + 4 * 3600000 + 42 * 60000);
    assert.throws(
      () => f.s.scanAttendance(actor, 1, token),
      (e) => e.code === "EXPIRED_TOKEN",
    );
    assert.throws(
      () => f.s.scanAttendance(actor, 1, token + "x"),
      (e) => e.code === "INVALID_TOKEN",
    );
  } finally {
    f.close();
  }
});
test("FIFO skips expired members and cancellation notifies both confirmed and waiting members", () => {
  const f = fixture();
  try {
    const a = f.s.book("member-1", 1);
    f.s.book("member-2", 1);
    const skipped = f.s.book("member-3", 1),
      next = f.s.book("member-4", 1);
    f.db
      .prepare("UPDATE memberships SET ends=? WHERE user_id=?")
      .run(BASE + 1000, "member-3");
    f.s.cancel("member-1", a.id);
    assert.equal(
      f.db.prepare("SELECT state FROM bookings WHERE id=?").get(skipped.id)
        .state,
      "not_promoted",
    );
    assert.equal(
      f.db.prepare("SELECT state FROM bookings WHERE id=?").get(next.id).state,
      "confirmed",
    );
    f.s.book("member-5", 1);
    f.s.cancelClass({ id: "instructor-1", role: "instructor" }, 1);
    assert.equal(
      f.db
        .prepare(
          "SELECT COUNT(*) n FROM bookings WHERE class_id=1 AND state IN ('confirmed','waitlisted')",
        )
        .get().n,
      0,
    );
    assert.equal(
      f.db
        .prepare(
          "SELECT COUNT(*) n FROM notifications WHERE kind='class_cancelled'",
        )
        .get().n,
      3,
    );
  } finally {
    f.close();
  }
});

test("promotion skips a member with an overlapping confirmed class", () => {
  const f = fixture();
  try {
    f.db
      .prepare("UPDATE classes SET starts=?,ends=? WHERE id=2")
      .run(BASE + 4 * 3600000, BASE + 5 * 3600000);
    const a = f.s.book("member-1", 1);
    f.s.book("member-2", 1);
    const overlap = f.s.book("member-3", 1),
      next = f.s.book("member-4", 1);
    f.s.book("member-3", 2);
    f.s.cancel("member-1", a.id);
    assert.equal(
      f.db.prepare("SELECT state FROM bookings WHERE id=?").get(overlap.id)
        .state,
      "not_promoted",
    );
    assert.equal(
      f.db.prepare("SELECT state FROM bookings WHERE id=?").get(next.id).state,
      "confirmed",
    );
  } finally {
    f.close();
  }
});

test("reminders deduplicate; unscanned confirmed bookings become absent at class end", () => {
  const f = fixture();
  try {
    const b = f.s.book("member-1", 1);
    f.setTime(BASE + 2 * 3600000);
    f.s.tick();
    f.s.tick();
    assert.equal(
      f.db
        .prepare(
          "SELECT COUNT(*) n FROM notifications WHERE kind='reminder' AND user_id='member-1'",
        )
        .get().n,
      1,
    );
    f.setTime(BASE + 6 * 3600000);
    f.s.tick();
    assert.equal(
      f.db.prepare("SELECT state FROM bookings WHERE id=?").get(b.id).state,
      "no_show",
    );
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM suspensions").get().n, 0);
  } finally {
    f.close();
  }
});
test("retention removes old members and their dependent records", () => {
  const f = fixture();
  try {
    f.db
      .prepare("UPDATE memberships SET starts=?,ends=? WHERE user_id=?")
      .run(BASE - 500 * 86400000, BASE - 366 * 86400000, "member-1500");
    f.s.tick();
    assert.equal(
      f.db.prepare("SELECT id FROM users WHERE id='member-1500'").get(),
      undefined,
    );
    assert.equal(f.db.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    f.close();
  }
});
