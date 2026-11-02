import test from "node:test";
import assert from "node:assert/strict";
import { startTestApp } from "./http-helpers.js";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase, seed } from "../src/db.js";
import { provisionLocalAccounts } from "../src/local-auth.js";

const password = "A-test-password!2026";

test("existing databases migrate without losing bookings and bootstrap accounts survive restart", async () => {
  const folder = mkdtempSync(join(tmpdir(), "gympassjust-"));
  const path = join(folder, "test.db"),
    file = join(folder, "initial-accounts.json");
  let db;
  try {
    const legacy = new DatabaseSync(path);
    legacy.exec(
      "CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, role TEXT NOT NULL CHECK(role IN ('member','instructor','desk','manager')))",
    );
    legacy.close();
    db = openDatabase(path);
    seed(db, Date.now(), { demo: true });
    db.prepare(
      "INSERT INTO bookings(user_id,class_id,state,created) VALUES ('member-1',1,'confirmed',?)",
    ).run(Date.now());
    const users = db.prepare("SELECT COUNT(*) n FROM users").get().n;
    await provisionLocalAccounts(db, file, Date.now);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM credentials").get().n, 4);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get().n, users);
    const hash = db
      .prepare("SELECT password_hash FROM credentials WHERE user_id='manager'")
      .get().password_hash;
    assert.equal(
      db.prepare("SELECT state FROM bookings WHERE id=1").get().state,
      "confirmed",
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    assert.ok(manifest.every((a) => a.password.length >= 12));
    db.close();
    db = openDatabase(path);
    await provisionLocalAccounts(db, file, Date.now);
    assert.equal(
      db
        .prepare(
          "SELECT password_hash FROM credentials WHERE user_id='manager'",
        )
        .get().password_hash,
      hash,
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM credentials").get().n, 4);
  } finally {
    db?.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
async function account(app, email, name = "طالب جديد") {
  const send = (path, body, headers = {}) =>
    fetch(app.origin + path, {
      method: "POST",
      headers: {
        origin: app.origin,
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      redirect: "manual",
    });
  const registered = await send("/auth/local/register", {
    name,
    email,
    password,
    role: "manager",
  });
  assert.equal(registered.status, 201);
  const cookie = registered.headers.getSetCookie()[0].split(";")[0];
  const bootstrap = await (
    await fetch(app.origin + "/api/bootstrap", { headers: { cookie } })
  ).json();
  return {
    bootstrap,
    cookie,
    send,
    api: (path, body, method = "POST") =>
      fetch(app.origin + "/api" + path, {
        method,
        headers: {
          cookie,
          origin: app.origin,
          "x-csrf-token": bootstrap.csrf,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
  };
}

test("real local registration, credential checks, session rotation, role boundaries and password change", async () => {
  const app = await startTestApp({ demo: false });
  try {
    const a = await account(app, "Student@Test.local");
    assert.equal(a.bootstrap.user.role, "member");
    assert.equal(a.bootstrap.user.email, "student@test.local");
    const row = app.db
      .prepare("SELECT * FROM credentials WHERE user_id=?")
      .get(a.bootstrap.user.id);
    assert.ok(row.password_hash.startsWith("scrypt$"));
    assert.ok(!row.password_hash.includes(password));
    assert.equal(
      (
        await a.send("/auth/local/register", {
          name: "Other",
          email: "STUDENT@test.local",
          password,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await a.send("/auth/local/login", {
          email: "student@test.local",
          password: "wrong",
        })
      ).status,
      401,
    );
    const logged = await a.send("/auth/local/login", {
      email: "STUDENT@test.local",
      password,
    });
    assert.equal(logged.status, 200);
    assert.match(logged.headers.get("set-cookie"), /HttpOnly/);
    assert.notEqual(logged.headers.get("set-cookie").split(";")[0], a.cookie);
    assert.equal(
      (
        await a.send(
          "/auth/local/login",
          { email: "student@test.local", password },
          { origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await a.api("/accounts", {
          name: "Admin",
          email: "admin@test.local",
          password,
          role: "manager",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await a.api("/account/password", {
          currentPassword: "bad",
          password: "New-password!2027",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await a.api("/account/password", {
          currentPassword: password,
          password: "New-password!2027",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(app.origin + "/api/bootstrap", {
          headers: { cookie: a.cookie },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await a.send("/auth/local/login", {
          email: "student@test.local",
          password,
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await a.send("/auth/local/login", {
          email: "student@test.local",
          password: "New-password!2027",
        })
      ).status,
      200,
    );
    for (let i = 0; i < 12; i++)
      await a.send("/auth/local/login", {
        email: "missing@test.local",
        password,
      });
    assert.equal(
      (
        await a.send("/auth/local/login", {
          email: "missing@test.local",
          password,
        })
      ).status,
      429,
    );
    assert.equal((await fetch(app.origin + "/login")).status, 200);
    assert.equal((await fetch(app.origin + "/student/membership")).status, 200);
    assert.equal((await fetch(app.origin + "/idp/authorize")).status, 404);
  } finally {
    await app.close();
  }
});

test("manager provisions staff and an instructor publishes only their own class for student booking", async () => {
  const app = await startTestApp({ demo: false });
  try {
    const manager = await account(app, "owner@test.local", "المدير");
    app.db
      .prepare("UPDATE users SET role='manager' WHERE id=?")
      .run(manager.bootstrap.user.id);
    const created = await manager.api("/accounts", {
      name: "مدرب جديد",
      email: "coach@test.local",
      password,
      role: "instructor",
    });
    assert.equal(created.status, 201);
    const coach = await created.json();
    assert.equal(coach.password_hash, undefined);
    const login = await manager.send("/auth/local/login", {
      email: "coach@test.local",
      password,
    });
    const cookie = login.headers.getSetCookie()[0].split(";")[0];
    const boot = await (
      await fetch(app.origin + "/api/bootstrap", { headers: { cookie } })
    ).json();
    const publish = (body) =>
      fetch(app.origin + "/api/classes", {
        method: "POST",
        headers: {
          cookie,
          origin: app.origin,
          "x-csrf-token": boot.csrf,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const c = {
      title: "حصة المدرب الجديدة",
      type: "yoga",
      studio: "قاعة الاختبار",
      capacity: 10,
      starts: Date.now() + 24 * 3600000,
      ends: Date.now() + 25 * 3600000,
      instructorId: "instructor-2",
    };
    const result = await publish(c);
    assert.equal(result.status, 201);
    const { id } = await result.json();
    assert.equal(app.service.getClass(id).instructor_id, coach.id);
    assert.equal((await publish(c)).status, 409);
    const student = await account(app, "newstudent@test.local");
    assert.equal((await student.api("/classes", c)).status, 403);
    const listed = await (
      await student.api("/classes", undefined, "GET")
    ).json();
    assert.ok(
      listed.data.some((x) => x.id === id && x.instructor === "مدرب جديد"),
    );
    await student.api("/memberships", { planId: 1 }); // no idempotency header: must be rejected
    app.service.buy(
      student.bootstrap.user.id,
      student.bootstrap.user.id,
      1,
      "new-user-membership-test",
    );
    assert.equal((await student.api("/bookings", { classId: id })).status, 201);
    assert.equal(
      (await student.api("/classes/" + id + "/roster", undefined, "GET"))
        .status,
      403,
    );
    for (const role of ["security", "desk"])
      assert.equal(
        (
          await manager.api("/accounts", {
            name: "Removed role",
            email: role + "@test.local",
            password,
            role,
          })
        ).status,
        422,
      );
    assert.equal(
      (await manager.api("/accounts", undefined, "GET")).status,
      200,
    );
  } finally {
    await app.close();
  }
});
