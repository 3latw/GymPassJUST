import {
  scrypt,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { AppError, fail } from "./service.js";
import { transaction } from "./database.js";

const scryptAsync = promisify(scrypt);
const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const random = () => randomBytes(32).toString("base64url");
const digest = (value) => createHash("sha256").update(value).digest("hex");
let activePasswordRequests = 0;
async function derivePasswordKey(password, salt) {
  fail(
    activePasswordRequests >= 4,
    "RATE_LIMIT",
    "Please wait before trying again",
    429,
  );
  activePasswordRequests++;
  try {
    return await scryptAsync(password, salt, 64, scryptOptions);
  } finally {
    activePasswordRequests--;
  }
}
export async function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await derivePasswordKey(password, salt)).toString("hex")}`;
}
async function matches(password, stored) {
  const [, salt, hash] = stored.split("$");
  return timingSafeEqual(
    await derivePasswordKey(password, salt),
    Buffer.from(hash, "hex"),
  );
}
function accountInput(data) {
  fail(
    typeof data.email !== "string" ||
      data.email.length > 254 ||
      !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(
        data.email.trim(),
      ),
    "INVALID_ACCOUNT",
    "Enter a valid email address",
  );
  fail(
    typeof data.name !== "string" ||
      data.name.trim().length < 2 ||
      data.name.length > 100,
    "INVALID_ACCOUNT",
    "Name must contain 2 to 100 characters",
  );
  validatePassword(data.password);
  return { name: data.name.trim(), email: data.email.trim().toLowerCase() };
}
function validatePassword(password) {
  fail(
    typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128,
    "WEAK_PASSWORD",
    "Password must contain 12 to 128 characters",
  );
}
export async function createAccount(
  db,
  data,
  role = "member",
  clock = Date.now,
) {
  const user = accountInput(data);
  fail(
    db.prepare("SELECT id FROM users WHERE lower(email)=?").get(user.email),
    "EMAIL_EXISTS",
    "An account already uses this email",
    409,
  );
  const hashedPassword = await passwordHash(data.password);
  return transaction(db, () => {
    fail(
      db.prepare("SELECT id FROM users WHERE lower(email)=?").get(user.email),
      "EMAIL_EXISTS",
      "An account already uses this email",
      409,
    );
    const id = randomUUID();
    db.prepare("INSERT INTO users VALUES (?,?,?,?)").run(
      id,
      user.name,
      user.email,
      role,
    );
    db.prepare("INSERT INTO credentials VALUES (?,?,?)").run(
      id,
      hashedPassword,
      clock(),
    );
    return { id, ...user, role };
  });
}

// These bootstrap accounts belong only to the bundled local teaching project.
// Their generated passwords live outside public/ and are never committed.
export async function provisionLocalAccounts(db, file, clock) {
  const templates = [
    ["member-1", "أحمد خالد", "student1@gympassjust.local", "member", "طالب 1"],
    ["member-2", "سارة محمد", "student2@gympassjust.local", "member", "طالب 2"],
    [
      "instructor-1",
      "مدرب المركز",
      "coach@gympassjust.local",
      "instructor",
      "المدرب",
    ],
    ["manager", "مدير المركز", "admin@gympassjust.local", "manager", "المدير"],
  ];
  let accounts;
  if (existsSync(file)) {
    accounts = JSON.parse(readFileSync(file, "utf8"));
  } else {
    accounts = templates.map(([id, name, email, role, label]) => ({
      id,
      name,
      email,
      role,
      label,
      password: "GPJ-" + randomBytes(12).toString("base64url") + "!",
    }));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(accounts, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
  }
  accounts = accounts.filter((account) =>
    ["member", "instructor", "manager"].includes(account.role),
  );
  writeFileSync(file, JSON.stringify(accounts, null, 2) + "\n", {
    mode: 0o600,
  });
  for (const account of accounts) {
    if (!templates.some(([id]) => id === account.id)) {
      continue;
    }
    if (
      db
        .prepare("SELECT user_id FROM credentials WHERE user_id=?")
        .get(account.id)
    ) {
      continue;
    }
    const hashedPassword = await passwordHash(account.password);
    transaction(db, () => {
      db.prepare(
        "INSERT INTO users VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email",
      ).run(account.id, account.name, account.email, account.role);
      db.prepare("INSERT INTO credentials VALUES (?,?,?)").run(
        account.id,
        hashedPassword,
        clock(),
      );
    });
  }
  const markdown =
    "# حسابات GymPassJUST المحلية\n\nهذه الحسابات تعمل داخل المشروع على جهازكم، وليست حسابات جامعية رسمية.\n\n| الحساب | الإيميل | كلمة المرور |\n|---|---|---|\n" +
    accounts
      .map(
        (account) =>
          `| ${account.label} | \`${account.email}\` | \`${account.password}\` |`,
      )
      .join("\n") +
    "\n\nشغّل Start-GymPass.cmd ثم افتح http://localhost:3000. يمكن إنشاء طالب جديد من صفحة التسجيل. المدير يستطيع إنشاء حسابات الموظفين من إدارة الحسابات. تغيير كلمة المرور من صفحة حسابي. كلمات المرور أعلاه أولية؛ إذا غيرتها لن يتم استبدالها عند إعادة التشغيل.\n";
  writeFileSync(file.replace(/\.json$/, ".md"), markdown, { mode: 0o600 });
}

