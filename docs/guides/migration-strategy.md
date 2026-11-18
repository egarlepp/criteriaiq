# CriteriaIQ → Claude Code: Migration Strategy & Prompt Guide

> **Scope note — this is NOT a database migration runbook.** This guide
> covers *migrating the development workflow onto Claude Code* (the
> CLAUDE.md onboarding prompt, coding-standard guardrails, and adoption
> strategy). If you're looking for how to move data or schema between
> environments, see Backup & Restore
> ([`../features/backup-restore.md`](../features/backup-restore.md)). For schema-change
> migrations specifically, see the Drizzle migration notes in
> [`PROJECT_REFERENCE.md`](../../PROJECT_REFERENCE.md).

## TL;DR

- **The CLAUDE.md file is your primary deliverable** — drop it in the repo root and Claude Code reads it automatically on every session. It's 10 sections covering onboarding, standards, security, skills, workflows, migration awareness, and guardrails.
- **The prompt is designed as a "teach to fish" system** — instead of hand-holding Claude through individual tasks, it gives Claude the mental model to self-navigate the codebase and produce work that matches your existing conventions.
- **Three things will make or break adoption:** (1) the onboarding audit actually getting run, (2) the developer reviewing Claude's recommendations before implementation, and (3) keeping PROJECT_REFERENCE.md current as the single source of truth.

---

## How the Prompt is Structured (and Why)

### Section-by-Section Rationale

| Section | Purpose | Why It Matters |
|---|---|---|
| **1. Onboarding Protocol** | Forces Claude to read before writing. 12-step orientation → structured audit → prioritized recommendations. | Without this, Claude will pattern-match from training data instead of your actual codebase. The forced read order ensures it understands your specific conventions before touching anything. |
| **2. Coding Standards** | Codifies your existing patterns as non-negotiable rules. | Claude Code tends to "improve" things by introducing patterns from other codebases. This section locks it into YOUR patterns — dark mode classes, schema barrel imports, PageLayout, etc. |
| **3. Security Posture** | Establishes Zero Trust as the default lens. Lists what exists and what to audit for. | Prevents Claude from weakening security "for simplicity" and gives it a checklist for security-adjacent changes. |
| **4. Skills Mapping** | Maps each Claude Code skill to CriteriaIQ-specific use cases. | Without explicit mapping, Claude won't know which skills to reach for. The table makes it obvious: finished a feature → testing skill, complex UI → design subagent, etc. |
| **5. Workflow Protocols** | Before/after checklists for every code change. | This is your quality gate. It ensures dark mode, i18n, lint compliance, and doc updates don't get forgotten. |
| **6. Deployment Awareness** | Self-hosted deployment requirements. | Critical for preventing Claude from writing platform-specific code or missing self-hosted requirements. |
| **7. Communication Style** | Matches your stated preferences: TL;DR first, tables, no fluff. | Claude Code defaults to verbose explanations. This section trains it to match your working style. |
| **8. Reference Files** | Quick-access table of authoritative docs. | Prevents Claude from guessing when the answer is in a doc it hasn't read. |
| **9. Success Criteria** | Concrete checklist of what "onboarded" means. | Gives you a testable way to verify Claude actually internalized the codebase. |
| **10. Guardrails** | Hard rules that can never be violated. | The safety net. Prevents destructive operations, unauthorized changes, and dependency sprawl. |

---

## Skills Claude Code Should Use

### Mandatory for This Project

| Skill | When | Why |
|---|---|---|
| **code-review** (architect) | After every major feature, before PRs | Deep analysis catches architectural drift. Use `evaluate_task` to verify work matches CriteriaIQ patterns. |
| **testing** (Playwright) | After every user-facing change | CriteriaIQ has complex auth flows, RBAC visibility rules, and WebSocket interactions that need e2e validation. |
| **web-search** | Dependency upgrades, CVE checks, API docs | React 19, Tailwind 4, Vite 8, Drizzle — all relatively recent. Training data may be stale. |
| **frontend-design** | New components, UI redesigns | But constrained to CriteriaIQ's existing design system (shadcn/ui + Tailwind + dark mode). |

### Use As Needed

| Skill | When | Why |
|---|---|---|
| **design-exploration** | When you say "show me options" or "explore alternatives" | Produces structured briefs before generating variants. |
| **diagram-generator** | Architecture audits, onboarding docs, system maps | Excalidraw diagrams for documenting the architecture Claude discovers during onboarding. |
| **visual-explainer** | Team communication, stakeholder presentations | Turn complex system explanations into interactive HTML pages. |
| **design** (subagent) | Complex multi-component UI work | For elaborate UI work that needs mockup sandboxes. |

