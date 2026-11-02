import { performance } from "node:perf_hooks";
import { writeFileSync, mkdirSync } from "node:fs";
import { cpus, platform } from "node:os";
import { hash } from "../src/auth.js";
import { startTestApp } from "../tests/http-helpers.js";

const instance = await startTestApp({ databasePath: "data/load-test.db" });
try {
  const results = [];
  for (const count of [100, 300]) {
    instance.db.exec(
      "DELETE FROM notifications; DELETE FROM bookings; DELETE FROM sessions;",
    );
    instance.db
      .prepare("UPDATE classes SET starts=?,ends=?,capacity=20 WHERE id=1")
      .run(Date.now() + 4 * 3600000, Date.now() + 5 * 3600000);
    const clients = Array.from({ length: count }, (_, i) => {
      const cookie = `load-${count}-${i}`,
        csrf = `csrf-${count}-${i}`;
      instance.db
        .prepare("INSERT INTO sessions VALUES (?,?,?,?)")
        .run(hash(cookie), `member-${i + 1}`, csrf, Date.now() + 3600000);
      return { cookie, csrf };
    });
    const started = performance.now();
    const requests = await Promise.all(
      clients.map(async ({ cookie, csrf }) => {
        const start = performance.now();
        const response = await fetch(instance.origin + "/api/bookings", {
          method: "POST",
          headers: {
            cookie: `gp_session=${cookie}`,
            origin: instance.origin,
            "x-csrf-token": csrf,
            "content-type": "application/json",
          },
          body: '{"classId":1}',
        });
        const body = await response.json();
        return {
          status: response.status,
          state: body.state,
          latencyMs: performance.now() - start,
        };
      }),
    );
    const sorted = requests.map((r) => r.latencyMs).sort((a, b) => a - b),
      confirmed = instance.db
        .prepare("SELECT COUNT(*) n FROM bookings WHERE state='confirmed'")
        .get().n;
    const result = {
      concurrentMembers: count,
      capacity: 20,
      confirmed,
      waitlisted: requests.filter((r) => r.state === "waitlisted").length,
      failed: requests.filter((r) => r.status !== 201).length,
      p95Ms: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2)),
      maxMs: Number(sorted.at(-1).toFixed(2)),
      wallMs: Number((performance.now() - started).toFixed(2)),
    };
    result.passed =
      confirmed === 20 &&
      result.waitlisted === count - 20 &&
      result.failed === 0 &&
      (count !== 300 || result.p95Ms < 2000);
    results.push(result);
  }
  const output = {
    timestamp: new Date().toISOString(),
    environment: {
      node: process.version,
      os: platform(),
      cpu: cpus()[0].model,
      transport:
        "loopback HTTP; single process; disk SQLite with WAL; no proxy or TLS; cold burst; sessions pre-provisioned",
    },
    results,
  };
  mkdirSync("evidence", { recursive: true });
  writeFileSync("evidence/load-results.json", JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
  if (results.some((r) => !r.passed)) process.exitCode = 1;
} finally {
  await instance.close();
}
