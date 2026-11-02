# Current requirement traceability

Final user scope overrides the textbook where explicitly recorded. See tests/current-scope.test.js, tests/rules.test.js, tests/http.test.js, tests/accounts.test.js and tests/qr-decoder.test.js.

| ID | Current behavior | Check |
| --- | --- | --- |
| FR-01 | Email/password login; student, instructor and manager roles | Public signup always creates a student |
| FR-02 | Manager defines membership plans | Validate price, duration and included types |
| FR-03 | Simulated plan purchase | Block the same plan while active or queued; an identical payment retry is safe |
| FR-04 | Manager or instructor publishes classes | Instructor publishes only under their own ID; check room/time clashes |
| FR-05 | Book within 48 hours with a suitable active plan | Never exceed capacity or accept a duplicate/overlapping booking |
| FR-06 | FIFO waiting list | Confirm the first eligible waiter when a place is cancelled |
| FR-07 | Cancel at least two hours before class | Accept the exact cutoff; reject a later cancellation |
| FR-08 | Student shows a rotating signed QR | The instructor scans it for a selected class |
| FR-09 | QR automatically records class attendance | Require BOTH an active suitable plan AND a confirmed class booking |
| FR-10 | No QR scan means absent after class end | No ten-minute deadline; automatic seven-day suspension is outside this revision |
| FR-11 | In-app confirmations and reminders | Deduplicate messages |
| FR-12 | Instructor cancels their own future class | Cancel its reservations and notify students |
| FR-13 | Manager views membership and booking totals | Use saved records; detailed class states remain in the roster |
| FR-14 | Student sees booking and attendance states | Show only their own records |
| FR-15 | Instructor verifies at the class door | Security/reception accounts were removed by the user |
| FR-16 | Manager views the audit log | Record purchases, publication and successful QR attendance |
