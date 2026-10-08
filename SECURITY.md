# Security

Use the latest published version. Glance embeds third-party provider websites; their authentication and interface behavior can change independently of this project.

Report vulnerabilities using this repository's **Report a vulnerability** link if private vulnerability reporting is available. Otherwise, contact the maintainer privately before disclosing exploit details. Do not put credentials, session cookies, private screenshots, or working capture exploits in a public issue.

For ordinary bugs, use the bug report template with your app version, Windows version, selected provider, reproduction steps, and expected behavior. Remove personal information from attachments.

Glance isolates remote pages from its application-control API and validates privileged IPC. Screenshot capture sends data to the selected provider, which may upload it before Send is pressed. Windows capture exclusion is best-effort and is not a guarantee of invisibility. Executables are currently unsigned; SHA-256 checksums verify asset integrity, not publisher identity.

## Build dependencies

The app has no npm runtime dependencies; the packaged archive contains the application source, package metadata, and license. Electron itself remains part of the runtime and must receive security updates.

The lockfile updates `http-cache-semantics` to 4.3.0. The build-only `sprintf-js` dependency currently has [an advisory with no patched release](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), reported through the builder's optional proxy/logging dependency chain. Do not run builds against untrusted proxy or logging configuration. Track the upstream fix rather than forcing a downgrade of the working builder. CI rejects high and critical npm advisories; moderate advisories still require review.
