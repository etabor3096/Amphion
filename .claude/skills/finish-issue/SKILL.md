---
name: finish-issue
description: Close out an implemented GitHub Issue. Runs the reviewer, opens the PR into dev with an evidence body, and moves the Project item to Agent Review. Use when the code for an Issue is done and committed on its branch.
disable-model-invocation: true
---

# Finish an Issue

Use after the work for Issue `$ARGUMENTS` is implemented and committed on its own branch (from `dev`). This is the
repeatable hand-off; the rules it enforces live in `CLAUDE.md`. Do not skip steps or reorder them.

1. **Review first.** Delegate to the `reviewer` agent with the Issue number and branch. Fix every FAIL it reports and
   re-run it. Open the PR only on READY FOR PR. If it says ESCALATE, stop and ask Elijah; do not choose a side.
2. **Last local checks.** `npm run typecheck` and `npm run build` pass (once `ios/`, `pipeline/` or `firebase/` have
   commands in `CLAUDE.md`, run those too). For UI changes, take screenshots into `docs/screenshots/<view>/` as `CLAUDE.md` describes and commit them.
3. **Push the branch** (never `staging` or `main`): `git push -u origin <branch>`.
4. **Open the PR into dev**, always with an explicit base:
   `gh pr create --base dev --label ai-generated --title "<type>: <summary> (#<n>)" --body-file <file>`
   The body must have, in this order:
   - `Closes #<n>` and the Issue's plan key.
   - **Acceptance criteria**: each criterion with PASS / UNVERIFIED and its evidence, copied from the reviewer report.
   - **Checks run**: commands and results. Say plainly what was not run (for example an iPhone test).
   - **Architecture and policy**: rules A1 to A10 / `POLICY.md` points checked, and any concern.
   - **Needs Elijah**: anything only he can verify or decide.
   - Screenshot(s) if the change is UI (the ones committed under `docs/screenshots/`).
5. **Project status.** Move the item to **Agent Review** (`gh project item-edit`, Status field, option Agent Review
   `244683b4`). After the PR merges into `dev`, move it to **Done in Dev** (`d635d035`). Never set Staging Candidate,
   Released, or Human Review; the project hook blocks those.
6. **Merge** into `dev` only when CI is green (when a check exists), the reviewer said READY FOR PR, and no "Needs
   Elijah" item is open. Otherwise leave the PR open and tell Elijah what is waiting on him.
7. **Report** to Elijah: PR link, reviewer verdict, what was and was not verified, Project status.

Project IDs: project `PVT_kwHOCrib984Bl-YB` (number 1, owner `etabor3096`), Status field `PVTSSF_lAHOCrib984Bl-YBzhkpI84`.
Get an item id with `gh project item-list 1 --owner etabor3096 --format json`.
