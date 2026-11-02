import express from "express";
// Select the server renderer explicitly: Workers bundling otherwise picks the
// browser renderer, which requires a DOM canvas that does not exist on a server.
import QRCode from "qrcode/lib/server.js";
import { fileURLToPath } from "node:url";
import { createService, AppError, fail } from "./service.js";
import { installAuth } from "./auth.js";

// HTTP behavior is shared by the local Node server and Cloudflare runtime.
// The caller owns database storage, background jobs and initial account setup.
export async function createHttpApp({ db, origin, secret, clock = Date.now, demo = false, ...options }) {
  const service = createService(db, { clock, secret }),
    app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
    });
    if (origin.startsWith("https:"))
      res.set("Strict-Transport-Security", "max-age=31536000");
    next();
  });
  const limits = new Map();
  app.use((req, res, next) => {
    const key = options.clientAddress ? options.clientAddress(req) : req.socket.remoteAddress,
      now = Date.now(),
      record = limits.get(key) || { count: 0, until: now + 60000 };
    if (record.until < now) {
      record.count = 0;
      record.until = now + 60000;
    }
    record.count++;
    limits.set(key, record);
    if (limits.size > 10000)
      for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    if (record.count > 2000)
      return res.status(429).json({
        error: {
          code: "RATE_LIMIT",
          message: "Too many requests; try again in one minute",
        },
      });
    next();
  });
  app.use(
    express.json({ limit: "16kb" }),
    express.urlencoded({ extended: false, limit: "16kb" }),
  );
  app.get("/health", (req, res) =>
    res.json({ status: "ok", version: "1.3.0" }),
  );
  if (options.staticDirectory !== false) app.get("/vendor/jsqr.js", (req, res) =>
    res.sendFile(
      fileURLToPath(
        new URL("../node_modules/jsqr/dist/jsQR.js", import.meta.url),
      ),
    ),
  );
  await installAuth(app, db, { origin, demo, clock, clientAddress: options.clientAddress });
  function allow(...roles) {
    return function checkRole(req, res, next) {
      if (!roles.includes(req.user.role)) {
        return next(
          new AppError(
            "FORBIDDEN",
            "This action is not available for your role",
            403,
          ),
        );
      }
      next();
    };
  }
  const id = (value) => {
    const n = Number(value);
    fail(
      !Number.isSafeInteger(n) || n < 1,
      "INVALID_ID",
      "Invalid record identifier",
    );
    return n;
  };
  const page = (req) =>
    Math.max(
      1,
      Math.min(10000, Number.parseInt(req.query.page || "1", 10) || 1),
    );
  const pageResult = (items, total, p) => ({
    data: items,
    pagination: {
      page: p,
      pageSize: 50,
      totalItems: total,
      totalPages: Math.ceil(total / 50),
    },
  });
  app.get("/api/bootstrap", (req, res) =>
    res.json({
      user: req.user,
      csrf: req.session.csrf,
      now: clock(),
      timeZone: "Asia/Amman",
      demo,
      membership: service.membership(req.user.id) || null,
      unread: service.one(
        "SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL",
        req.user.id,
      ).n,
      instructors:
        req.user.role === "manager"
          ? service.all("SELECT id,name FROM users WHERE role='instructor'")
          : [],
    }),
  );
  app.get("/api/plans", (req, res) =>
    res.json(
      service
        .all("SELECT * FROM plans ORDER BY price")
        .map((p) => ({ ...p, types: JSON.parse(p.types) })),
    ),
  );
  app.post("/api/plans", allow("manager"), (req, res) =>
    res.status(201).json(service.savePlan(req.user.id, req.body)),
  );
  app.get("/api/memberships", (req, res) =>
    res.json(
      service.all(
        "SELECT m.*,p.name,p.price FROM memberships m JOIN plans p ON p.id=m.plan_id WHERE user_id=? ORDER BY ends DESC",
        req.user.id,
      ),
    ),
  );
  app.post("/api/memberships", allow("member", "manager"), (req, res) => {
    const userId = req.user.role === "member" ? req.user.id : req.body.userId;
    fail(typeof userId !== "string", "INVALID_USER", "Select a member");
    const reference = req.headers["idempotency-key"];
    fail(
      typeof reference !== "string" ||
        !/^[a-zA-Z0-9_-]{8,100}$/.test(reference),
      "REFERENCE_REQUIRED",
      "Provide an Idempotency-Key of 8 to 100 characters",
    );
    res
      .status(201)
      .json(
        service.buy(
          req.user.id,
          userId,
          id(req.body.planId),
          `${req.user.id}:${reference}`,
        ),
      );
  });
  app.get("/api/classes", (req, res) => {
    const p = page(req),
      params = [clock() - 24 * 3600000],
      filters = [
        "CASE WHEN c.state='cancelled' THEN COALESCE(c.cancelled_at,c.ends) ELSE c.ends END>?",
      ];
    if (req.query.type) {
      filters.push("c.type=?");
      params.push(String(req.query.type));
    }
    if (req.user.role === "instructor") {
      filters.push("c.instructor_id=?");
      params.push(req.user.id);
    }
    const where = filters.join(" AND "),
      total = service.one(
        `SELECT COUNT(*) n FROM classes c WHERE ${where}`,
        ...params,
      ).n;
    const rows = service.all(
      `SELECT c.*,u.name instructor,
      (SELECT COUNT(*) FROM bookings b WHERE b.class_id=c.id AND b.state IN ('confirmed','checked_in','attended')) booked,
      (SELECT COUNT(*) FROM bookings b WHERE b.class_id=c.id AND b.state='waitlisted') waiting,
      (SELECT b.state FROM bookings b WHERE b.class_id=c.id AND b.user_id=? ORDER BY id DESC LIMIT 1) myState
      FROM classes c JOIN users u ON u.id=c.instructor_id WHERE ${where} ORDER BY starts LIMIT 50 OFFSET ?`,
      req.user.id,
      ...params,
      (p - 1) * 50,
    );
    res.json(pageResult(rows, total, p));
  });
  app.post("/api/classes", allow("manager", "instructor"), (req, res) => {
    const data = {
      ...req.body,
      ...(req.user.role === "instructor" ? { instructorId: req.user.id } : {}),
    };
    res.status(201).json(service.saveClass(req.user.id, data));
  });
  app.post(
    "/api/classes/:id/cancellation",
    allow("manager", "instructor"),
    (req, res) => res.json(service.cancelClass(req.user, id(req.params.id))),
  );
  app.get("/api/classes/:id", allow("manager", "instructor"), (req, res) => {
    const c = service.getClass(id(req.params.id));
    fail(
      req.user.role === "instructor" && c.instructor_id !== req.user.id,
      "FORBIDDEN",
      "Only your assigned classes are available",
      403,
    );
    res.json(c);
  });
  app.get(
    "/api/classes/:id/roster",
    allow("manager", "instructor"),
    (req, res) => {
      const c = service.getClass(id(req.params.id));
      fail(
        req.user.role === "instructor" && c.instructor_id !== req.user.id,
        "FORBIDDEN",
        "Only your assigned classes are available",
        403,
      );
      res.json(
        service.all(
          "SELECT b.*,u.name,u.email FROM bookings b JOIN users u ON u.id=b.user_id WHERE b.class_id=? ORDER BY b.created,b.id",
          c.id,
        ),
      );
    },
  );
  app.post("/api/bookings", allow("member"), (req, res) =>
    res.status(201).json(service.book(req.user.id, id(req.body.classId))),
  );
  app.get("/api/bookings", (req, res) =>
    res.json(
      service.all(
        `SELECT b.*,c.title,c.type,c.starts,c.ends,c.studio,u.name instructor,
    CASE WHEN b.state='waitlisted' THEN (SELECT COUNT(*) FROM bookings w WHERE w.class_id=b.class_id AND w.state='waitlisted' AND (w.created<b.created OR (w.created=b.created AND w.id<=b.id))) END position
    FROM bookings b JOIN classes c ON c.id=b.class_id JOIN users u ON u.id=c.instructor_id WHERE b.user_id=? ORDER BY c.starts DESC`,
        req.user.id,
      ),
    ),
  );
  app.post("/api/bookings/:id/cancellation", allow("member"), (req, res) =>
    res.json(service.cancel(req.user.id, id(req.params.id))),
  );
  app.get("/api/membership-pass", allow("member"), async (req, res) => {
    const token = service.makeToken("membership", req.user.id);
    res.json({
      token,
      expiresAt: service.verifyToken(token, "membership").exp,
      refreshAfterMs: 30000,
      image: await QRCode.toDataURL(token, { width: 300, margin: 2 }),
    });
  });
  app.post("/api/class-qr-check-ins", allow("instructor"), (req, res) =>
    res.json(
      service.scanAttendance(req.user, id(req.body.classId), req.body.token),
    ),
  );
  app.get("/api/members", allow("manager"), (req, res) => {
    const term = String(req.query.q || "").slice(0, 100),
      p = page(req),
      pattern = `%${term}%`;
    const where = "role='member' AND (name LIKE ? OR email LIKE ? OR id=?)";
    const total = service.one(
      `SELECT COUNT(*) n FROM users WHERE ${where}`,
      pattern,
      pattern,
      term,
    ).n;
    res.json(
      pageResult(
        service
          .all(
            `SELECT * FROM users WHERE ${where} ORDER BY name LIMIT 50 OFFSET ?`,
            pattern,
            pattern,
            term,
            (p - 1) * 50,
          )
          .map((u) => ({
            ...u,
            membership: service.membership(u.id) || null,
          })),
        total,
        p,
      ),
    );
  });
  app.get("/api/notifications", (req, res) => {
    const p = page(req);
    res.json(
      pageResult(
        service.all(
          "SELECT * FROM notifications WHERE user_id=? ORDER BY created DESC,id DESC LIMIT 50 OFFSET ?",
          req.user.id,
          (p - 1) * 50,
        ),
        service.one(
          "SELECT COUNT(*) n FROM notifications WHERE user_id=?",
          req.user.id,
        ).n,
        p,
      ),
    );
  });
  app.post("/api/notifications/read", (req, res) => {
    service.run(
      "UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL",
      clock(),
      req.user.id,
    );
    res.json({ ok: true });
  });
  app.get("/api/dashboard", allow("manager"), (req, res) =>
    res.json(service.dashboard()),
  );
  app.get("/api/audit", allow("manager"), (req, res) => {
    const p = page(req);
    res.json(
      pageResult(
        service.all(
          "SELECT * FROM audit ORDER BY id DESC LIMIT 50 OFFSET ?",
          (p - 1) * 50,
        ),
        service.one("SELECT COUNT(*) n FROM audit").n,
        p,
      ),
    );
  });
  app.use("/api", (req, res) =>
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Endpoint not found" } }),
  );
  if (options.staticDirectory !== false) {
  app.use(
    express.static(fileURLToPath(new URL("../public", import.meta.url)), {
      maxAge: 0,
    }),
  );
  app.get(
    [
      "/login",
      "/register",
      "/student",
      "/student/:view",
      "/instructor",
      "/instructor/:view",
      "/manager",
      "/manager/:view",
      "/account",
    ],
    (req, res) =>
      res.sendFile(
        fileURLToPath(new URL("../public/index.html", import.meta.url)),
      ),
  );
  }
  app.use((error, req, res, next) => {
    const known = error instanceof AppError,
      status = known
        ? error.status
        : error.type === "entity.too.large"
          ? 413
          : error instanceof SyntaxError
            ? 400
            : 500;
    if (status === 500)
      console.error(
        JSON.stringify({
          event: "request_error",
          path: req.path,
          code: error.code || "INTERNAL",
        }),
      );
    res.status(status).json({
      error: {
        code: known ? error.code : "REQUEST_FAILED",
        message: known
          ? error.message
          : status === 500
            ? "The request failed. Please try again."
            : "Invalid request body",
      },
    });
  });
  return { app, service, db, origin, demo };
}
