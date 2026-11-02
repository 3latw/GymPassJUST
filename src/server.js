import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { backup } from "node:sqlite";
import { openDatabase, seed } from "./db.js";
import { fail } from "./service.js";
import { createHttpApp } from "./app.js";
import { provisionLocalAccounts } from "./local-auth.js";
import { cleanLegacyDemoData } from "./legacy-data.js";

export async function createApp(options = {}) {
  const origin =
    options.origin || process.env.APP_ORIGIN || "http://localhost:3000";
  const demo = options.demo ?? false;
  fail(
    demo &&
      !["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
    "CONFIG",
    "Demo identities require a loopback origin",
    500,
  );
  fail(
    process.env.NODE_ENV === "production" &&
      (!origin.startsWith("https:") ||
        demo ||
        !process.env.SIGNING_SECRET ||
        !process.env.OIDC_ISSUER),
    "CONFIG",
    "Production requires HTTPS, external OIDC and SIGNING_SECRET",
    500,
  );
  const db = openDatabase(
      options.databasePath || process.env.DATABASE_PATH || "data/gympass.db",
    ),
    clock = options.clock || Date.now;
  if (
    !demo &&
    db.prepare("SELECT value FROM metadata WHERE key='seeded_at'").get() &&
    !db.prepare("SELECT value FROM metadata WHERE key='live_data_v1'").get()
  ) {
    if ((options.databasePath || process.env.DATABASE_PATH) !== ":memory:") {
      const folder = resolve(process.env.BACKUP_PATH || "backups");
      mkdirSync(folder, { recursive: true });
      await backup(db, resolve(folder, `before-live-data-${Date.now()}.db`));
    }
    cleanLegacyDemoData(db);
  }
  seed(db, clock(), { demo });
  if (
    !demo &&
    !process.env.OIDC_ISSUER &&
    process.env.AUTH_MODE !== "oidc" &&
    options.accountFile !== false &&
    process.env.NODE_ENV !== "production"
  ) {
    await provisionLocalAccounts(
      db,
      resolve("accounts/initial-accounts.json"),
      clock,
    );
  }
  let secret =
    options.secret ||
    process.env.SIGNING_SECRET ||
    db.prepare("SELECT value FROM metadata WHERE key='signing_secret'").get()
      ?.value;
  if (!secret) {
    secret = randomBytes(48).toString("base64url");
    db.prepare("INSERT INTO metadata VALUES (?,?)").run(
      "signing_secret",
      secret,
    );
  }
  const { app, service } = await createHttpApp({
    ...options, db, origin, secret, clock, demo,
  });
  let minuteTimer, backupTimer;
  const backupDir = process.env.BACKUP_PATH || "backups";
  async function dailyBackup() {
    mkdirSync(backupDir, { recursive: true });
    await backup(
      db,
      resolve(backupDir, `gympass-${new Date().toISOString().slice(0, 10)}.db`),
    );
    const cutoff = Date.now() - 7 * 86400000;
    for (const file of readdirSync(backupDir)) {
      const match = /^gympass-(\d{4}-\d{2}-\d{2})\.db$/.exec(file);
      if (match && Date.parse(match[1]) < cutoff)
        unlinkSync(resolve(backupDir, file));
    }
  }
  if (options.jobs !== false) {
    minuteTimer = setInterval(() => {
      try {
        service.tick();
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "scheduler_failed",
            code: error.code || "INTERNAL",
          }),
        );
      }
    }, 60000).unref();
    backupTimer = setInterval(
      () =>
        dailyBackup().catch(() => console.error('{"event":"backup_failed"}')),
      86400000,
    ).unref();
    await dailyBackup();
  }
  return {
    app,
    db,
    service: service,
    demo,
    origin,
    dispose() {
      clearInterval(minuteTimer);
      clearInterval(backupTimer);
      db.close();
    },
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const instance = await createApp(),
    port = Number(process.env.PORT || 3000),
    host = process.env.HOST || "127.0.0.1";
  const server = instance.app.listen(port, host, () =>
    console.log(
      `GymPassJUST ready at ${instance.origin} | ${instance.demo ? "test OIDC" : process.env.OIDC_ISSUER ? "external OIDC" : "email and password accounts"}`,
    ),
  );
  const stop = () =>
    server.close(() => {
      instance.dispose();
      process.exit(0);
    });
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
