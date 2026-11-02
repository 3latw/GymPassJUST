# GymPassJUST on Cloudflare Pages

Public address: https://gympassjust.pages.dev

The hosted version runs without the owner's laptop. Pages serves the existing Arabic/English HTML, CSS and JavaScript. Its small `_worker.js` forwards `/auth`, `/api` and `/health` to the bound `GymDatabase` Durable Object in `gympassjust-backend`. That object stores the actual SQLite database on Cloudflare. No local computer or tunnel is involved.

## Why this storage choice

The local application uses synchronous SQLite transactions. Cloudflare's SQLite-backed Durable Object can reuse those same gym rules and schema through `transactionSync`, including rollback, capacity triggers and FIFO promotion. An asynchronous D1 rewrite is therefore unnecessary for this version. The local Node server is still supported. Both runtimes use the same `src/app.js`, `src/service.js`, `src/schema.js` and `src/database.js`.

The object name `gympassjust-main-v1`, Worker name and class binding identify the live database. Keep them unchanged on updates. Creating a different object or namespace creates a different database; deleting the namespace deletes its data. No local database was uploaded. First launch creates four private cloud accounts and three plans, with no memberships or classes.

## Accounts and secrets

The owner receives `accounts/cloudflare-accounts.md` privately. These credentials are separate from local Node accounts. Public signup always creates a student; only a manager can create staff. Changed passwords survive restarts and deployment updates. Initial credentials are not served as assets and are not committed to GitHub.

The backend has two encrypted Cloudflare secrets: `SIGNING_SECRET` and `BOOTSTRAP_ACCOUNTS`. Keep the signing secret stable so current QR passes remain valid during updates. Bootstrap data is used once; a later deployment does not reset a password. Never put secret values in Wrangler configuration, public files, Git or command-line arguments.

## Build, test and update

From the project root, with Node.js 24 installed:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run check:cloudflare
npm.cmd test
npm.cmd run test:cloudflare
```

The Cloudflare test uses a separate local Workerd/SQLite fixture and does not send its hundreds of synthetic members to the live site. It covers login, session cookies, role/CSRF checks, plan duplicates, FIFO, actual QR image generation, invalid membership/booking checks, unattended end-of-class alarms, 100/300 concurrent bookings and data surviving a disk-backed restart. The 300-request p95 gate remains below two seconds in that local environment; it is not a measurement of internet traffic.

After `npx wrangler login` has been approved in the owner's regular browser:

```powershell
npm.cmd run deploy:backend
npm.cmd run deploy:pages
```

Existing encrypted secrets remain in Cloudflare on later deployments. The first installation additionally supplies a private generated JSON secrets file through Wrangler's `--secrets-file` option; that file is not part of this public repository. The backend configuration records the account ID; Pages uses the authenticated account (or `CLOUDFLARE_ACCOUNT_ID`). Another owner must select their own account, replace the application origin and provision their own accounts/secrets.

`scripts/build-pages.js` copies only `public/`, the QR decoder and the Pages proxy. It does not upload `accounts/`, `data/`, `.env`, test fixtures or reports. The backend's public workers.dev and preview URLs are disabled. Only the main Pages origin is accepted; preview addresses intentionally return 403. Standard Pages deploys publish the `main` branch.

## Background work, recovery and limits

Durable Object alarms finalize attendance after the class ends even with no open browser. They also wake for reminders and daily cleanup. Confirmed bookings without QR become absent; a successful scan becomes attended. The original class end is retained as the absence time. An alarm may run slightly late; it does not shorten the allowed QR window.

Cloudflare stores the hosted SQLite data and provides point-in-time recovery for SQLite-backed Durable Objects. Use the account's supported recovery controls before changing storage identity or making destructive changes. `npm run backup` backs up the local Node database only; it does not download the cloud database. Keep the previous Worker version and Pages deployment for code rollback, and preserve the live storage namespace. No remote restore drill or independent security acceptance is claimed.

Availability is subject to Cloudflare's service and account quotas; a free plan is not unlimited capacity. Payments remain simulated, university email/SSO is not integrated, and physical-camera/device usability acceptance remains pending. Hosted HTTPS permits browser camera access when the user grants permission.

## Report baseline

The two ten-page course reports describe the v1.2.2 local baseline as reviewed on 2 November 2026. This deployment note records the additional v1.3.0 Cloudflare runtime. Actual student authorship, IDs, contributions and course acceptance still require the team's real records.

References: [Express/Node HTTP on Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/), [SQLite-backed Durable Objects](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/).
