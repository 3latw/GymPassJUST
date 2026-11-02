# Dependency and release review

31 October 2026. Runtime libraries express 5.1.0, jose 6.2.1 and qrcode 1.5.4 are pinned in package-lock.json. npm installation ran with lifecycle scripts disabled. Production installation omits development dependencies. The npm audit runtime result is recorded separately in runtime-audit.json.

The complete development audit reports moderate findings through c8 -> test-exclude -> glob/minimatch, concerning filesystem traversal after cancellation and denial of service from attacker-selected glob patterns. c8 is invoked only by a developer or CI with the fixed `src/**` include pattern. Member input never reaches the coverage tool, and the tool is not installed in the production container. No critical/high finding was reported in the recorded audit.

The registry's suggested remediation changes the direct c8 major version. It was not applied automatically. Keep the coverage threshold and tests intact, review upstream fixes and re-audit before the next development release. Review date: before the 21 November 2026 checkpoint, or sooner if an upstream fix is available. This is an explicit development-only deferral, not a claim that the packages are free of vulnerabilities.

Dependency audits match known advisories. They do not replace source review, protocol testing or an independent application security assessment. Production still requires TLS, protected database/secret storage, external OIDC and authorized role provisioning.
