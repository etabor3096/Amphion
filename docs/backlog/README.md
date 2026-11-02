# Lab 3 backlog

`issues.json` is the AI-drafted backlog generated from the Amphion Implementation Plan (56 issues, P0 to P8).
`../../scripts/create-lab3-backlog.ps1` turns it into GitHub Issues and fills in the Amphion Project.
`../design/screens/` holds the React demo screenshots that the issues show as design references.

## Run it (PowerShell, main account etabor3096)

```powershell
cd <your Amphion clone>
git switch dev; git pull
git switch -c docs/lab3-backlog
# copy the docs/ and scripts/ folders from the zip into the repo root, then:
git add docs scripts
git commit -m "docs: add Lab 3 backlog spec, design screenshots and issue script"
git push -u origin docs/lab3-backlog
gh pr create --base dev --fill
gh pr merge --squash        # dev allows this with 0 approvals

gh auth refresh -s project                       # once, lets gh edit Projects
powershell -ExecutionPolicy Bypass -File .\scripts\create-lab3-backlog.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File .\scripts\create-lab3-backlog.ps1
```

The script asks before replacing the old Phase field (P1/P2) with P0 to P8. It is safe to run again:
issues that already exist are skipped and Human Review is never reset.
