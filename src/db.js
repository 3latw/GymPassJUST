import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDatabase(path = "data/gympass.db") {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('member','instructor','desk','manager','security')));
    CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>=0),
      days INTEGER NOT NULL CHECK(days>0), types TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS memberships (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id INTEGER NOT NULL REFERENCES plans(id), starts INTEGER NOT NULL, ends INTEGER NOT NULL CHECK(ends>starts),
      created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY, membership_id INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL, reference TEXT UNIQUE NOT NULL, created INTEGER NOT NULL, method TEXT NOT NULL DEFAULT 'simulated');
    CREATE TABLE IF NOT EXISTS classes (id INTEGER PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL,
      instructor_id TEXT NOT NULL REFERENCES users(id), studio TEXT NOT NULL, starts INTEGER NOT NULL,
      ends INTEGER NOT NULL CHECK(ends>starts), capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 500),
      state TEXT NOT NULL DEFAULT 'published' CHECK(state IN ('published','cancelled')));
    CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id), state TEXT NOT NULL CHECK(state IN
      ('confirmed','waitlisted','cancelled','checked_in','attended','no_show','not_promoted')),
      created INTEGER NOT NULL, confirmed_at INTEGER, checked_at INTEGER, no_show_at INTEGER);
    CREATE UNIQUE INDEX IF NOT EXISTS booking_once ON bookings(user_id,class_id)
      WHERE state IN ('confirmed','waitlisted','checked_in','attended','no_show');
    CREATE INDEX IF NOT EXISTS booking_queue ON bookings(class_id,state,created,id);
    CREATE TRIGGER IF NOT EXISTS booking_capacity_insert BEFORE INSERT ON bookings
      WHEN NEW.state IN ('confirmed','checked_in') AND
      (SELECT COUNT(*) FROM bookings WHERE class_id=NEW.class_id AND state IN ('confirmed','checked_in','attended')) >=
      (SELECT capacity FROM classes WHERE id=NEW.class_id)
      BEGIN SELECT RAISE(ABORT, 'class_capacity'); END;
    CREATE TRIGGER IF NOT EXISTS booking_capacity_update BEFORE UPDATE OF state ON bookings
      WHEN NEW.state IN ('confirmed','checked_in') AND OLD.state NOT IN ('confirmed','checked_in','attended') AND
      (SELECT COUNT(*) FROM bookings WHERE class_id=NEW.class_id AND state IN ('confirmed','checked_in','attended')) >=
      (SELECT capacity FROM classes WHERE id=NEW.class_id)
      BEGIN SELECT RAISE(ABORT, 'class_capacity'); END;
    CREATE TABLE IF NOT EXISTS suspensions (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      starts INTEGER NOT NULL, ends INTEGER NOT NULL, reason TEXT NOT NULL, event_id INTEGER UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      overridden_by TEXT REFERENCES users(id), override_reason TEXT, overridden_at INTEGER);
    CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, message TEXT NOT NULL, created INTEGER NOT NULL, read_at INTEGER, dedup_key TEXT UNIQUE);
    CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created INTEGER NOT NULL, gate TEXT NOT NULL, result TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS used_tokens (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL,
      target TEXT NOT NULL, created INTEGER NOT NULL, detail TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS credentials (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL, updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_attempts (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
  `);
  // Preserve existing projects while adding the dedicated gate-security role.
  if (
    !db
      .prepare("SELECT sql FROM sqlite_master WHERE name='users'")
      .get()
      .sql.includes("'security'")
  ) {
    db.exec(`PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;
      CREATE TABLE users_new (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('member','instructor','desk','manager','security')));
      INSERT INTO users_new SELECT * FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      COMMIT; PRAGMA foreign_keys=ON;`);
  }
  if (
    !db
      .prepare("PRAGMA table_info(classes)")
      .all()
      .some((c) => c.name === "cancelled_at")
  ) {
    db.exec("ALTER TABLE classes ADD COLUMN cancelled_at INTEGER");
    // For old cancellations, use their audit event rather than their future end.
    db.exec(
      "UPDATE classes SET cancelled_at=COALESCE((SELECT MIN(created) FROM audit WHERE action='class.cancel' AND target=CAST(classes.id AS TEXT)),ends) WHERE state='cancelled'",
    );
  }
  return db;
}

export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function seed(db, now = Date.now(), { demo = false } = {}) {
  if (!demo) {
    const plans = [
      [
        1,
        "الاشتراك الشهري",
        2000,
        30,
        '["strength","yoga","spinning","fitness"]',
      ],
      [
        2,
        "اشتراك الفصل الدراسي",
        6500,
        120,
        '["strength","yoga","spinning","fitness"]',
      ],
      [3, "باقة اليوغا", 1500, 30, '["yoga"]'],
    ];
    transaction(db, () => {
      for (const p of plans)
        db.prepare("INSERT OR IGNORE INTO plans VALUES (?,?,?,?,?)").run(...p);
    });
    return;
  }
  if (db.prepare("SELECT COUNT(*) AS n FROM users").get().n) return;
  transaction(db, () => {
    const user = db.prepare("INSERT INTO users VALUES (?,?,?,?)");
    user.run("manager", "مدير المركز", "manager@demo.just.edu.jo", "manager");
    for (let i = 1; i <= 12; i++)
      user.run(
        `instructor-${i}`,
        `المدرب ${i}`,
        `instructor${i}@demo.just.edu.jo`,
        "instructor",
      );
    for (let i = 1; i <= 1500; i++)
      user.run(
        `member-${i}`,
        i === 1 ? "أحمد خالد" : i === 2 ? "سارة محمد" : `عضو تجريبي ${i}`,
        `member${i}@demo.just.edu.jo`,
        "member",
      );
    db.prepare("INSERT INTO plans VALUES (1,?,?,?,?)").run(
      "الاشتراك الشهري",
      2000,
      30,
      '["strength","yoga","spinning","fitness"]',
    );
    db.prepare("INSERT INTO plans VALUES (2,?,?,?,?)").run(
      "اشتراك الفصل الدراسي",
      6500,
      120,
      '["strength","yoga","spinning","fitness"]',
    );
    db.prepare("INSERT INTO plans VALUES (3,?,?,?,?)").run(
      "باقة اليوغا",
      1500,
      30,
      '["yoga"]',
    );
    const membership = db.prepare(
      "INSERT INTO memberships (user_id,plan_id,starts,ends,created) VALUES (?,2,?,?,?)",
    );
    for (let i = 1; i <= 1500; i++)
      membership.run(
        `member-${i}`,
        now - 86400000 * 30,
        now + 86400000 * (i <= 1200 ? 60 : -1),
        now - 86400000 * 30,
      );
    const add = db.prepare(
      "INSERT INTO classes (type,title,instructor_id,studio,starts,ends,capacity) VALUES (?,?,?,?,?,?,?)",
    );
    const types = [
      ["strength", "قوة وتحمل"],
      ["yoga", "يوغا وتوازن"],
      ["spinning", "دراجات داخلية"],
      ["fitness", "لياقة بدنية"],
    ];
    const day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    for (let i = 0; i < 60; i++) {
      const [type, title] = types[i % 4],
        starts =
          day.getTime() +
          86400000 * (1 + Math.floor(i / 10)) +
          (5 + (i % 10)) * 3600000;
      add.run(
        type,
        title,
        `instructor-${1 + (i % 12)}`,
        `استوديو ${1 + (i % 3)}`,
        starts,
        starts + 3600000,
        i % 4 === 2 ? 12 : 20,
      );
    }
    db.prepare("INSERT INTO metadata VALUES (?,?)").run(
      "seeded_at",
      String(now),
    );
  });
}
