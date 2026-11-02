import { DurableObject } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import { createServer } from "node:http";
import { initializeDatabase } from "../src/schema.js";
import { seed } from "../src/database.js";
import { createHttpApp } from "../src/app.js";
import { createAccount } from "../src/local-auth.js";
import { durableDatabase } from "./database.js";

// One persistent gym database: all users see the same records. The object ID
// remains unchanged on redeploy, preserving accounts, sessions and bookings.
export class GymDatabase extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      if (!env.APP_ORIGIN?.startsWith("https://") || env.SIGNING_SECRET?.length < 32 || !env.SIGNING_SECRET) {
        throw new Error("Configure HTTPS APP_ORIGIN and a private SIGNING_SECRET");
      }
      this.db = initializeDatabase(durableDatabase(ctx.storage));
      seed(this.db, Date.now(), { demo: false });
      // Bootstrap values are private Cloudflare secrets, never public assets.
      // Repeated startup does not overwrite a changed password or create users.
      if (!this.db.prepare("SELECT value FROM metadata WHERE key='cloud_accounts_v1'").get()) {
        const accounts = JSON.parse(env.BOOTSTRAP_ACCOUNTS || "[]");
        if (accounts.length !== 4 || !accounts.some(a => a.role === "manager") || !accounts.some(a => a.role === "instructor")) {
          throw new Error("Four private initial accounts, including manager and instructor, are required");
        }
        for (const account of accounts) {
          if (!["member", "instructor", "manager"].includes(account.role)) throw new Error("Invalid bootstrap role");
          if (!this.db.prepare("SELECT id FROM users WHERE lower(email)=?").get(account.email.toLowerCase())) {
            await createAccount(this.db, account, account.role);
          }
        }
        this.db.prepare("INSERT INTO metadata VALUES ('cloud_accounts_v1','1')").run();
      }
      this.instance = await createHttpApp({ db: this.db, origin: env.APP_ORIGIN, secret: env.SIGNING_SECRET,
        staticDirectory: false, clientAddress: req => req.headers["x-gym-client-ip"] || "unavailable" });
      this.handler = httpServerHandler(createServer(this.instance.app));
      this.origin = env.APP_ORIGIN;
      this.alarmDue = await ctx.storage.getAlarm();
      await this.scheduleNextEnd();
    });
  }

  async fetch(request) {
    await this.ready;
    if (new URL(request.url).origin !== this.origin) return new Response("Unknown application origin", { status: 403 });
    const handle = async () => {
      const now = Date.now();
      if (!this.nextTick || now >= this.nextTick) {
        this.instance.service.tick();
        this.nextTick = now + 60000;
      }
      const response = await this.handler.fetch(request);
      if (request.method === "POST" && response.ok) await this.scheduleNextEnd();
      return response;
    };
    // Password work is memory-heavy. Serialize only those requests; ordinary
    // requests can overlap their HTTP parsing, while transactionSync keeps each
    // complete business operation atomic without holding a lock over network I/O.
    const path = new URL(request.url).pathname;
    const passwordWork = request.method === "POST" &&
      (/^\/auth\/local\//.test(path) || path === "/api/accounts" || path === "/api/account/password");
    return passwordWork ? this.ctx.blockConcurrencyWhile(handle) : handle();
  }

  async scheduleNextEnd() {
    const now = Date.now();
    const next = this.db.prepare(`SELECT MIN(due) AS due FROM (
      SELECT c.ends AS due FROM classes c WHERE c.state='published' AND EXISTS
        (SELECT 1 FROM bookings b WHERE b.class_id=c.id AND b.state IN ('confirmed','checked_in','waitlisted'))
      UNION ALL
      SELECT c.starts-7200000 FROM classes c JOIN bookings b ON b.class_id=c.id
        WHERE c.state='published' AND b.state='confirmed' AND c.starts>?
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.dedup_key='reminder-'||b.id)
      UNION ALL
      SELECT m.ends-259200000 FROM memberships m WHERE m.ends>?
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.dedup_key='expiry-'||m.id)
    )`).get(now, now);
    // End-of-class work and reminders run even when no browser is open.
    // A daily wake-up also performs retention and expired-session cleanup.
    const due = Math.max(now + 1000, Math.min(now + 86400000, next?.due ?? Infinity));
    if (!this.alarmDue || this.alarmDue > due) {
      this.alarmDue = due;
      await this.ctx.storage.setAlarm(due);
    }
  }

  async alarm() {
    await this.ready;
    this.alarmDue = null;
    this.instance.service.tick();
    this.nextTick = Date.now() + 60000;
    await this.scheduleNextEnd();
  }
}

// No public Worker endpoint. Pages talks directly to the bound object.
export default { fetch() { return new Response("Use the GymPassJUST Pages address", { status: 404 }); } };
