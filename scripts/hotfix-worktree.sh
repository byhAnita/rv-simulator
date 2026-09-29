#!/usr/bin/env bash
# scripts/hotfix-worktree.sh
#
#   scripts/hotfix-worktree.sh new <slug>   # a clean checkout of main to fix one bug in
#   scripts/hotfix-worktree.sh status       # what worktrees exist, and which are wrong
#
# WHY A WORKTREE, and why this script rather than four git commands.
#
# A player-reported bug on a released build has to be fixed on top of exactly
# what players run, which is `main`. The primary checkout is normally sitting on
# `dev` holding in-flight work, so `git checkout main` there means stashing that
# work, rebuilding node_modules state, and then remembering to put it all back -
# with `deploy.sh` one command away, whose whole job is to push to production.
# A worktree is a second working directory on the same repository: `main` checked
# out somewhere else, `dev` left untouched, nothing stashed.
#
# WHAT WENT WRONG THE FIRST TIME, which is the only reason this file exists.
#
# The v1.4.1 hotfix worktree was created inside a SESSION-SCOPED TEMP DIRECTORY
# (.../AppData/Local/Temp/claude/<session>/scratchpad/main-hotfix). Three
# consequences, none of them obvious at the time:
#
#   1. Git's registration in .git/worktrees/ OUTLIVES the directory. When temp is
#      cleaned the checkout vanishes and `git worktree list` still advertises it,
#      so the repo carries a permanent reference to a path that no longer exists.
#   2. A worktree LOCKS its branch. `git branch -d hotfix/<slug>` is refused
#      while any worktree claims it - so the cleanup that should be one command
#      needs `git worktree remove` first, which is the command nobody remembers.
#   3. The path is unreadable. Nobody looking at `git worktree list` in three
#      weeks can tell whether that directory is live work or debris.
#
# So the path is a fixed, boring SIBLING of the repo, and this script never
# deletes anything: `status` prints the removal commands for a human to run,
# because removing a worktree deletes files and that is not a decision a script
# should make on its own.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARENT="$(dirname "$REPO")"
BASE="$(basename "$REPO")"

die() { echo "error: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------

# Delegates to scripts/worktree-hygiene.mjs rather than re-deriving the rule.
# The first version of this function compared git's C:/foo against bash's
# /c/foo, so it classified the PRIMARY checkout as a stranger and its
# inside-the-repo branch was unreachable - one rule, two implementations, and
# the shell copy was the dead one. That rule is now asserted by smoke too.
cmd_status() {
  node "$REPO/scripts/worktree-hygiene.mjs"
}
# ---------------------------------------------------------------------------

cmd_new() {
  local slug="${1:-}"
  [ -n "$slug" ] || die "usage: scripts/hotfix-worktree.sh new <slug>   (e.g. new registers-404)"
  case "$slug" in
    *[^a-z0-9-]*) die "slug must be lowercase letters, digits and hyphens: got '$slug'" ;;
  esac

  local branch="hotfix/$slug"
  local dir="$PARENT/$BASE-hotfix-$slug"

  git -C "$REPO" show-ref --verify --quiet "refs/heads/$branch" \
    && die "branch $branch already exists - 'status' will show you where"
  [ -e "$dir" ] && die "$dir already exists"

  # The decision that comes BEFORE the worktree, and it is usually "no worktree":
  # if dev holds nothing unreleased there is no in-flight work to protect, so the
  # cheap path is to fix it on dev and cut a normal release.
  git -C "$REPO" fetch origin --quiet
  local unreleased
  unreleased="$(git -C "$REPO" rev-list --count origin/main..origin/dev)"
  echo ""
  if [ "$unreleased" = "0" ]; then
    echo "NOTE: origin/dev holds nothing unreleased."
    echo "      A hotfix branch buys you nothing here - fix it on dev and cut a normal"
    echo "      release. This worktree is for the case where dev holds work that"
    echo "      cannot ship yet. Continuing anyway, since you asked."
  else
    echo "origin/dev is $unreleased commit(s) ahead of origin/main, so a hotfix branch is right:"
    echo "that work must not ride along with the fix."
  fi
  echo ""

  # Off origin/main, not local main: the local ref can be behind, and a hotfix
  # must start from exactly what players are running.
  git -C "$REPO" worktree add -b "$branch" "$dir" origin/main
  echo ""

  # node_modules: a fresh worktree has none, and deploy.sh runs a build.
  # A junction is instant and safe to READ from; it is only wrong if the two
  # branches want different dependencies, so check the lockfile rather than
  # assume. Never run npm install inside a linked worktree - it writes through.
  if git -C "$REPO" diff --quiet origin/main HEAD -- package.json package-lock.json; then
    echo "Dependencies identical to this checkout - linking node_modules (instant)."
    cmd="cmd //c mklink //J \"$(cygpath -w "$dir/node_modules" 2>/dev/null || echo "$dir/node_modules")\" \"$(cygpath -w "$REPO/node_modules" 2>/dev/null || echo "$REPO/node_modules")\""
    eval "$cmd" >/dev/null 2>&1 \
      && echo "  linked. Do NOT run npm install in the worktree - it writes through to this one." \
      || echo "  link failed; run 'npm ci' in the worktree instead."
  else
    echo "package.json / package-lock.json differ between the branches, so the"
    echo "worktree needs its own install. Run: (cd \"$dir\" && npm ci)"
  fi

  cat <<EOF

Worktree ready:  $dir
Branch:          $branch  (off origin/main)
This checkout is untouched, still on $(git -C "$REPO" rev-parse --abbrev-ref HEAD).

In the worktree, in order:

    1. reproduce the bug first - a fix you cannot reproduce is a guess
    2. fix it in src/
    3. add a regression check to test/smoke.mjs and verify it fails
       against the unfixed code
    4. npm run build && node test/smoke.mjs
    5. npm run bump <x.y.z>      # a hotfix bumps, and opens its OWN
                                 # README "What's New" section - smoke
                                 # requires a section for package.json's version
    6. git commit -am "fix: ..." && git push -u origin $branch
    7. hand-test on the Cloudflare branch alias, which is deterministic:
       $slug.idol-dating-sim.pages.dev   (hotfix/$slug -> hotfix-$slug if it has a slash)

Then the release, from the WORKTREE - it is the checkout that has main:

    git checkout main && git merge $branch --no-ff -m "fix: ... (vX.Y.Z)"
    npm run deploy
    git tag vX.Y.Z && git push origin vX.Y.Z
    node scripts/verify-mirrors.mjs

Then back in $REPO:

    git fetch origin && git checkout dev && git merge origin/main && git push origin dev
    node scripts/dev-index.mjs

And when it is all done, 'status' will tell you what is left to clean up.
EOF
}

case "${1:-}" in
  new)    shift; cmd_new "$@" ;;
  status) cmd_status ;;
  *)      echo "usage: scripts/hotfix-worktree.sh {new <slug>|status}" >&2; exit 1 ;;
esac
