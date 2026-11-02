# GymPassJUST current agreed specification

The final user request governs this implementation: Arabic/English university design; student, instructor and manager accounts; instructor class publication; membership purchase with active-plan duplicate prevention;48h booking and FIFO waiting; instructor QR at the class door verifies subscription AND confirmed class booking, and automatically records attendance. A missing condition must return an error with no attendance change.

The assigned instructor selects their own class. Scanning is available starts<=now<ends, including after the first ten minutes. Duplicate scans are idempotent. Unscanned confirmed students become absent at class end; no automatic seven-day suspension applies. Manual attendance and reception/security roles are removed. Existing historical schema rows are preserved, but removed roles cannot log in or access any API.

Passwords are salted scrypt hashes, sessions HttpOnly, Origin+CSRF protect writes, signup forces member, only the manager provisions staff, QR tokens signed and limited to two minutes. Camera frames stay local and jsQR is served from the same origin. Camera hardware trials remain pending. Payments are simulated, official university accounts/SSO and email delivery are not connected.

The course baseline is CSP11 chapter13 printed161–170. Scope changes from the baseline are explicit in the reports; actual team contributions, signatures, IDs, user testing, hosting and independent acceptance are not invented. The four-member team and simple English oral explanation remain requirements. Quality thresholds in CONSTRAINTS.md are unchanged.

Release 1.2.1: assigned instructor and manager cancellation works until class end. Cancelled classes hide 24 hours after cancellation; completed classes hide 24 hours after end, while history remains. QR lifetime is two full minutes with refresh every 30 seconds and on tab return. Normal startup no longer generates members, subscriptions or classes; four local access accounts and three plans remain. Legacy fixture cleanup first saves a SQLite backup and preserves registered accounts, purchases and manually published classes.

Release 1.2.2 improves code names, plain control flow, readable HTML and explanation notes. The API, stored data and agreed behavior are unchanged; the existing tests and thresholds are retained.
