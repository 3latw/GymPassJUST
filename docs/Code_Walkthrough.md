# GymPassJUST code walkthrough

Version 1.2.2 | Read this beside the source code

## Read these files first

| File | Main purpose |
| --- | --- |
| public/index.html | Loads the styles and browser JavaScript |
| public/ui.js | Builds login, navigation and form HTML |
| public/app.js | Shows pages, handles clicks and calls the server |
| public/i18n.js | Switches page text between Arabic and English |
| src/server.js | Defines URLs and checks who may call each one |
| src/service.js | Applies the gym rules |
| src/db.js | Creates SQLite tables |
| src/local-auth.js | Registers users, checks passwords and creates sessions |

## Follow one request

1. The student presses Book. The browser posts a class ID to /api/bookings.
2. server.js reads the signed-in user and calls service.book.
3. service.js checks the class, booking window, plan, duplicates and time clashes.
4. It counts occupied seats. A free seat means confirmed; a full class means waitlisted.
5. SQLite saves the booking and notification in one transaction.
6. The result returns to app.js, which updates the page.

A transaction groups related changes. They all succeed together, or none are saved. This prevents two simultaneous bookings from taking the same final seat.

## The important service functions

| Function | What to explain |
| --- | --- |
| membership | Find a plan covering the time and class type |
| bookedSeats | Count the occupied places in a class |
| eligible | Check a waiting student has a suitable plan and no clash |
| book | Confirm or waitlist a valid booking |
| cancel | Cancel a student's booking and try the next waiter |
| promote | Go through the waiting list in its saved order |
| buy | Save a simulated plan purchase and reject active duplicates |
| cancelClass | Cancel an instructor/manager's class and notify students |
| makeToken / verifyToken | Sign a short-lived QR and check its signature and dates |
| scanAttendance | Check instructor, time, QR, subscription and class booking |
| tick | Finish attendance and record no-shows after class end |

gymClass means the selected class, booking means a reservation and subscription means a saved membership. These names replace single-letter variables. The API field names and database columns stay the same.

## Follow a QR scan

The student pass contains a signed account reference and an expiry time. It does not contain the student's password. The assigned instructor sends the selected class ID and QR text to /api/class-qr-check-ins.

The checks run in this order: instructor owns the class; class is running; QR is valid; student account exists; a suitable active plan covers the class; and a confirmed booking exists. Success changes the booking to checked_in. A second valid scan returns Already checked in. The minute job later changes it to attended. Unscanned confirmed bookings become no_show only after the class ends.

## Explain login simply

local-auth.js stores a salted password hash. On login, it checks the entered password and creates a private session cookie. Later requests use that session to identify the user. The server decides the role; choosing a different role in a browser request does not grant permission.

auth.js also contains the optional university identity-provider path and the isolated test identity flow. They are separate from normal local email/password signup. legacy-data.js upgrades older generated datasets; it is not part of the normal booking flow.

## Explain the interface

ui.js contains the shared page HTML. app.js chooses the page and handles forms. classCard builds one timetable card: work out which button is available, choose a status, then return the HTML. escapeText makes user text safe to display. style.css supplies the base styles and theme.css supplies the blue university appearance.
