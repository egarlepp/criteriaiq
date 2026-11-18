# Security Policy

## Supported Versions

CriteriaIQ is in beta. Security fixes are made on `main` and ship in the next release. Only the latest minor version receives fixes.

| Version              | Supported          |
| -------------------- | ------------------ |
| Latest minor (0.x)   | :white_check_mark: |
| Older minor versions | :x:                |

## Reporting a Vulnerability

**Do not open a public issue, discussion or pull request for a security problem.**

Report it privately through GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the issue, the affected version or commit, and the steps to reproduce it. A proof of concept helps.

You can expect:

- An acknowledgement within 5 business days.
- An assessment and, if the report is confirmed, a fix plan within 30 days.
- Credit in the release notes once a fix ships, unless you ask to stay anonymous.

Please give us a reasonable time to fix the issue before disclosing it publicly.

## Scope

In scope: the CriteriaIQ application code in this repository (server, client, migrations, Docker image build).

Out of scope: vulnerabilities in third-party dependencies that are already publicly known (Dependabot tracks those), findings that need a compromised admin account or host, and issues in self-hosted installs caused by their own configuration (for example a missing `ENCRYPTION_KEY` or a public database port).
