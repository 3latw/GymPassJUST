export function initializeDatabase(db) {
  db.exec(`
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
