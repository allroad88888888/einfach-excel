# Security Policy

## Supported versions

Only the latest published minor of the `0.x` line receives security fixes
(all five `@einfach/*` packages version as a fixed group — a fix ships as a
patch on the current minor for every package at once).

## Reporting a vulnerability

Use **GitHub private vulnerability reporting**
([Security → Report a vulnerability](https://github.com/allroad88888888/einfach-excel/security/advisories/new)).
Do not open a public issue for an unpatched vulnerability.

Include: affected package and version, a minimal reproduction, and the impact
you see. Formula-engine inputs (crafted formulas / imported workbooks) and the
worker RPC boundary are in scope; the demo site hosts no user data.

## Response expectations

This is a single-maintainer project without a paid response SLA:

- Acknowledgement: best effort within **7 days**.
- Assessment and fix window: agreed in the report thread; severity decides
  whether a patch release ships immediately or with the next minor.
- Credit: reporters are credited in the release notes unless they opt out.