export async function installLocalAuth(
  app,
  db,
  { origin, clock, clientAddress },
) {
  const cookieOptions = {
    httpOnly: true,
    secure: origin.startsWith("https:"),
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 3600000,
  };
  const dummy = await passwordHash(random());
  function beginSession(req, res, userId) {
    const oldSessionToken = req.headers.cookie
      ?.split(";")
      .map((cookiePart) => cookiePart.trim())
      .find((cookiePart) => cookiePart.startsWith("gp_session="))
      ?.slice(11);
    if (oldSessionToken) {
      db.prepare("DELETE FROM sessions WHERE id=?").run(
        digest(oldSessionToken),
      );
    }
    const sessionToken = random();
    const csrfToken = random();
    db.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run(
      digest(sessionToken),
      userId,
      csrfToken,
      clock() + cookieOptions.maxAge,
    );
    res.cookie("gp_session", sessionToken, cookieOptions);
  }
  function originCheck(req, res, next) {
    if (req.headers.origin !== origin) {
      return next(
        new AppError("CSRF", "The request could not be verified", 403),
      );
    }
    next();
  }
  function throttle(req, kind, limit) {
    const now = clock();
    db.prepare("DELETE FROM auth_attempts WHERE expires<=?").run(now);
    const address = clientAddress
      ? clientAddress(req)
      : req.socket.remoteAddress;
    const buckets = [[`${kind}:ip:${address}`, limit]];
    if (kind === "login") {
      buckets.push([
        `login:account:${digest(
          String(req.body.email || "")
            .trim()
            .toLowerCase(),
        )}`,
        10,
      ]);
    }
    for (const [bucket, max] of buckets) {
      db.prepare(
        "INSERT INTO auth_attempts VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1",
      ).run(bucket, now + 15 * 60000);
      fail(
        db.prepare("SELECT count FROM auth_attempts WHERE bucket=?").get(bucket)
          .count > max,
        "RATE_LIMIT",
        "Too many attempts. Try again in 15 minutes",
        429,
      );
    }
  }
  app.get("/auth/config", (req, res) => res.json({ mode: "local" }));
  app.post("/auth/local/register", originCheck, async (req, res) => {
    throttle(req, "register", 10);
    const user = await createAccount(db, req.body, "member", clock);
    beginSession(req, res, user.id);
    res.status(201).json({ user });
  });
  app.post("/auth/local/login", originCheck, async (req, res) => {
    throttle(req, "login", 40);
    fail(
      typeof req.body.email !== "string" ||
        req.body.email.length > 254 ||
        typeof req.body.password !== "string" ||
        req.body.password.length > 128,
      "INVALID_LOGIN",
      "Email or password is incorrect",
      401,
    );
    const user = db
      .prepare(
        "SELECT u.id,c.password_hash FROM users u JOIN credentials c ON c.user_id=u.id WHERE lower(u.email)=? AND u.role IN ('member','instructor','manager')",
      )
      .get(req.body.email.trim().toLowerCase());
    const valid = await matches(
      req.body.password,
      user?.password_hash || dummy,
    );
    fail(
      !user || !valid,
      "INVALID_LOGIN",
      "Email or password is incorrect",
      401,
    );
    beginSession(req, res, user.id);
    db.prepare("DELETE FROM auth_attempts WHERE bucket=?").run(
      `login:account:${digest(req.body.email.trim().toLowerCase())}`,
    );
    res.json({ ok: true });
  });
  return { beginSession, matches };
}

export function installAccountRoutes(app, db, { clock, local }) {
  app.get("/api/accounts", (req, res) => {
    fail(
      req.user.role !== "manager",
      "FORBIDDEN",
      "Manager access required",
      403,
    );
    res.json(
      db
        .prepare(
          "SELECT u.id,u.name,u.email,u.role FROM users u JOIN credentials c ON c.user_id=u.id WHERE u.role IN ('member','instructor','manager') ORDER BY c.updated DESC LIMIT 100",
        )
        .all(),
    );
  });
  app.post("/api/accounts", async (req, res) => {
    fail(
      !local || req.user.role !== "manager",
      "FORBIDDEN",
      "Manager access required",
      403,
    );
    fail(
      !["member", "instructor", "manager"].includes(req.body.role),
      "INVALID_ACCOUNT",
      "Select a valid role",
    );
    const user = await createAccount(db, req.body, req.body.role, clock);
    db.prepare(
      "INSERT INTO audit(actor,action,target,created,detail) VALUES (?,?,?,?,?)",
    ).run(req.user.id, "account.create", user.id, clock(), user.role);
    res.status(201).json(user);
  });
  app.post("/api/account/password", async (req, res) => {
    fail(
      !local,
      "FORBIDDEN",
      "Password is managed by the identity provider",
      403,
    );
    validatePassword(req.body.password);
    fail(
      typeof req.body.currentPassword !== "string" ||
        req.body.currentPassword.length > 128,
      "INVALID_LOGIN",
      "Current password is incorrect",
      401,
    );
    const row = db
      .prepare("SELECT password_hash FROM credentials WHERE user_id=?")
      .get(req.user.id);
    fail(
      !row ||
        !(await local.matches(req.body.currentPassword, row.password_hash)),
      "INVALID_LOGIN",
      "Current password is incorrect",
      401,
    );
    const hashedPassword = await passwordHash(req.body.password);
    transaction(db, () => {
      db.prepare(
        "UPDATE credentials SET password_hash=?,updated=? WHERE user_id=?",
      ).run(hashedPassword, clock(), req.user.id);
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.user.id);
    });
    local.beginSession(req, res, req.user.id);
    res.json({ ok: true });
  });
}
