import { backup, DatabaseSync } from "node:sqlite";
import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const source = process.env.DATABASE_PATH || "data/gympass.db",
  target = process.argv[2] || "backups/manual-backup.db";
mkdirSync(resolve(target, ".."), { recursive: true });
const db = new DatabaseSync(source);
await backup(db, target);
const restore = target + ".restore-test.db";
copyFileSync(target, restore);
const restored = new DatabaseSync(restore);
const integrity = restored
  .prepare("PRAGMA integrity_check")
  .get().integrity_check;
const counts = restored
  .prepare(
    "SELECT (SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM classes) classes,(SELECT COUNT(*) FROM bookings) bookings",
  )
  .get();
if (integrity !== "ok") throw new Error("Restore integrity check failed");
const result = {
  timestamp: new Date().toISOString(),
  source,
  target,
  restore,
  integrity,
  counts,
};
mkdirSync("evidence", { recursive: true });
writeFileSync("evidence/backup-restore.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
restored.close();
db.close();
