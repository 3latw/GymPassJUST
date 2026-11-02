# Final QR attendance change

The instructor selects their class and scans the student's membership QR. The server checks the instructor, current class time, signature and expiry, then requires BOTH an active suitable subscription AND a confirmed booking in that class. If either is missing, it shows an error and does not record attendance. Otherwise attendance is saved automatically.

The full class is the scan window. Unscanned confirmed students become absent after class end. Duplicate scans report Already checked in. Students cannot manually submit their own attendance. Only students, instructors and the manager remain. The same active/queued plan is marked Subscribed and cannot be bought again until expiry. This final request supersedes intermediate verification-only and manual-attendance proposals.

Release 1.2.1: assigned instructor and manager cancellation works until class end. Cancelled classes hide 24 hours after cancellation; completed classes hide 24 hours after end, while history remains. QR lifetime is two full minutes with refresh every 30 seconds and on tab return. Normal startup no longer generates members, subscriptions or classes; four local access accounts and three plans remain. Legacy fixture cleanup first saves a SQLite backup and preserves registered accounts, purchases and manually published classes.
