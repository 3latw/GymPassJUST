# Risk register

| ID | Owner | Probability | Impact hours | Risk | Trigger | Response |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | M1 | 0.3 | 24 | Four member capacity is lower than sponsor assumption | Weekly committed effort below 24h | Prioritize Must requirements; seek TA approval; use early planning reserve |
| R02 | M3 | 0.2 | 24 | Capacity race or database lock failure | Load test mismatch or busy errors | Transactional service, trigger and 100/300 request tests |
| R03 | M3 | 0.3 | 16 | External identity provider misconfiguration | Callback mismatch or invalid issuer | Exact callback checklist and local protocol fixture; rehearse external IdP |
| R04 | M3 | 0.3 | 16 | Incorrect FIFO or waitlist eligibility | Skipped valid member or wrong promotion | Stable created/id order, shared transaction, expiry and overlap tests |
| R05 | M4 | 0.2 | 12 | Wrong absence boundary or duplicate notification | A scan at the wrong time is accepted or a delayed job uses restart time | Injected-clock tests, use original class end, deduplicate notices and monitor job failures; no automatic suspension |
| R06 | M3 | 0.2 | 16 | Invalid QR acceptance or leaked signing key | Forged/expired QR accepted or key exposure | Verify signature/purpose/120-second expiry, require live membership and class booking, protect signing keys; valid repeated scan is idempotent |
| R07 | M2 | 0.3 | 16 | Arabic or accessibility defect | Overflow or keyboard blocker at 360px | RTL tokens, semantic controls and device checks |
| R08 | M4 | 0.3 | 16 | Free host or Docker unavailable | No test VM by week 8 | Use local Node demo and request university VM; rehearse deployment early |
| R09 | M4 | 0.1 | 24 | Database loss or unusable backup | Failed backup or restore integrity | Daily copies, separate restore test and off-host pilot copy |
| R10 | M1 | 0.2 | 24 | Privacy or unauthorized data exposure | Real data appears in source or logs | Synthetic seed, least privilege, retention and policy review |
| R11 | M4 | 0.4 | 12 | Five participant usability sessions delayed | Fewer than five volunteers in week 12 | Recruit in week 10 and use participant codes and short fixed tasks |
| R12 | M2 | 0.3 | 16 | UI and API mismatch | Unexpected state or repeated 4xx | Document contract, role smoke tests and integration rehearsal |
| R13 | M4 | 0.3 | 12 | Dependency advisory or version drift | Audit alert or clean install failure | Lockfile, scripts disabled, audit triage and isolated tested upgrades |
| R14 | M1 | 0.2 | 16 | Schedule or team-size interpretation rejected | TA feedback conflicts with screenshot or roster | Document discrepancy and obtain written decision without inventing approval |


Expected exposure: 60.4 hours. Reserve: 64 hours.