### Not Directly Needed (But Available)

| Skill | Notes |
|---|---|
| **n8n-*** skills | Only if you integrate n8n workflows with CriteriaIQ |
| **meeting-notes** | Useful for processing team discussions about features |
| **morning-briefing** | Personal productivity, not project-specific |

---

## What Else to Incorporate

### High-Value Additions

1. **`.claudeignore` file** — Similar to `.gitignore`, tells Claude Code which files/directories to skip (e.g., `node_modules/`, `dist/`, `.env`, large binary assets). Reduces noise and prevents accidental modifications.

2. **Test data seed script reference** — If you have a seed script or test fixtures, reference them in the CLAUDE.md so Claude knows how to set up a local dev environment for testing.

3. **Environment variable manifest** — Create a `docs/guides/ENV_VARS.md` listing every env var, its purpose, whether it's required or optional, and its default. Claude Code needs this to avoid breaking deployments.

4. **PR template / commit message convention** — If you have conventions (e.g., conventional commits, PR templates), add them to Section 5 (Workflow Protocols) so Claude's output is merge-ready.

5. **Known tech debt register** — The DB refactor migrations (`migrations/db_refactor/`) are a great start. Document other known debt items so Claude can factor them into recommendations without rediscovering them each session.

6. **Performance baselines** — If you have Lighthouse scores, API response time targets, or bundle size budgets, add them. Claude can then flag regressions proactively.

7. **Integration credentials map** — Not the secrets themselves, but a map of which integrations exist (Salesforce, GitHub docs sync, email SMTP, cloud storage) and where their config lives. Prevents Claude from proposing integrations that already exist.

### Connectors to Set Up

| Connector | Value |
|---|---|
| **GitHub** | Essential. Claude Code reads the repo, creates branches, opens PRs. |
| **Asana** | Track audit findings and feature work as tasks. Connects to your existing workflow. |
| **Slack** | Post deployment notifications, get async questions answered. |

---

## Risk / Trade-Off Analysis

| Risk | Mitigation | Severity |
|---|---|---|
| **Claude introduces patterns that diverge from existing conventions** | Section 2 (Coding Standards) is extremely specific. Guardrail #10 prevents bypassing. Review the first 3-5 PRs closely to calibrate. | Medium |
| **Claude skips the onboarding audit** | The prompt structures it as a required protocol, but you should explicitly run `/onboard` as the first command and verify the output. | Low |
| **Stale PROJECT_REFERENCE.md** | The prompt declares it authoritative. If it drifts from reality, Claude's work will drift too. Treat it as a living doc — update it with every release. | High |
| **Security changes without review** | Guardrail explicitly blocks auth/security changes without review. But enforce this in your PR process too. | High |
| **Dependency upgrades breaking things** | The prompt requires CVE checks and justification before new deps. But complex upgrades (React 19, Tailwind 4) should still be staged and tested incrementally. | Medium |
| **Context window limits on large sessions** | CriteriaIQ is a big codebase. For large refactors, break work into focused sessions rather than one mega-session. | Medium |

---

## Suggested First Session Script

After dropping CLAUDE.md in the repo root, your first Claude Code session should look like:

```
You: Run the onboarding protocol from CLAUDE.md. Start with Phase 1 
     (read all reference files), then produce the Phase 2 audit report 
     and Phase 3 recommendations. Focus especially on:
     
     1. Security audit — any gaps in the auth/RBAC/encryption chain
     2. Dependency health — outdated packages, CVEs, deprecated APIs  
     3. Platform remnants — code paths, env checks, or comments that 
        should be cleaned up for self-hosted deployment
     4. Performance — DB query patterns, bundle size, lazy loading gaps
     5. Code quality — files over 800 lines, dead code, missing types
     
     Present findings as the structured report format in the prompt.
     Do not implement anything — recommendations only.
```

This gives you a baseline assessment before any implementation work begins.

---

## Maintaining the Prompt Over Time

The CLAUDE.md should evolve with the project:

- **After each release:** Update version references, add new conventions discovered during development
- **After new features:** Add their patterns to Section 2 if they establish new conventions
- **After architecture changes:** Update Section 6 (Deployment Awareness) and reference file paths
- **Quarterly:** Review Section 4 (Skills) for new skills that may have been added to the platform
