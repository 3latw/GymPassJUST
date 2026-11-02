# GymPassJUST discussion summary

SE440 CSP11 | Short explanation for four speakers

# 1 What our system does

Students buy a plan, book a class and show their QR at the class door. The instructor selects that class and scans the QR. The manager handles accounts, plans and reports. The interface switches Arabic and English.

# 2 The rule we must explain

The QR checks TWO conditions together: an active suitable subscription AND a confirmed booking in the selected class. If either condition is missing, an error appears and attendance stays unchanged. If both are present, attendance is recorded automatically.

Scanning is allowed from the beginning of class until its end. It stays open after the first ten minutes. A student booked in the class who was not scanned becomes absent after class end. A second scan reports Already checked in. There is no manual attendance button and no separate security/reception account.

# 3 Booking and subscriptions

Booking opens 48 hours before start. Cancellation is allowed at least two hours before start. A full class uses a FIFO waiting list. The same plan cannot be purchased again while active or queued: its card is marked Subscribed. It can be purchased again after expiry. Payment is simulated.

[PAGE]
# 4 How it works

HTML/CSS/JavaScript builds the screens. Node.js checks requests. SQLite saves records. The server checks the instructor, time, QR signature, subscription and booking before recording attendance. A transaction keeps these changes together. Passwords use salted hashes; sessions use private cookies. Accounts belong to this project and are separate from official university systems.

# 5 A short demonstration

Show the student membership and class booking, then the student QR. Open the instructor account, select the running class and scan the code. Explain the green result. Try a student with no booking or no active plan to show the error. The clock tests demonstrate absence after class end without waiting during the presentation.

There are 30 passing tests, 93.89% backend statement coverage, and a local 300-request p95 of 689.93 ms. Coverage is not a correctness percentage. Five real users, independent reviews, hosting and camera hardware trials remain to be completed.

# 6 Four-speaker split

M1: problem, scope and plan. M2: student and instructor screens. M3: server checks, transactions and database. M4: tests and limits. This is a proposed speaking split; actual contributions must come from the team.
