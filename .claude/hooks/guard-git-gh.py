#!/usr/bin/env python3
"""PreToolUse hook for Bash: hard-enforces the Lab 2 trust boundary.

Blocks (exit 2, reason on stderr) commands that would let an agent:
  - push to staging/main, force-push, or delete a remote branch
  - open or merge a PR whose base is not `dev`
  - set Project Status to Staging Candidate/Released, or set Human Review
  - change rulesets, branch protection, secrets, or repo settings

Everything else passes (exit 0). It fails closed for `gh pr merge` when the
PR's base branch cannot be determined. IDs below are Project field/option IDs
(not secrets); if the Project's fields are recreated, update them.
"""
import json
import re
import shlex
import subprocess
import sys

HUMAN_REVIEW_FIELD = "PVTSSF_lAHOCrib984Bl-YBzhoTMdY"
HUMAN_ONLY_STATUS_OPTIONS = {
    "79de7b4d": "Staging Candidate",
    "98236657": "Released",
}
PROTECTED = ("staging", "main")


def block(msg: str) -> None:
    print(f"BLOCKED by .claude/hooks/guard-git-gh.py: {msg}", file=sys.stderr)
    sys.exit(2)


def command_lists(cmd: str, depth: int = 0):
    """Yield one token list per simple command, splitting on ; && || | outside quotes.
    Bodies of `bash -c '...'` / `sh -c "..."` are checked recursively."""
    lex = shlex.shlex(cmd, posix=True, punctuation_chars=True)
    lex.whitespace_split = True
    try:
        toks = list(lex)
    except ValueError:
        toks = cmd.split()
    cur = []
    for t in toks + [";"]:
        if t and set(t) <= set(";&|()"):
            if cur:
                yield cur
                if depth < 3 and cur[0] in ("bash", "sh", "zsh") and "-c" in cur:
                    i = cur.index("-c")
                    if i + 1 < len(cur):
                        yield from command_lists(cur[i + 1], depth + 1)
            cur = []
        else:
            cur.append(t)


def check_push(w):
    args = w[w.index("push") + 1:]
    for a in args:
        if a in ("-f", "--force", "--force-with-lease", "--mirror", "--delete", "-d") or a.startswith("--force"):
            block("force-push or remote branch deletion is not allowed.")
        ref = a.split(":")[-1].removeprefix("refs/heads/")
        if a.startswith("+") or (":" in a and not a.startswith("-") and a.split(":")[0] == ""):
            block("force or delete refspec is not allowed.")
        if ref in PROTECTED:
            block(f"pushing to '{ref}' is human-controlled; open a PR into dev instead.")
    # bare `git push` / `git push origin` from a protected branch
    cur = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True).stdout.strip()
    if cur in PROTECTED:
        block(f"current branch is '{cur}'; work on a branch from dev.")


def option(w, *names):
    for i, a in enumerate(w):
        for n in names:
            if a == n and i + 1 < len(w):
                return w[i + 1]
            if a.startswith(n + "="):
                return a.split("=", 1)[1]
    return None


def check_pr_create(w):
    base = option(w, "--base", "-B")
    if base != "dev":
        block("`gh pr create` must pass `--base dev` explicitly (the default base is main).")


def check_pr_merge(w):
    args = w[w.index("merge") + 1:]
    if "--admin" in args:
        block("`gh pr merge --admin` bypasses branch rules and is not allowed.")
    target = next((a for a in args if not a.startswith("-")), "")
    cmd = ["gh", "pr", "view"] + ([target] if target else []) + ["--json", "baseRefName", "--jq", ".baseRefName"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    base = r.stdout.strip()
    if r.returncode != 0 or not base:
        block("could not determine the PR's base branch; refusing to merge (fail closed).")
    if base != "dev":
        block(f"PR base is '{base}'; only PRs into dev may be merged by an agent.")


def check_project_edit(w):
    if option(w, "--field-id") == HUMAN_REVIEW_FIELD:
        block("Human Review is set only by Elijah.")
    opt = option(w, "--single-select-option-id")
    if opt in HUMAN_ONLY_STATUS_OPTIONS:
        block(f"Status '{HUMAN_ONLY_STATUS_OPTIONS[opt]}' is human-controlled (staging/main promotion).")


def check_api(seg, w):
    if "graphql" in w and (HUMAN_REVIEW_FIELD in seg or any(o in seg for o in HUMAN_ONLY_STATUS_OPTIONS)):
        block("setting Human Review or a human-only Status through GraphQL is not allowed.")
    if re.search(r"rulesets|/protection|actions/secrets|dependabot/secrets|/hooks\b", seg):
        method = (option(w, "-X", "--method") or "GET").upper()
        if method != "GET" or "-f" in w or "-F" in w or "--input" in w:
            block("changing rulesets, branch protection, secrets or webhooks is not allowed.")


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    cmd = (data.get("tool_input") or {}).get("command", "")
    if not cmd:
        sys.exit(0)

    for w in command_lists(cmd):
        seg = " ".join(w)
        if "git" in w and "push" in w[w.index("git"):]:
            check_push(w[w.index("git"):])
        if re.search(r"\bgh pr create\b", seg):
            check_pr_create(w)
        if re.search(r"\bgh pr merge\b", seg):
            check_pr_merge(w)
        if re.search(r"\bgh project item-edit\b", seg):
            check_project_edit(w)
        if re.search(r"\bgh api\b", seg):
            check_api(seg, w)
        if re.search(r"\bgh (repo (edit|delete|archive|rename)|secret (set|delete)|ruleset)\b", seg):
            block("changing repo settings, secrets or rulesets is not allowed.")
    sys.exit(0)


if __name__ == "__main__":
    main()
