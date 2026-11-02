# GymPassJUST test report

2 November 2026 | Version 1.2.2

# What was checked

The existing 30 tests pass without changing their assertions. They check login, roles, plans, duplicate purchases, booking times, capacity, FIFO waiting, instructor QR attendance, class cancellation, 24-hour timetable hiding and safe legacy-data cleanup. They use separate test databases and controlled time.

Backend statement coverage is 93.92% and branch coverage is 86.32%. The required statement threshold stays at 70%. Coverage is a measure of executed code, not a guarantee that every possible case is correct.

# Local load check

| Requests | Seats | Confirmed | Waiting | Errors | p95 ms |
| --- | --- | --- | --- | --- | --- |
| 100 | 20 | 20 | 80 | 0 | 527.36 |
| 300 | 20 | 20 | 280 | 0 | 894.84 |

The load check uses Windows, Node 24, one process, disk SQLite WAL and loopback HTTP. Sessions are prepared before the requests. Internet latency, HTTPS and university hosting are outside this measurement.

# Readability changes

Service, class, booking and subscription variables have clear names. Role checks and booking eligibility use ordinary steps. Long HTML blocks are split across lines. These changes keep the same endpoints, data format and rules.

# What is still pending

Camera hardware, five independent usability participants, full browser/accessibility checks, independent security review and university hosting still need real acceptance work. Recorded backup/restore evidence is retained with its own date. No missing participant results or approvals are invented.

Run npm test and npm run test:load from the project folder to repeat the automated checks.
