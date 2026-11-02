import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Use absolute paths: Wrangler resolves relative outdir paths from its config
// folder, whereas the test runner starts from the project root.
const result = spawnSync(process.execPath, [
  resolve("node_modules/wrangler/bin/wrangler.js"), "deploy", "--dry-run",
  "--config", resolve("cloudflare/wrangler.jsonc"),
  "--outdir", resolve(".wrangler/backend-build"),
], {
  stdio: "inherit",
  env: { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: resolve(".wrangler/logs") },
});
process.exit(result.status ?? 1);
