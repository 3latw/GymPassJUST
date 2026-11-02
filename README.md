# GymPassJUST 1.2.1

Arabic/English HTML, CSS and JavaScript, Node 24, Express and persistent SQLite. Start with README_AR.md and docs/Discussion_Summary.pdf.

## Run

Run npm ci --ignore-scripts, then npm start. Open http://localhost:3000. Windows users can double-click Start-GymPass.cmd. Docker users can run docker compose up --build -d after starting Docker Desktop and freeing port3000. Docker execution is not claimed as tested; its engine was unavailable. Local Node and Docker use separate database locations.

On first launch, the app generates four local logins (two students, instructor, manager) and saves them to accounts/initial-accounts.md on your computer. Keep the adjacent JSON to reuse these initial accounts. These private files are generated locally and are not published in this repository. Password changes are not overwritten. Initial handover credentials are excluded from Git and public assets. University email/SSO and payment processing are separate; local account emails are identifiers and no email verification service is connected.

## Agreed behavior

The student buys a suitable plan, books a class and shows a signed rotating membership QR. The assigned instructor selects the class and scans this QR during the class. The server requires an active suitable subscription AND a confirmed booking before automatically recording attendance. Missing either condition returns an error and leaves attendance unchanged. Duplicate scans are idempotent. Scans are accepted from class start until end, without a ten-minute cutoff. Unscanned confirmed bookings become absent after class end; no automatic seven-day suspension applies. Reception/security roles and manual attendance routes are removed.

An active or queued plan is marked Subscribed and cannot be bought again until expiry. Booking opens48h before start and student booking cancellation closes2h before start. Capacity, duplicate bookings, overlapping reservations and FIFO promotion are checked transactionally. All purchases are simulated.

The camera uses native BarcodeDetector when available, with local jsQR1.4.0 fallback (Apache-2.0). Camera access needs permission and localhost/HTTPS; paste the QR text for a one-device demo. Image frames stay in the browser. Physical camera hardware was not exercised during automated verification.

## Verify and hand over

Run npm test, npm run test:load and npm run backup. Raw measured evidence is in evidence/. The QR decoder round-trip test verifies compatibility between encoded passes and jsQR. UI checks verify valid QR attendance, inactive subscription rejection, no-booking rejection and marked plans.

The app supports one instance. A real university pilot still needs authorized HTTPS/SSO hosting, off-host backups, actual usability participants, independent WCAG/browser/security checks and real team approvals/contributions. Production configuration remains in compose.production.yaml. The course baseline and the user's final changes are distinguished in the reports.

Release 1.2.1: assigned instructor and manager cancellation works until class end. Cancelled classes hide 24 hours after cancellation; completed classes hide 24 hours after end, while history remains. QR lifetime is two full minutes with refresh every 30 seconds and on tab return. Normal startup no longer generates members, subscriptions or classes; four local access accounts and three plans remain. Legacy fixture cleanup first saves a SQLite backup and preserves registered accounts, purchases and manually published classes.
