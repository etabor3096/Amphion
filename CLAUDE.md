# Amphion: operating guide for Claude

Amphion turns a song (recorded or uploaded) into synced guitar and bass tabs. This file is the always-on guide. It points to
the detail; it does not repeat it. Do not put secrets in this file or anywhere else in the repo.

## Sources of truth (read by path, do not copy)

| Source | Use it for | Consult |
| --- | --- | --- |
| GitHub Issues + the Amphion Project | The work to do: scope, acceptance criteria, blockers, status | Before starting any work. `ROADMAP.md` is direction, not a substitute for an Issue |
| `docs/SDD.pdf` (text copy: `docs/SDD.txt`) | Product behavior and requirement IDs (US, RC, DD) | When behavior is unclear |
| `ARCHITECTURE.md` | Components, data flow, allowed calls, rules A1 to A10 | Before any work that touches structure, data, the clock, the pipeline or the stack |
| `POLICY.md` | Scope, privacy, accounts, legal limits, user-facing wording, what agents may do | Before any user-facing text, account/data work, or when unsure of authority |
| `ROADMAP.md` | Phases P0 to P8, gate G1, open decisions (OD) and their defaults, the pickup rule | To place an Issue and to find the default for an open decision |

The three docs live at the repo root (not `docs/`): every Issue body says "Read `AGENTS.md`, `ARCHITECTURE.md` and
`POLICY.md` first". `AGENTS.md` is the file map and rules for the React demo in `src/`; read it before touching `src/`.

If an Issue, these docs and the SDD disagree, or the SDD does not settle something: stop and ask in an Issue comment.
Do not guess.

## Taking work

Work only an Issue that meets all four: Status is Ready; Human Review is Reviewed (only Elijah sets this); no `blocked`
or `human-task` label; every "Blocked by #N" Issue is closed. If either the label or the "Blocked by" text says blocked,
it is blocked. One Issue is one branch and one PR. Do not start work the user has not pointed you at.

## Git and trust rules

- Branch from `dev`; open the PR into `dev` only. Never push to, merge into, or open PRs targeting `staging` or `main`.
  Promotion from `dev` to `staging` to `main` is Elijah's alone (Lab 2 rulesets `dev-integration` and `promotion-gate`).
- You may merge your own PR into `dev` when the rulesets allow it and the Definition of Done is met.
- Never change rulesets, required checks, IAM roles, billing or repo settings. Never create cloud projects or accounts.
- No force-push, history rewrites, or branch deletes on shared branches.
- Label AI-drafted Issues and PRs `ai-generated`.
- Project Status: you may move your Issue Ready, In Progress, Agent Review, then Done in Dev (after the PR merges into
  `dev`). Staging Candidate and Released are Elijah's. Never set Human Review.

## Commands

- `npm install`, `npm run dev` (Vite, http://localhost:5173), `npm run typecheck`, `npm run build` (typecheck + build).
- These cover the React demo only. Add commands for `ios/`, `pipeline/` and `firebase/` here as those folders appear.

## Definition of Done

- Each acceptance criterion in the Issue is checked, with concrete evidence (test output, command result, screenshot).
- `npm run typecheck` and `npm run build` pass, and any tests that exist pass. When a PR build check exists (Issue #33),
  it is green.
- UI changes include a screenshot in the PR. Non-UI changes do not need one.
- Docs are updated if behavior, structure or commands changed.
- The PR links the Issue, states what was and was not verified, and is labeled `ai-generated`.

## Project agents, skills and hooks (`.claude/`)

- `issue-gate` agent: run before starting an Issue, or to ask "does anything qualify?". Read-only; returns GO, NO-GO or ESCALATE.
- `reviewer` agent: run after implementing and before the PR. Read-only; checks acceptance criteria, A1 to A10, `POLICY.md`, typecheck and build.
- `/finish-issue <n>` skill: reviewer, then PR into `dev` with the evidence body, then Project status to Agent Review.
- `.claude/settings.json` + `hooks/guard-git-gh.py`: deterministic block on pushes to `staging`/`main`, force-pushes, PRs not based on `dev`,
  Staging Candidate/Released/Human Review changes, and ruleset or repo-settings changes. These are enforced, not advisory: do not try to work around a block, tell Elijah.

Flow: `issue-gate` (GO), implement, `reviewer` (READY FOR PR), `/finish-issue`. Implementation stays in the lead agent.

## Proceed alone, or stop and ask

Proceed alone on implementation choices inside the Issue's scope and the chosen stack (A10), and on open decisions only
by using the default in `ROADMAP.md`.

Stop and ask Elijah (an Issue comment, or in chat) before anything that affects: architecture or a rule A1 to A10;
security or privacy; policy or legal text; scope beyond the Issue; UX or user-facing wording not settled by the SDD or
`POLICY.md`; a schema change (A8); an open decision with no default; destructive actions; production data or cloud
resources; or any higher-trust branch.
