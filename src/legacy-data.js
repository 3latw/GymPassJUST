import { transaction } from "./db.js";

// Only legacy generator fingerprints are removed. A SQLite backup is made by
// the server first. Registered accounts and manually created records survive.
export function cleanLegacyDemoData(db) {
  const seeded = Number(
    db.prepare("SELECT value FROM metadata WHERE key='seeded_at'").get()?.value,
  );
  if (
    !seeded ||
    db.prepare("SELECT value FROM metadata WHERE key='live_data_v1'").get()
  )
    return;
  return transaction(db, () => {
    const day = new Date(seeded);
    day.setUTCHours(0, 0, 0, 0);
    const types = [
      ["strength", "قوة وتحمل"],
      ["yoga", "يوغا وتوازن"],
      ["spinning", "دراجات داخلية"],
      ["fitness", "لياقة بدنية"],
    ];
    let removedClasses = 0;
    for (let i = 0; i < 60; i++) {
      const [type, title] = types[i % 4];
      const starts =
        day.getTime() +
        86400000 * (1 + Math.floor(i / 10)) +
        (5 + (i % 10)) * 3600000;
      const c = db
        .prepare(
          "SELECT * FROM classes WHERE id=? AND type=? AND title=? AND instructor_id=? AND studio=? AND starts=? AND ends=? AND capacity=?",
        )
        .get(
          i + 1,
          type,
          title,
          `instructor-${1 + (i % 12)}`,
          `استوديو ${1 + (i % 3)}`,
          starts,
          starts + 3600000,
          i % 4 === 2 ? 12 : 20,
        );
      if (!c) continue;
      db.prepare(
        "DELETE FROM notifications WHERE dedup_key IN (SELECT 'class-cancel-'||id FROM bookings WHERE class_id=? UNION SELECT 'reminder-'||id FROM bookings WHERE class_id=? UNION SELECT 'no-show-'||id FROM bookings WHERE class_id=? UNION SELECT 'check-in-'||id FROM bookings WHERE class_id=?)",
      ).run(c.id, c.id, c.id, c.id);
      db.prepare("DELETE FROM bookings WHERE class_id=?").run(c.id);
      db.prepare("DELETE FROM classes WHERE id=?").run(c.id);
      removedClasses++;
    }
    const memberships = db
      .prepare(
        "DELETE FROM memberships WHERE plan_id=2 AND created=? AND starts=? AND user_id GLOB 'member-[0-9]*' AND NOT EXISTS (SELECT 1 FROM payments WHERE membership_id=memberships.id)",
      )
      .run(seeded - 30 * 86400000, seeded - 30 * 86400000).changes;
    const users = db
      .prepare(
        `DELETE FROM users WHERE
      ((id GLOB 'member-[0-9]*' AND email GLOB 'member[0-9]*@demo.just.edu.jo') OR
       (id GLOB 'instructor-[0-9]*' AND email GLOB 'instructor[0-9]*@demo.just.edu.jo'))
      AND NOT EXISTS (SELECT 1 FROM credentials WHERE user_id=users.id)
      AND NOT EXISTS (SELECT 1 FROM classes WHERE instructor_id=users.id)
      AND NOT EXISTS (SELECT 1 FROM payments p JOIN memberships m ON m.id=p.membership_id WHERE m.user_id=users.id)
      AND NOT EXISTS (SELECT 1 FROM suspensions WHERE overridden_by=users.id)`,
      )
      .run().changes;
    db.prepare("INSERT INTO metadata VALUES ('live_data_v1',?)").run(
      String(seeded),
    );
    return {
      removedClasses,
      removedMemberships: memberships,
      removedUsers: users,
    };
  });
}
