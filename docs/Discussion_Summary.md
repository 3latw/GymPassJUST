# GymPassJUST discussion summary

SE440 CSP11 | Version 1.2.2 | 2 November 2026

## 1. What does the project do?

It manages gym plans, class bookings and attendance. A student buys a plan and books a class. The instructor publishes a class and scans student QR codes. The manager handles accounts, plans and reports. Pages switch between Arabic and English.

## 2. How is attendance recorded?

The instructor chooses their own running class and scans the student's QR. The server checks the code, membership and booking. Both an active suitable plan and a confirmed booking are required. If either is missing, it returns an error. Otherwise it saves attendance. A repeated scan does not create another record.

Scanning works from the beginning to the end of the class. A booked student without a scan is absent after the end. QR codes last two minutes and refresh every 30 seconds. There is no manual student attendance button or separate security/reception account.

## 3. What are the other rules?

Booking opens 48 hours before class. Student booking cancellation requires at least two hours. A full class has a FIFO waiting list: the first eligible waiter gets a cancelled seat. The assigned instructor or manager may cancel a class until it ends. Cancelled and completed classes leave the timetable after 24 hours; history stays saved. The same active or queued plan cannot be bought twice.

## 4. How does the code work?

HTML and CSS display the page. Browser JavaScript sends a request. src/server.js receives it. src/service.js checks the gym rules and uses SQLite. The server sends a result back to the page. Passwords are saved as hashes, and private cookies identify signed-in users.

## 5. What do the planning numbers mean?

Four students x eight hours x 14 weeks = 448 hours. This includes 384 planned hours and 64 risk hours. At an assumed JOD 5/hour, the baseline is JOD 2,240. An extra JOD 224 sponsor reserve gives a JOD 2,464 ceiling. These are estimates.

The NPV example uses JOD 1,000 net annual benefit for three years at 8% and gives about JOD 337.10. The EVM example uses PV=800, EV=720 and AC=900: SPI=0.90 and CPI=0.80. It illustrates delay and higher cost; it is not a record of actual team spending.

## 6. What was tested?

The 30 existing tests pass. Statement coverage is 93.92%. The local 300-request load check has 20 confirmed and 280 waiting for 20 seats, with p95 894.84 ms. Real camera devices, independent user acceptance and university hosting remain pending.

## Suggested explanation for four speakers

1. Explain the problem, users, schedule and cost estimate.
2. Show student signup, a plan, a booking and the language switch.
3. Show the instructor class and QR result, then explain the server checks.
4. Explain the tests, backup, remaining work and startup steps.

This is a rehearsal plan. The team must record its actual contributions separately. AI assistance is declared in the main report appendix.
