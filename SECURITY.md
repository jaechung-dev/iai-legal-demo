# Security Policy

Security is treated as a first-class concern in this project — appropriate for a
platform handling legal and personal data.

## Reporting a vulnerability

Please report suspected vulnerabilities privately via GitHub Security Advisories
("Report a vulnerability" on the Security tab) rather than a public issue.
Expected acknowledgement: within 3 business days.

## Automated scanning (CI/CD)

Every push and pull request — and a weekly scheduled run — is scanned by
[`/.github/workflows/security.yml`](.github/workflows/security.yml):

| Layer | Tool | What it catches |
|---|---|---|
| **SAST** | CodeQL (JS/TS + Python) | Injection, unsafe patterns, taint flows |
| **Dependencies** | Dependabot, `npm audit`, `pip-audit` | Known-vulnerable / outdated packages |
| **Containers & IaC** | Trivy (`vuln,secret,misconfig`) | CVEs in images, misconfigurations |
| **Secrets** | Gitleaks | Committed credentials/keys |

Dependabot ([`/.github/dependabot.yml`](.github/dependabot.yml)) opens patch PRs
across npm, pip, Docker base images, and pinned GitHub Actions.

## Application security controls

- **AuthN/AuthZ** — custom JWT with bcrypt password hashing, refresh-token
  rotation, Google OAuth (CSRF state persisted in Postgres), and OTP.
- **Data ownership (IDOR-safe)** — every case-scoped query is filtered by the
  authenticated `user_id`; a user can only reach their own case data.
- **Least privilege** — per-Lambda IAM roles scoped to only the resources each
  function needs; deploy uses GitHub OIDC (keyless) rather than long-lived keys.
- **Secrets** — runtime configuration is read from AWS Secrets Manager, not the
  repo or environment files.
- **Transport** — HTTPS everywhere (CloudFront + API Gateway).
- **Access logging** — sign-ins are audited to `access_logs`.

## Supported versions

The `main` branch is the supported version; fixes land there first.
