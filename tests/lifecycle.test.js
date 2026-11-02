import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase, seed } from "../src/db.js";
import { createService } from "../src/service.js";
import { startTestApp, login } from "./http-helpers.js";
import * as legacy from "../src/legacy-data.js";

const BASE = 1793548859999,
  HOUR = 3600000,
  DAY = 24 * HOUR;

test("normal startup has plans but no fabricated students, classes or memberships", async () => {
  const app = await startTestApp({ demo: false });
  try {
    for (const table of ["users", "classes", "memberships", "bookings"])
      assert.equal(
        app.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,
        0,
      );
    assert.equal(app.db.prepare("SELECT COUNT(*) n FROM plans").get().n, 3);
  } finally {
    await app.close();
  }
});

test("membership QR lasts two full minutes from issuance, even at a minute boundary", () => {
  const db = openDatabase(":memory:");
  let now = BASE;
  const s = createService(db, {
    clock: () => now,
    secret: "test-secret-longer-than-thirty-two-characters",
  });
  try {
    const token = s.makeToken("membership", "student");
    now += 119999;
    assert.equal(s.verifyToken(token, "membership").sub, "student");
    now++;
    assert.throws(
      () => s.verifyToken(token, "membership"),
      (e) => e.code === "EXPIRED_TOKEN",
    );
  } finally {
    db.close();
  }
});

test("assigned instructor and manager can cancel running classes; cancellation is idempotent and not absence", async () => {
  let now = BASE;
  const app = await startTestApp({ clock: () => now });
  try {
    app.db
      .prepare("UPDATE classes SET starts=?,ends=? WHERE id IN (1,2)")
      .run(BASE + HOUR, BASE + 2 * HOUR);
    app.service.book("member-1", 1);
    now += HOUR;
    const teacher = await login(app.origin, "instructor-1"),
      manager = await login(app.origin, "manager"),
      other = await login(app.origin, "instructor-2"),
      student = await login(app.origin);
    assert.equal((await teacher.api("/classes/1")).status, 200);
    assert.equal((await manager.api("/classes/1")).status, 200);
    assert.equal((await other.api("/classes/1")).status, 403);
    assert.equal((await student.api("/classes/1")).status, 403);
    assert.equal(
      (await other.api("/classes/1/cancellation", "POST")).status,
      403,
    );
    assert.equal(
      (await student.api("/classes/1/cancellation", "POST")).status,
      403,
    );
    assert.equal(
      (await teacher.api("/classes/1/cancellation", "POST")).status,
      200,
    );
    const timestamp = app.service.getClass(1).cancelled_at;
    now += 1000;
    assert.equal(
      (await teacher.api("/classes/1/cancellation", "POST")).status,
      200,
    );
    assert.equal(app.service.getClass(1).cancelled_at, timestamp);
    assert.equal(
      (await manager.api("/classes/2/cancellation", "POST")).status,
      200,
    );
    now = BASE + 3 * HOUR;
    app.service.tick();
    assert.equal(
      app.db.prepare("SELECT state FROM bookings WHERE class_id=1").get().state,
      "cancelled",
    );
    assert.equal(
      app.db
        .prepare(
          "SELECT COUNT(*) n FROM notifications WHERE kind='class_cancelled' AND user_id='member-1'",
        )
        .get().n,
      1,
    );
    assert.equal(
      (await manager.api("/classes/3/cancellation", "POST")).status,
      200,
    );
    app.db
      .prepare("UPDATE classes SET starts=?,ends=? WHERE id=4")
      .run(BASE, BASE + HOUR);
    assert.equal(
      (await manager.api("/classes/4/cancellation", "POST")).status,
      422,
    );
  } finally {
    await app.close();
  }
});

test("cancelled classes hide 24 hours after cancellation, completed classes 24 hours after end, without deleting history", async () => {
  let now = BASE;
  const app = await startTestApp({ clock: () => now });
  try {
    app.db
      .prepare("UPDATE classes SET starts=?,ends=? WHERE id=1")
      .run(BASE + 2 * DAY, BASE + 2 * DAY + HOUR);
    app.service.cancelClass({ id: "manager", role: "manager" }, 1);
    app.db
      .prepare("UPDATE classes SET starts=?,ends=? WHERE id=2")
      .run(BASE - HOUR, BASE);
    let manager;
    const ids = async () =>
      (await (await manager.api("/classes")).json()).data.map((c) => c.id);
    now = BASE + DAY - 1;
    manager = await login(app.origin, "manager");
    assert.ok((await ids()).includes(1));
    assert.ok((await ids()).includes(2));
    now++;
    assert.ok(!(await ids()).includes(1));
    assert.ok(!(await ids()).includes(2));
    assert.ok(app.service.getClass(1));
    assert.ok(app.service.getClass(2));
  } finally {
    await app.close();
  }
});

test("legacy cleanup removes seed fixtures and keeps registered accounts, purchases and manually published classes", () => {
  const db = openDatabase(":memory:");
  try {
    seed(db, BASE, { demo: true });
    db.exec(
      "INSERT INTO credentials VALUES ('member-1','preserved-hash',1); INSERT INTO users VALUES ('real','طالب مسجل','real@example.com','member'); INSERT INTO credentials VALUES ('real','preserved-real-hash',1)",
    );
    const s = createService(db, {
      clock: () => BASE,
      secret: "test-secret-longer-than-thirty-two-characters",
    });
    const bought = s.buy("real", "real", 1, "actual-purchase");
    const published = s.saveClass("instructor-1", {
      type: "yoga",
      title: "حصة منشورة",
      instructorId: "instructor-1",
      studio: "قاعة جديدة",
      starts: BASE + HOUR,
      ends: BASE + 2 * HOUR,
      capacity: 10,
    });
    legacy.cleanLegacyDemoData(db);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM users WHERE role='member'").get().n,
      2,
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM memberships").get().n, 1);
    assert.equal(db.prepare("SELECT id FROM memberships").get().id, bought.id);
    assert.equal(db.prepare("SELECT id FROM classes").get().id, published.id);
    assert.equal(
      db
        .prepare(
          "SELECT password_hash FROM credentials WHERE user_id='member-1'",
        )
        .get().password_hash,
      "preserved-hash",
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    legacy.cleanLegacyDemoData(db);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM classes").get().n, 1);
  } finally {
    db.close();
  }
});
