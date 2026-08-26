# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Git commits

Never add "Co-Authored-By: Claude" or "🤖 Generated with Claude Code" (or any similar AI attribution) to commit messages. Commit messages should read as if authored solely by the repo owner.

The commit author stays `Likhitha-Guntaka <guntakalikhitha@gmail.com>`.

When a change has not been run — most often because Node is not installed on the
machine it was written on — say so plainly in the commit message, and name which
paths went untested. Do not let unexecuted work read as verified.

## Pushing

Two remotes:

- `origin` — https://github.com/Likhithaa-Guntaka/hushnote_ai (the fork)
- `upstream` — https://github.com/malavikasubramanian/hushnote_ai (the team repo)

After committing a fix, **push to `origin` only**. Do not push to `upstream`
directly. Upstream receives changes exclusively through reviewed pull requests
raised from `origin/main`, so a teammate sees the work before it reaches the
team's `main`. That review step matters more than usual here: changes are often
written on a machine without Node and land unexecuted.

After each push, report where `origin/main` points, and say whether
`upstream/main` is behind so it is clear when a PR is due.

Two hard rules:

- **Never force-push to `upstream`.** If a push there is ever rejected as
  non-fast-forward, upstream has commits this checkout lacks. Stop and report it.
  A force-push destroys a teammate's work.
- **Fetch both remotes before assuming anything about sync state.** Upstream
  moves independently, and a merged pull request lands there as a merge commit
  this checkout will not have until it fetches. Git reporting the branches as
  "diverged" often just means the PR was merged and local is behind — inspect
  before acting on it.
