import { cp, mkdir, writeFile } from "node:fs/promises";
// Copy an allowlisted public directory, never the project root or private data.
await mkdir("dist-pages/vendor", { recursive: true });
await cp("public", "dist-pages", { recursive: true });
await cp("node_modules/jsqr/dist/jsQR.js", "dist-pages/vendor/jsqr.js");
await cp("cloudflare/pages-worker.js", "dist-pages/_worker.js");
await writeFile("dist-pages/_routes.json", JSON.stringify({ version: 1, include: ["/*"], exclude: [] }));
console.log("Built public Pages assets and private-API proxy.");
