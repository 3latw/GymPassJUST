import {
  createHmac,
  createHash,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { transaction } from "./db.js";

export class AppError extends Error {
  constructor(code, message, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export const fail = (condition, code, message, status) => {
  if (condition) throw new AppError(code, message, status);
};
const MINUTE = 60000,
  HOUR = 60 * MINUTE,
  DAY = 24 * HOUR;

export function createService(db, { clock = Date.now, secret } = {}) {
  if (!secret || secret.length < 32)
    throw new Error("A signing secret of at least 32 characters is required");
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const atomic = (fn) => transaction(db, fn);
  const audit = (actor, action, target, detail = "") =>
    run(
      "INSERT INTO audit(actor,action,target,created,detail) VALUES (?,?,?,?,?)",
      actor,
      action,
      String(target),
      clock(),
      detail,
    );
  const notify = (user, kind, message, key) =>
    run(
      "INSERT OR IGNORE INTO notifications(user_id,kind,message,created,dedup_key) VALUES (?,?,?,?,?)",
      user,
      kind,
      message,
      clock(),
      key,
    );
  const getClass = (id) => {
    const c = one("SELECT * FROM classes WHERE id=?", id);
    fail(!c, "NOT_FOUND", "Class not found", 404);
    return c;
  };
  function membership(id, at = clock(), type = null, through = at) {
    return all(
      `SELECT m.*, p.name,p.types FROM memberships m JOIN plans p ON p.id=m.plan_id
      WHERE user_id=? AND starts<=? AND ends>? ORDER BY ends DESC`,
      id,
      at,
      through,
    ).find((m) => !type || JSON.parse(m.types).includes(type));
  }
  const eligible = (id, c) =>
    Boolean(
      membership(id, clock(), c.type, c.ends) &&
        !one(
          `SELECT b.id FROM bookings b JOIN classes x ON x.id=b.class_id WHERE b.user_id=? AND b.class_id<>? AND b.state IN ('confirmed','checked_in') AND x.starts<? AND x.ends>?`,
          id,
          c.id,
          c.ends,
          c.starts,
        ),
    );
  function promote(classId) {
    const c = getClass(classId);
    if (c.state !== "published" || clock() >= c.ends) return;
    let free =
      c.capacity -
      one(
        "SELECT COUNT(*) n FROM bookings WHERE class_id=? AND state IN ('confirmed','checked_in','attended')",
        classId,
      ).n;
    for (const b of all(
      "SELECT * FROM bookings WHERE class_id=? AND state='waitlisted' ORDER BY created,id",
      classId,
    )) {
      if (free <= 0) break;
      if (!eligible(b.user_id, c)) {
        run("UPDATE bookings SET state='not_promoted' WHERE id=?", b.id);
        notify(
          b.user_id,
          "waitlist",
          "تعذرت ترقية حجزك بسبب حالة العضوية أو تعارض الموعد.",
          `skip-${b.id}`,
        );
        continue;
      }
      run(
        "UPDATE bookings SET state='confirmed',confirmed_at=? WHERE id=?",
        clock(),
        b.id,
      );
      free--;
      notify(
        b.user_id,
        "promotion",
        `أصبح حجزك مؤكداً في ${c.title}.`,
        `promote-${b.id}`,
      );
    }
  }
  function book(userId, classId) {
    return atomic(() => {
      const c = getClass(classId),
        now = clock();
      fail(
        c.state !== "published" || now >= c.starts,
        "CLASS_CLOSED",
        "Class is no longer open for booking",
      );
      fail(
        now < c.starts - 48 * HOUR,
        "BOOKING_WINDOW",
        "Booking opens 48 hours before class",
      );
      fail(
        !membership(userId, now, c.type, c.ends),
        "MEMBERSHIP_REQUIRED",
        "An active membership covering this class is required",
      );
      fail(
        one(
          "SELECT id FROM bookings WHERE user_id=? AND class_id=? AND state IN ('confirmed','waitlisted','checked_in','attended','no_show')",
          userId,
          classId,
        ),
        "DUPLICATE",
        "You already booked this class",
        409,
      );
      fail(
        one(
          `SELECT b.id FROM bookings b JOIN classes c ON c.id=b.class_id WHERE b.user_id=?
      AND b.state IN ('confirmed','checked_in') AND c.starts<? AND c.ends>?`,
          userId,
          c.ends,
          c.starts,
        ),
        "OVERLAP",
        "You already have a booking at this time",
        409,
      );
      const count = one(
        "SELECT COUNT(*) n FROM bookings WHERE class_id=? AND state IN ('confirmed','checked_in','attended')",
        classId,
      ).n;
      const state = count < c.capacity ? "confirmed" : "waitlisted";
      const result = run(
        "INSERT INTO bookings(user_id,class_id,state,created,confirmed_at) VALUES (?,?,?,?,?)",
        userId,
        classId,
        state,
        now,
        state === "confirmed" ? now : null,
      );
      const id = Number(result.lastInsertRowid);
      notify(
        userId,
        state,
        state === "confirmed"
          ? `تم تأكيد حجز ${c.title}.`
          : `أُضيف اسمك لقائمة انتظار ${c.title}.`,
        `booking-${id}`,
      );
      return { id, state };
    });
  }
  function cancel(userId, bookingId) {
    return atomic(() => {
      const b = one(
        "SELECT * FROM bookings WHERE id=? AND user_id=?",
        bookingId,
        userId,
      );
      fail(!b, "NOT_FOUND", "Booking not found", 404);
      fail(
        !["confirmed", "waitlisted"].includes(b.state),
        "INVALID_STATE",
        "This booking cannot be cancelled",
      );
      const c = getClass(b.class_id);
      fail(
        clock() > c.starts - 2 * HOUR,
        "CANCELLATION_CUTOFF",
        "Cancel at least 2 hours before class",
      );
      run("UPDATE bookings SET state='cancelled' WHERE id=?", bookingId);
      notify(
        userId,
        "cancelled",
        `تم إلغاء حجز ${c.title}.`,
        `cancel-${bookingId}`,
      );
      promote(c.id);
      return { ok: true };
    });
  }
  function buy(actorId, userId, planId, reference) {
    return atomic(() => {
      const p = one("SELECT * FROM plans WHERE id=?", planId);
      fail(!p, "NOT_FOUND", "Membership plan not found", 404);
      const existing = one(
        `SELECT m.* FROM payments p JOIN memberships m ON m.id=p.membership_id WHERE reference=?`,
        reference,
      );
      if (existing) {
        fail(
          existing.user_id !== userId || existing.plan_id !== planId,
          "REFERENCE_REUSED",
          "Payment reference already used",
          409,
        );
        return existing;
      }
      fail(
        !one("SELECT id FROM users WHERE id=? AND role='member'", userId),
        "NOT_FOUND",
        "Member not found",
        404,
      );
      fail(
        one(
          "SELECT id FROM memberships WHERE user_id=? AND plan_id=? AND ends>?",
          userId,
          planId,
          clock(),
        ),
        "ALREADY_SUBSCRIBED",
        "You already have an active subscription to this plan",
        409,
      );
      const starts = clock(),
        ends = starts + p.days * DAY;
      const result = run(
        "INSERT INTO memberships(user_id,plan_id,starts,ends,created) VALUES (?,?,?,?,?)",
        userId,
        planId,
        starts,
        ends,
        clock(),
      );
      const id = Number(result.lastInsertRowid);
      run(
        "INSERT INTO payments(membership_id,amount,reference,created) VALUES (?,?,?,?)",
        id,
        p.price,
        reference,
        clock(),
      );
      audit(
        actorId,
        "membership.purchase",
        id,
        `simulated; plan=${planId}; cents=${p.price}`,
      );
      notify(
        userId,
        "membership",
        "تم تفعيل اشتراكك التجريبي أو تجديده.",
        `membership-${id}`,
      );
      return one("SELECT * FROM memberships WHERE id=?", id);
    });
  }
  function cancelClass(actor, classId) {
    return atomic(() => {
      const c = getClass(classId);
      fail(
        actor.role !== "manager" &&
          !(actor.role === "instructor" && c.instructor_id === actor.id),
        "FORBIDDEN",
        "Only the assigned instructor can cancel this class",
        403,
      );
      if (c.state === "cancelled") return { ok: true };
      fail(
        clock() >= c.ends,
        "CLASS_ENDED",
        "A completed class cannot be cancelled",
      );
      run(
        "UPDATE classes SET state='cancelled',cancelled_at=? WHERE id=?",
        clock(),
        classId,
      );
      for (const b of all(
        "SELECT * FROM bookings WHERE class_id=? AND state IN ('confirmed','waitlisted')",
        classId,
      )) {
        run("UPDATE bookings SET state='cancelled' WHERE id=?", b.id);
        notify(
          b.user_id,
          "class_cancelled",
          `تم إلغاء حصة ${c.title}.`,
          `class-cancel-${b.id}`,
        );
      }
      audit(actor.id, "class.cancel", classId);
      return { ok: true };
    });
  }
  function tick() {
    return atomic(() => {
      const now = clock();
      run(
        "UPDATE bookings SET state='attended' WHERE state='checked_in' AND class_id IN (SELECT id FROM classes WHERE ends<=?)",
        now,
      );
      for (const b of all(
        "SELECT b.id,b.user_id,c.title,c.ends FROM bookings b JOIN classes c ON c.id=b.class_id WHERE b.state='confirmed' AND c.state='published' AND c.ends<=?",
        now,
      )) {
        run(
          "UPDATE bookings SET state='no_show',no_show_at=? WHERE id=?",
          b.ends,
          b.id,
        );
        notify(
          b.user_id,
          "no_show",
          `تم تسجيل غيابك عن ${b.title}.`,
          `no-show-${b.id}`,
        );
      }
      run(
        "UPDATE bookings SET state='not_promoted' WHERE state='waitlisted' AND class_id IN (SELECT id FROM classes WHERE ends<=? OR state='cancelled')",
        now,
      );
      for (const b of all(
        `SELECT b.id,b.user_id,c.title FROM bookings b JOIN classes c ON c.id=b.class_id
      WHERE b.state='confirmed' AND c.starts>? AND c.starts<=?`,
        now,
        now + 2 * HOUR,
      ))
        notify(
          b.user_id,
          "reminder",
          `تذكير بموعد ${b.title} خلال ساعتين.`,
          `reminder-${b.id}`,
        );
      for (const m of all(
        "SELECT id,user_id FROM memberships WHERE ends>? AND ends<=?",
        now,
        now + 3 * DAY,
      ))
        notify(
          m.user_id,
          "expiry",
          "اشتراكك ينتهي خلال ثلاثة أيام. يمكنك تجديده من صفحة العضوية.",
          `expiry-${m.id}`,
        );
      run("DELETE FROM used_tokens WHERE expires<=?", now);
      run("DELETE FROM sessions WHERE expires<=?", now);
      // Twelve month retention from latest membership end; cascading FKs remove member records.
      const stale = all(
        `SELECT u.id FROM users u WHERE u.role='member' AND
      (SELECT MAX(ends) FROM memberships m WHERE m.user_id=u.id)<?`,
        now - 365 * DAY,
      );
      for (const u of stale) {
        run("DELETE FROM users WHERE id=?", u.id);
        run("DELETE FROM audit WHERE actor=? OR target=?", u.id, u.id);
      }
      return { removedMembers: stale.length };
    });
  }
  function makeToken(kind, subject) {
    fail(kind !== "membership", "INVALID_TOKEN", "Unsupported QR purpose", 403);
    const now = clock(),
      data = Buffer.from(
        JSON.stringify({
          kind,
          sub: String(subject),
          iat: now,
          exp: now + 2 * MINUTE,
        }),
      ).toString("base64url");
    return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
  }
  function verifyToken(token, kind) {
    fail(
      typeof token !== "string" || token.length > 1500,
      "INVALID_TOKEN",
      "Invalid QR token",
      403,
    );
    const [data, signature, ...extra] = token.split("."),
      expected = createHmac("sha256", secret)
        .update(data || "")
        .digest("base64url");
    fail(
      extra.length ||
        !signature ||
        signature.length !== expected.length ||
        !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)),
      "INVALID_TOKEN",
      "Invalid QR signature",
      403,
    );
    let p;
    try {
      p = JSON.parse(Buffer.from(data, "base64url").toString());
    } catch {
      throw new AppError("INVALID_TOKEN", "Invalid QR payload", 403);
    }
    fail(
      p.kind !== kind || typeof p.sub !== "string",
      "INVALID_TOKEN",
      "Invalid QR purpose",
      403,
    );
    fail(
      !Number.isFinite(p.exp) ||
        p.exp <= clock() ||
        p.iat > clock() ||
        !Number.isFinite(p.iat) ||
        ![MINUTE, 2 * MINUTE].includes(p.exp - p.iat),
      "EXPIRED_TOKEN",
      "QR token expired",
      403,
    );
    return p;
  }
  function scanAttendance(actor, classId, token) {
    return atomic(() => {
      const c = getClass(classId);
      fail(
        actor.role !== "instructor" || c.instructor_id !== actor.id,
        "FORBIDDEN",
        "Only the assigned instructor can scan this class",
        403,
      );
      fail(
        c.state !== "published" || clock() < c.starts || clock() >= c.ends,
        "CHECKIN_WINDOW",
        "QR scanning is available from class start until class end",
        422,
      );
      const p = verifyToken(token, "membership"),
        user = one(
          "SELECT id,name,email FROM users WHERE id=? AND role='member'",
          p.sub,
        );
      fail(!user, "NOT_FOUND", "Student account not found", 404);
      const active = membership(user.id, clock(), c.type, c.ends);
      fail(
        !active,
        "MEMBERSHIP_REQUIRED",
        "Student needs an active membership covering this class",
        422,
      );
      const b = one(
        "SELECT * FROM bookings WHERE user_id=? AND class_id=? AND state IN ('confirmed','checked_in') ORDER BY id DESC LIMIT 1",
        user.id,
        c.id,
      );
      fail(!b, "NOT_BOOKED", "Student is not booked in this class", 422);
      const alreadyCheckedIn = b.state === "checked_in";
      if (!alreadyCheckedIn) {
        run(
          "UPDATE bookings SET state='checked_in',checked_at=? WHERE id=?",
          clock(),
          b.id,
        );
        audit(actor.id, "attendance.qr", b.id, `class=${c.id}`);
        notify(
          user.id,
          "attendance",
          `تم تسجيل حضورك في ${c.title}.`,
          `check-in-${b.id}`,
        );
      }
      return {
        allowed: true,
        checkedIn: true,
        alreadyCheckedIn,
        member: user,
        membership: { name: active.name, ends: active.ends },
        class: { id: c.id, title: c.title },
        message: alreadyCheckedIn
          ? "تم تسجيل حضور هذا الطالب مسبقاً"
          : "اشتراك فعّال وحجز مؤكد — تم تسجيل الحضور",
      };
    });
  }
  function savePlan(actorId, p) {
    fail(
      typeof p.name !== "string" ||
        p.name.trim().length < 2 ||
        p.name.length > 100,
      "INVALID_PLAN",
      "Plan name must be 2 to 100 characters",
    );
    fail(
      !Number.isSafeInteger(p.price) ||
        p.price < 0 ||
        p.price > 10000000 ||
        !Number.isSafeInteger(p.days) ||
        p.days < 1 ||
        p.days > 366,
      "INVALID_PLAN",
      "Invalid plan price or duration",
    );
    fail(
      !Array.isArray(p.types) ||
        !p.types.length ||
        p.types.some(
          (t) => !["strength", "yoga", "spinning", "fitness"].includes(t),
        ),
      "INVALID_PLAN",
      "Select supported class types",
    );
    return atomic(() => {
      const id = Number(
        run(
          "INSERT INTO plans(name,price,days,types) VALUES (?,?,?,?)",
          p.name.trim(),
          p.price,
          p.days,
          JSON.stringify(p.types),
        ).lastInsertRowid,
      );
      audit(actorId, "plan.create", id);
      return { id };
    });
  }
  function saveClass(actorId, c) {
    fail(
      !["strength", "yoga", "spinning", "fitness"].includes(c.type),
      "INVALID_CLASS",
      "Invalid class type",
    );
    fail(
      typeof c.title !== "string" ||
        c.title.trim().length < 2 ||
        c.title.length > 100 ||
        typeof c.studio !== "string" ||
        c.studio.length < 1 ||
        c.studio.length > 100,
      "INVALID_CLASS",
      "Invalid title or studio",
    );
    fail(
      !Number.isSafeInteger(c.starts) ||
        !Number.isSafeInteger(c.ends) ||
        c.starts <= clock() ||
        c.ends <= c.starts ||
        c.ends - c.starts > 4 * HOUR,
      "INVALID_CLASS",
      "Class must be in the future and last at most four hours",
    );
    fail(
      !Number.isSafeInteger(c.capacity) || c.capacity < 1 || c.capacity > 500,
      "INVALID_CLASS",
      "Capacity must be 1 to 500",
    );
    fail(
      !one(
        "SELECT id FROM users WHERE id=? AND role='instructor'",
        c.instructorId,
      ),
      "INVALID_CLASS",
      "Instructor not found",
    );
    fail(
      one(
        "SELECT id FROM classes WHERE state='published' AND starts<? AND ends>? AND (studio=? OR instructor_id=?)",
        c.ends,
        c.starts,
        c.studio,
        c.instructorId,
      ),
      "OVERLAP",
      "Studio or instructor already assigned at this time",
      409,
    );
    return atomic(() => {
      const id = Number(
        run(
          "INSERT INTO classes(type,title,instructor_id,studio,starts,ends,capacity) VALUES (?,?,?,?,?,?,?)",
          c.type,
          c.title.trim(),
          c.instructorId,
          c.studio.trim(),
          c.starts,
          c.ends,
          c.capacity,
        ).lastInsertRowid,
      );
      audit(actorId, "class.publish", id);
      return { id };
    });
  }
  function dashboard() {
    const now = clock();
    return {
      activeMembers: one(
        "SELECT COUNT(DISTINCT user_id) n FROM memberships WHERE starts<=? AND ends>?",
        now,
        now,
      ).n,
      confirmed: one(
        "SELECT COUNT(*) n FROM bookings b JOIN classes c ON c.id=b.class_id WHERE b.state='confirmed' AND c.starts>?",
        now,
      ).n,
      waitlisted: one(
        "SELECT COUNT(*) n FROM bookings WHERE state='waitlisted'",
      ).n,

      weekly:
        all(`SELECT strftime('%Y-%W',starts/1000,'unixepoch') week,type,COUNT(DISTINCT c.id) classes,
        SUM(CASE WHEN b.state IN ('confirmed','checked_in','attended','no_show') THEN 1 ELSE 0 END) allocated,
        SUM(CASE WHEN b.state='no_show' THEN 1 ELSE 0 END) noShows,
        SUM(CASE WHEN b.state IN ('attended','no_show') THEN 1 ELSE 0 END) completed
        FROM classes c LEFT JOIN bookings b ON b.class_id=c.id WHERE c.state='published' GROUP BY week,type`),
      capacityByWeek: all(
        "SELECT strftime('%Y-%W',starts/1000,'unixepoch') week,type,SUM(capacity) capacity FROM classes WHERE state='published' GROUP BY week,type",
      ),
      membershipsByWeek: all(
        "SELECT strftime('%Y-%W',starts/1000,'unixepoch') week,COUNT(*) count FROM memberships GROUP BY week",
      ),
      activeByPlan: all(
        "SELECT p.name,COUNT(DISTINCT m.user_id) count FROM plans p LEFT JOIN memberships m ON m.plan_id=p.id AND m.starts<=? AND m.ends>? GROUP BY p.id",
        now,
        now,
      ),
    };
  }
  return {
    book,
    cancel,
    buy,
    cancelClass,
    tick,
    makeToken,
    verifyToken,
    scanAttendance,
    savePlan,
    saveClass,
    membership,
    dashboard,
    audit,
    getClass,
    promote,
    one,
    all,
    run,
    clock,
  };
}
