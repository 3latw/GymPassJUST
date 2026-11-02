export function transaction(db, fn) {
  if (db.transactionSync) return db.transactionSync(fn);
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
