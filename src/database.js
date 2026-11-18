import { classTypes } from "../public/class-types.js";

export function transaction(db, fn) {
  if (db.transactionSync) {
    return db.transactionSync(fn);
  }
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

function seedPlans(db) {
  const allTypes = JSON.stringify(classTypes);
  const insertDefault = db.prepare(
    "INSERT OR IGNORE INTO plans(id,name,price,days,types) VALUES (?,?,?,?,?)",
  );
  insertDefault.run(1, "الاشتراك الشهري", 2000, 30, allTypes);
  insertDefault.run(2, "اشتراك الفصل الدراسي", 6500, 120, allTypes);
  insertDefault.run(3, "باقة اليوغا", 1500, 30, '["yoga"]');

  if (db.prepare("SELECT 1 FROM metadata WHERE key='class_catalog_v2'").get()) {
    return;
  }

  // Keep existing plan and class IDs so subscriptions and bookings stay linked.
  const previousTypes = ["strength", "yoga", "spinning", "fitness"];
  const updatePlan = db.prepare("UPDATE plans SET types=? WHERE id=?");
  for (const { id, types } of db.prepare("SELECT id,types FROM plans").all()) {
    const includedTypes = JSON.parse(types);
    if (!includedTypes.includes("spinning")) {
      continue;
    }
    const wasGeneralPlan =
      (id === 1 || id === 2) &&
      includedTypes.length === previousTypes.length &&
      previousTypes.every((type) => includedTypes.includes(type));
    const updatedTypes = includedTypes.map((type) =>
      type === "spinning" ? "cardio" : type,
    );
    updatePlan.run(
      wasGeneralPlan ? allTypes : JSON.stringify([...new Set(updatedTypes)]),
      id,
    );
  }
  db.prepare("UPDATE classes SET type='cardio' WHERE type='spinning'").run();

  const specialistPlans = [
    ["باقة القوة ورفع الأثقال", ["strength", "weightlifting"]],
    ["باقة اللياقة والكارديو", ["fitness", "cardio"]],
    ["باقة السباحة", ["swimming"]],
    ["باقة الرياضات الجماعية", ["team_sports"]],
  ];
  const insertPlan = db.prepare(
    "INSERT INTO plans(name,price,days,types) VALUES (?,?,?,?)",
  );
  for (const [name, types] of specialistPlans) {
    insertPlan.run(name, 1500, 30, JSON.stringify(types));
  }

  db.prepare("INSERT INTO metadata VALUES ('class_catalog_v2','1')").run();
}

export function seed(db, now = Date.now(), { demo = false } = {}) {
  transaction(db, () => {
    seedPlans(db);
    if (!demo || db.prepare("SELECT COUNT(*) AS n FROM users").get().n) {
      return;
    }
    const user = db.prepare("INSERT INTO users VALUES (?,?,?,?)");
    user.run("manager", "مدير المركز", "manager@demo.just.edu.jo", "manager");
    for (let i = 1; i <= 12; i++) {
      user.run(
        `instructor-${i}`,
        `المدرب ${i}`,
        `instructor${i}@demo.just.edu.jo`,
        "instructor",
      );
    }
    for (let i = 1; i <= 1500; i++) {
      user.run(
        `member-${i}`,
        i === 1 ? "أحمد خالد" : i === 2 ? "سارة محمد" : `عضو تجريبي ${i}`,
        `member${i}@demo.just.edu.jo`,
        "member",
      );
    }
    const membership = db.prepare(
      "INSERT INTO memberships (user_id,plan_id,starts,ends,created) VALUES (?,2,?,?,?)",
    );
    for (let i = 1; i <= 1500; i++) {
      membership.run(
        `member-${i}`,
        now - 86400000 * 30,
        now + 86400000 * (i <= 1200 ? 60 : -1),
        now - 86400000 * 30,
      );
    }
    const add = db.prepare(
      "INSERT INTO classes (type,title,instructor_id,studio,starts,ends,capacity) VALUES (?,?,?,?,?,?,?)",
    );
    const types = [
      ["strength", "قوة وتحمل"],
      ["yoga", "يوغا وتوازن"],
      ["cardio", "دراجات داخلية"],
      ["fitness", "لياقة بدنية"],
    ];
    const day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    for (let i = 0; i < 60; i++) {
      const [type, title] = types[i % 4];
      const starts =
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
