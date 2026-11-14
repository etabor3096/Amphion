# Agentic Workflow Retrospective: first run (Issue #33)

**Issue:** [#33 Add a build check on pull requests into dev](https://github.com/etabor3096/Amphion/issues/33)
**PR:** [#99](https://github.com/etabor3096/Amphion/pull/99), merged into `dev` on 2026-11-14
**Agent:** AiDev (`FruitFlyDev42`), Claude Code on the AiDev Windows account, started 2026-11-10

## Outcome

The configured workflow delivered #33 with no corrections to the code. AiDev added `.github/workflows/build.yml`
(`npm ci` + `npm run build` on PRs into `dev`) and updated the Definition of Done in `CLAUDE.md`. It then opened
PR #99 with the evidence body that `/finish-issue` requires. Once it ran, the `build` check passed. Elijah made
`build` a required check in `dev-integration` and merged the PR. Both agent-scope acceptance criteria were met.
The human-only criterion (the ruleset change) was left to Elijah, as the Issue asked.

## What worked without correction

- **Scope and authority.** The agent did not touch the ruleset. It listed "add `build` as a required check" under
  *Needs Elijah*, which matches `CLAUDE.md` and `POLICY.md`.
- **The PR evidence template.** The PR body followed the `/finish-issue` order exactly: Closes, acceptance criteria,
  checks run, architecture/policy, Needs Elijah. It was also honest about what it had not verified ("the live run of
  the `build` check ... confirm it is green before merging").
- **Workflow hygiene with no prompting.** It used least-privilege `permissions`, `persist-credentials: false`,
  `pull_request` rather than `pull_request_target`, a timeout, and a stable job name for the required check.

## Problems, surprises and interventions

1. **The Project Status never moved (the main problem).** `/finish-issue` step 5 says to move the item to Agent Review.
   #33 stayed on **Ready** through the whole run and PR, and Elijah moved it by hand. The agent's report did not flag
   this.
2. **Windows was not planned for (an intervention before the run).** The AiDev account runs Claude Code on Windows.
   The setup steps assumed Unix commands, and the guard hook only matched the `Bash` tool, not `PowerShell`. That
   meant the guardrails would not have fired. This was caught and fixed in #98 before #33 started.
3. **CI could not run at PR time.** The first `build` attempts never started, because GitHub had locked the account
   over billing. So the merge evidence waited on an external account fix, not on the code.
4. **A merge conflict between two config PRs.** #99 and #100 both edited the same Definition of Done lines in
   `CLAUDE.md`. The conflict was resolved by merging `dev` into the branch and keeping both lines.
5. **`Closes #33` did not close the Issue.** GitHub only auto-closes an Issue when the PR merges into the default
   branch (`main`), and #99 merged into `dev`. The Issue stays open until promotion, so Done in Dev and "closed" are
   different states.

## Root cause of problem 1

The likely cause is that AiDev's `gh` login cannot edit the Project. `gh auth login` does not grant the `project`
scope by default. The AiDev setup checklist checked `gh auth status` for the account name, but never checked the
scopes. A repo collaborator also does not automatically get write access to a user-owned Project. This could not be
confirmed from this machine, because the AiDev session transcript is on the Windows account.

The **process** cause is certain, though: step 5 of the skill had no read-back. An edit that failed or was skipped
looked the same as one that worked, so nothing escalated it. The rule "do not claim evidence you cannot verify" was
applied to code, but not to Project state.

## Improvement made

- `.claude/skills/finish-issue/SKILL.md`, step 5: after every Status edit, read the item back with
  `gh project item-list`. If the edit failed or the status did not change, stop retrying and put it under
  *Needs Elijah* with the exact error. The step now names the two likely causes and the fix
  (`gh auth refresh -s project`, which Elijah runs). Step 7 now reports the status as read back, not the status the
  agent meant to set.
- `CLAUDE.md`, Project Status rule: the same read-back rule in one line, so it also applies outside the skill.

**Why the next run should go better:** a Project move that fails now shows up in the PR and the report as a blocker
for Elijah, instead of failing silently. The fix is a check, not a new agent or hook, because the problem was missing
verification, not missing capability.

**Verification:** the guard hook still allows Agent Review (`244683b4`) and Done in Dev (`d635d035`), and still blocks
Staging Candidate, Released and Human Review. A fresh Claude session asked what it does when the Status edit fails
answered that it reads the item back and escalates under Needs Elijah. Still to check: on the AiDev account, run
`gh auth status` to confirm whether the `project` scope is missing.
