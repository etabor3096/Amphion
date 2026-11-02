<#
  Creates the Amphion HW/Lab 3 backlog on GitHub from docs/backlog/issues.json:
    1. labels (phase:P0..P8, area:*, ai-generated, human-task, blocked)
    2. Project fields: Phase (P0..P8), Human Review (Pending / Reviewed / Changes Requested), Sequence
    3. the 56 new issues, in order, with real "Blocked by #n" links
    4. sub-issue links (#29, #34) and GitHub "blocked by" dependency links
    5. every issue (new + #29-#34) added to the Project with Phase, Priority, Sequence, Area;
       new issues also get Status = Backlog and Human Review = Pending

  Safe to run again: issues whose [Px-yy] key already exists are skipped, and Status / Human Review
  are only set on issues created in that run, so your review progress is never reset.

  Run from the repo root, logged in to gh as the Project owner (etabor3096):
      gh auth refresh -s project        # once, so gh can edit Projects
      .\scripts\create-lab3-backlog.ps1 -DryRun   # preview
      .\scripts\create-lab3-backlog.ps1
#>
param(
    [string]$Repo = 'etabor3096/Amphion',
    [string]$Owner = 'etabor3096',
    [string]$ProjectMatch = '*Amphion*',
    [string]$BacklogPath = (Join-Path $PSScriptRoot '..\docs\backlog\issues.json'),
    [switch]$DryRun
)
$ErrorActionPreference = 'Continue'   # gh writes progress to stderr; exit codes are checked instead
$utf8 = New-Object System.Text.UTF8Encoding $false

function Fail($msg) { Write-Host $msg -ForegroundColor Red; exit 1 }
function Note($msg) { Write-Host $msg -ForegroundColor Cyan }
function Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow; $script:warnings++ }
$script:warnings = 0

# ---------------------------------------------------------------- checks
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Fail 'GitHub CLI (gh) is not installed.' }
$me = gh api user --jq '.login'
if ($LASTEXITCODE -ne 0) { Fail 'gh is not logged in. Run: gh auth login' }
if ($me -ne $Owner) { Write-Host "Note: gh is logged in as '$me'. Field setup needs the Project owner ($Owner)." -ForegroundColor Yellow }
if (-not (Test-Path $BacklogPath)) { Fail "Can't find $BacklogPath. Run this from the repo root after copying the Lab 3 files in." }
$data = Get-Content $BacklogPath -Raw -Encoding UTF8 | ConvertFrom-Json

$raw = gh project list --owner $Owner --format json --limit 50 | Out-String
if ($LASTEXITCODE -ne 0) { Fail 'gh cannot read Projects. Run: gh auth refresh -s project   then run this again.' }
$proj = ($raw | ConvertFrom-Json).projects | Where-Object { $_.title -like $ProjectMatch } | Select-Object -First 1
if (-not $proj) { Fail "No Project whose title matches '$ProjectMatch'." }
$projNum = $proj.number
$projId = (gh project view $projNum --owner $Owner --format json | ConvertFrom-Json).id
Note "Project: '$($proj.title)' (#$projNum)"

# ---------------------------------------------------------------- 1. labels
Note 'Labels'
$labels = @{
    'ai-generated' = @('8250df', 'Drafted by an AI agent; starts at Human Review = Pending')
    'human-task'   = @('d93f0b', 'Only Elijah can do this; agents must not take it')
    'blocked'      = @('b60205', 'Waiting on an open decision in Implementation Plan Section 6')
    'area:ios' = @('1d76db', 'SwiftUI app'); 'area:pipeline' = @('0e8a16', 'Python processing pipeline')
    'area:firebase' = @('fbca04', 'Firebase rules, functions, config'); 'area:devops' = @('5319e7', 'CI, environments, tooling')
    'area:docs' = @('c5def5', 'Persistent project documentation')
}
foreach ($p in $data.phases.PSObject.Properties) { $labels["phase:$($p.Name)"] = @('bfd4f2', "Implementation Plan phase $($p.Name): $($p.Value)") }
foreach ($l in $labels.Keys) {
    if ($DryRun) { Write-Host "  would create/update label $l"; continue }
    gh label create $l --repo $Repo --color $labels[$l][0] --description $labels[$l][1] --force | Out-Null
}

# ---------------------------------------------------------------- 2. project fields
Note 'Project fields'
function Get-Fields { (gh project field-list $projNum --owner $Owner --format json --limit 100 | ConvertFrom-Json).fields }
$fields = Get-Fields
$phaseNames = @($data.phases.PSObject.Properties | ForEach-Object { "$($_.Name) $($_.Value)" })
$freshHumanReview = $false

