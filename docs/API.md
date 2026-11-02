# GymPassJUST API 1.2.2

Base /api. API routes require private cookie sessions. POST routes require the configured Origin and X-CSRF-Token from /bootstrap. Bodies are limited to16KiB. Roles are member, instructor and manager. Times are integer Unix milliseconds. Errors use {error:{code,message}}; input/business failures422, no session401, role/security403, missing record404, conflict409 and rate limit429.

| Method and path | Role | Behavior |
|---|---|---|
| GET /bootstrap | All | User, CSRF, time, membership and manager instructor list |
| POST /logout | All | Revoke session |
| GET /plans | All | Membership plans |
| POST /plans | Manager | Validate/create plan |
| GET /memberships | All | Own saved subscriptions |
| POST /memberships | Student or manager | Require Idempotency-Key; reject same active/queued plan with ALREADY_SUBSCRIBED409 |
| GET /classes | All | Paged timetable; instructor receives own classes |
| POST /classes | Instructor or manager | Publish future class; instructor ID forced to current instructor |
| POST /classes/:id/cancellation | Assigned instructor or manager | Cancel before class end, notify remaining booked students; idempotent |
| GET /classes/:id/roster | Assigned instructor or manager | Booking and attendance states |
| POST /bookings | Student | Confirm or waitlist; require eligible membership and48h window |
| GET /bookings | All | Own booking/attendance history |
| POST /bookings/:id/cancellation | Owning student | Require at least2h before start |
| GET /membership-pass | Student | Signed membership-purpose QR token, image and expiry |
| POST /class-qr-check-ins | Instructor | {classId,token}; require own running class, valid QR, active suitable subscription AND confirmed booking; mark checked_in atomically |
| GET /members | Manager | Paged membership lookup |
| GET /notifications | All | Own inbox |
| POST /notifications/read | All | Mark own inbox read |
| GET /dashboard | Manager | Membership and class aggregates |
| GET /audit | Manager | Paged audit log |
| GET, POST /accounts | Manager | List/create local accounts; only3 roles permitted |
| POST /account/password | Local account | Current password and new12–128 character password; revoke old sessions |

POST /auth/local/register always creates a student. POST /auth/local/login validates email/password. Both require the configured Origin and persistent request limits. Passwords use salted scrypt (N32768,r8,p3). Staff and student data are never accepted as authorization from a browser flag.

QR attendance: scan time must be starts<=now<ends. Both membership and booking are read server-side. A second valid scan returns alreadyCheckedIn:true without another write or notification. An unscanned confirmed booking changes to no_show only when class ends; checked_in becomes attended. The minute job uses class end for no_show_at after downtime. No automatic suspension is created.

Removed routes return404: /gate-pass, /gate-entries, /studio-check-in, /bookings/:id/check-in, /classes/:id/studio-pass and /members/:id/suspension-override. Historical schema records are preserved for a non-destructive upgrade. Old reception/security accounts cannot authenticate or access APIs.

GET /classes/:id returns class details to its assigned instructor or the manager. The timetable hides cancelled rows 24 hours after cancelled_at and completed rows 24 hours after ends; history stays stored. GET /membership-pass returns expiresAt and refreshAfterMs=30000. Tokens last 120000ms from issuance. Normal startup has four local access accounts, no seeded subscriptions or classes. Legacy seed removal is backed up and runs once.
