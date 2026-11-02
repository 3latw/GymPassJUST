# OWASP review checklist

Update —1 November2026: only the assigned instructor scans QR for a running class. A valid signature, active suitable subscription and confirmed booking are all required. Repeated scans are idempotent. Public signup cannot create staff roles; security/reception roles are retired. Passwords remain salted scrypt hashes, writes require Origin+CSRF, sessions HttpOnly and authentication throttled. Four initial local credentials are outside Git/public assets. No real university identity or email verification is claimed.

Implementation references: [Node.js 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html) and [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). jsQR1.4.0 was added with installation scripts disabled, checked against its official repository and verified by an encoder/decoder test. The fresh runtime audit reports zero known vulnerabilities; four moderate development advisories remain under the existing review.

Reference: [OWASP Top 10 2025](https://top10.owasp.org/2025/), checked 31 October 2026. This is a scoped implementation review and acceptance checklist, not an independent penetration-test certificate.

| Category | Implemented control | Local evidence | Remaining acceptance |
|---|---|---|---|
| A01 Broken Access Control | Restricted API roles, booking ownership, assigned instructor checks | Unauthorized dashboard, roster and scan tests | Independent IDOR and privilege review |
| A02 Security Misconfiguration | Production requires TLS origin and external OIDC, demo is loopback only, CSP and no-store | Source/config review and HTTP checks | Inspect actual proxy, headers, secrets and host |
| A03 Software Supply Chain Failures | Lockfile, scripts disabled, production omits dev packages | Clean offline npm ci and runtime audit | Upstream development advisories and image digest review |
| A04 Cryptographic Failures | jose RS256 verification, HMAC SHA-256 QR, random session and signing material | Signed token expiry and tamper tests | Actual TLS and key access/rotation rehearsal |
| A05 Injection | Prepared SQL, escaped browser data, limited bodies and input schemas | Validation tests and source review | Independent injection and output-encoding review |
| A06 Insecure Design | Atomic capacity, FIFO promotion, idempotent simulated payment, transaction rollback | Domain, HTTP, race and mutation tests | Sponsor approval of refined business rules |
| A07 Authentication Failures | OIDC state, nonce, PKCE, issuer/audience, HttpOnly cookies and CSRF | Actual redirect flow and forged-state/token rejection | External provider and session lifecycle review |
| A08 Software or Data Integrity Failures | Unique indexes, capacity triggers, immutable payment reference, pinned source inputs | Database invariants and backup integrity | Reviewed deployment artifact and migration controls |
| A09 Security Logging and Alerting Failures | Audit for privileged actions, structured error events without tokens | Audit endpoint and role tests | Connect alerts and verify operator response |
| A10 Mishandling of Exceptional Conditions | Transaction rollback, explicit errors, JSON size cap and generic unexpected-error response | Failure-path tests and preserved state assertions | Proxy timeouts, resource exhaustion and independent fault review |

No critical/high known dependency advisory was reported in the recorded runtime audit. That statement does not imply zero application vulnerabilities. Retention, backup access and institutional policy require University IT and privacy review. Review the fixed c8/glob/minimatch development advisory deferral before the checkpoint or when upstream fixes become available.