$phaseField = $fields | Where-Object { $_.name -eq 'Phase' }
$phaseOk = $phaseField -and (@($phaseNames | Where-Object { $phaseField.options.name -notcontains $_ }).Count -eq 0)
if (-not $phaseOk) {
    if ($DryRun) { Write-Host '  would replace the Phase field with options P0..P8' }
    else {
        if ($phaseField) {
            Write-Host "  The Phase field has options [$($phaseField.options.name -join ', ')]; the plan needs P0..P8." -ForegroundColor Yellow
            $ans = Read-Host '  Replace the Phase field? Existing Phase values are cleared and set again by this script (y/n)'
            if ($ans -ne 'y') { Fail 'Stopped. Rename the Phase options by hand to match the plan, then run again.' }
            gh project field-delete --id $phaseField.id | Out-Null
        }
        gh project field-create $projNum --owner $Owner --name 'Phase' --data-type SINGLE_SELECT --single-select-options ($phaseNames -join ',') | Out-Null
    }
}
if (-not ($fields | Where-Object { $_.name -eq 'Human Review' })) {
    if ($DryRun) { Write-Host '  would create Human Review (Pending, Reviewed, Changes Requested)' }
    else { gh project field-create $projNum --owner $Owner --name 'Human Review' --data-type SINGLE_SELECT --single-select-options 'Pending,Reviewed,Changes Requested' | Out-Null; $freshHumanReview = $true }
}
if (-not ($fields | Where-Object { $_.name -eq 'Sequence' })) {
    if ($DryRun) { Write-Host '  would create Sequence (number)' }
    else { gh project field-create $projNum --owner $Owner --name 'Sequence' --data-type NUMBER | Out-Null }
}
if (-not $DryRun) { $fields = Get-Fields }

function Field($name) { $fields | Where-Object { $_.name -eq $name } | Select-Object -First 1 }
function OptionId($fieldName, [string[]]$candidates) {
    $f = Field $fieldName; if (-not $f) { return $null }
    foreach ($c in $candidates) { $o = $f.options | Where-Object { $_.name -eq $c } | Select-Object -First 1; if ($o) { return $o.id } }
    foreach ($c in $candidates) { $o = $f.options | Where-Object { $_.name -like "$c*" } | Select-Object -First 1; if ($o) { return $o.id } }
    return $null
}
$areaNames = @{ ios = @('iOS', 'UI', 'App'); pipeline = @('Pipeline', 'Backend', 'ML'); firebase = @('Backend', 'Firebase'); devops = @('DevOps', 'Infra'); docs = @('Docs', 'Documentation', 'DevOps') }

$warned = @{}
function Set-Select($itemId, $fieldName, [string[]]$candidates) {
    $f = Field $fieldName; if (-not $f -or -not $f.options) { return }   # missing or not a single-select field
    $opt = OptionId $fieldName $candidates
    if (-not $opt) {
        $k = "$fieldName|$($candidates -join '/')"
        if (-not $warned.ContainsKey($k)) { $warned[$k] = 1; Warn "field '$fieldName' has no '$($candidates -join "' or '")' option; left blank" }
        return
    }
    gh project item-edit --id $itemId --project-id $projId --field-id $f.id --single-select-option-id $opt | Out-Null
}
function Set-Number($itemId, $fieldName, $value) {
    $f = Field $fieldName; if (-not $f) { return }
    gh project item-edit --id $itemId --project-id $projId --field-id $f.id --number $value | Out-Null
}

# ---------------------------------------------------------------- 3. issues
Note 'Issues'
$existing = gh issue list --repo $Repo --state all --limit 500 --json number,title | ConvertFrom-Json
$numByKey = @{}
foreach ($i in $existing) { if ($i.title -match '^\[(P\d-\d\d)\]') { $numByKey[$Matches[1]] = $i.number } }
$created = New-Object System.Collections.Generic.HashSet[string]
$tmp = Join-Path ([IO.Path]::GetTempPath()) 'amphion-issue-body.md'

function Resolve-Ref($ref) {
    if ($ref.StartsWith('#')) { return [int]$ref.Substring(1) }
    if ($numByKey.ContainsKey($ref)) { return $numByKey[$ref] }
    return $null
}

foreach ($iss in $data.issues) {
    if ($numByKey.ContainsKey($iss.key)) { Write-Host "  skip $($iss.key) (already #$($numByKey[$iss.key]))"; continue }
    $body = $iss.body
    foreach ($m in [regex]::Matches($body, '\{\{(P\d-\d\d)\}\}')) {
        $n = Resolve-Ref $m.Groups[1].Value
        $body = $body.Replace($m.Value, $(if ($n) { "#$n" } else { $m.Groups[1].Value }))
    }
    if ($DryRun) { Write-Host "  would create $($iss.title)  [$($iss.labels -join ', ')]"; $numByKey[$iss.key] = 0; continue }
    [IO.File]::WriteAllText($tmp, $body, $utf8)
    $url = gh issue create --repo $Repo --title $iss.title --body-file $tmp --label ($iss.labels -join ',')
    if ($LASTEXITCODE -ne 0 -or $url -notmatch '/issues/(\d+)') { Fail "Creating $($iss.key) failed. Fix the error above and run again; created issues are skipped." }
    $numByKey[$iss.key] = [int]$Matches[1]; [void]$created.Add($iss.key)
    Write-Host "  created #$($numByKey[$iss.key]) $($iss.title)"
    Start-Sleep -Milliseconds 1200   # stay under GitHub's content-creation rate limit
}
if ($DryRun) { Note 'Dry run finished. Nothing was changed.'; exit 0 }

# ---------------------------------------------------------------- 4. sub-issues and dependency links
Note 'Sub-issues and dependencies'
$idCache = @{}
function IssueId($n) { if (-not $idCache.ContainsKey($n)) { $idCache[$n] = gh api "repos/$Repo/issues/$n" --jq '.id' }; return $idCache[$n] }
function Try-Api([string[]]$apiArgs, $what) {
    $out = gh api @apiArgs 2>&1
    if ($LASTEXITCODE -ne 0 -and ($out -notmatch 'already|exists|duplicate')) { Warn "$what : $($out | Select-Object -First 1)" }
}
foreach ($iss in $data.issues) {
    if (-not $created.Contains($iss.key)) { continue }
    $n = $numByKey[$iss.key]
    if ($iss.parent) {
        $p = Resolve-Ref $iss.parent
        Try-Api @('-X', 'POST', "repos/$Repo/issues/$p/sub_issues", '-F', "sub_issue_id=$(IssueId $n)") "sub-issue #$n of #$p"
    }
    foreach ($d in $iss.deps) {
        $b = Resolve-Ref $d; if (-not $b) { continue }
        Try-Api @('-X', 'POST', "repos/$Repo/issues/$n/dependencies/blocked_by", '-F', "issue_id=$(IssueId $b)") "#$n blocked by #$b"
    }
}
if ($created.Contains('P5-05')) {   # existing #31 (Bluetooth delay) waits on the native playhead
    Try-Api @('-X', 'POST', "repos/$Repo/issues/31/dependencies/blocked_by", '-F', "issue_id=$(IssueId $numByKey['P5-05'])") '#31 blocked by P5-05'
}

# ---------------------------------------------------------------- 5. project items and fields
Note 'Project items'
function Add-Item($n) {
    $r = gh project item-add $projNum --owner $Owner --url "https://github.com/$Repo/issues/$n" --format json | ConvertFrom-Json
    return $r.id
}
foreach ($iss in $data.issues) {
    $n = $numByKey[$iss.key]; if (-not $n) { continue }
    $item = Add-Item $n
    Set-Select $item 'Phase' @("$($iss.phase) $($data.phases.($iss.phase))", $iss.phase)
    Set-Select $item 'Priority' @($iss.priority)
    Set-Number $item 'Sequence' $iss.seq
    Set-Select $item 'Area' $areaNames[$iss.area]
    if ($created.Contains($iss.key)) {
        Set-Select $item 'Status' @('Backlog', 'Todo')
        Set-Select $item 'Human Review' @('Pending')
    }
    Write-Host "  #$n $($iss.key) on the board"
}
foreach ($e in $data.existing) {
    $item = Add-Item $e.number
    Set-Select $item 'Phase' @("$($e.phase) $($data.phases.($e.phase))", $e.phase)
    Set-Number $item 'Sequence' $e.seq
    if ($freshHumanReview) { Set-Select $item 'Human Review' @('Pending') }   # Lab 2 issues were AI-drafted too
    Write-Host "  #$($e.number) (Lab 2) updated"
}

Note "Done. Created $($created.Count) issues. Warnings: $script:warnings"
Write-Host "Next: open the Project, group or filter by Human Review = Pending, and review each issue."
