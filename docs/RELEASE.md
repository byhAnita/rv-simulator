# Release workflow

Moved verbatim out of `CLAUDE.md` on 2026-10-21, when that file passed the
150k-character load limit. This is the release and deploy process now; keep it current.
Section names cited elsewhere as *CLAUDE.md, X* now live here. Read the dates, not the tense.

## Branch & Deploy Workflow

### Branches

| Branch | Role |
| --- | --- |
| `main` | Exactly what players are running. Served by GitHub Pages + Vercel. Tagged on every release. |
| `dev` | Integration branch for feature work. Branched from `main` at v1.3.2. **Never deployed.** |
| `hotfix/<slug>` | Off `origin/main`, one bug, **temporary** - merged into `main`, then `main` into `dev`, then deleted. `scripts/hotfix-worktree.sh` creates and reports on these. |
| `feat/<slug>` | Optional, off `dev`, for work risky enough to want to abandon cleanly. Not needed for routine changes. |
| `dev-v12.0.0` | **Frozen**, last active 2026-07-31, 46 commits behind the v1.3.x line. Never merge it. Also reachable as tag `archive/dev-v12.0.0`. |

**`main` never takes a direct source commit.** The only things that land on it are `--no-ff` merges from `hotfix/*` or `dev`, and `deploy.sh`'s own build-artifact commit. Committing a fix straight onto `main` means that between the first commit and the deploy, `main` is a state nobody has tested — and if you get interrupted there, the branch that defines "what players run" is sitting broken. A `hotfix/*` branch costs one extra command and means **`main` only ever receives changes that were already validated**. If the fix turns out to be wrong, you abandon a branch instead of reverting `main`.

This is enforced, not just asked for: `deploy.sh` refuses to run when the smoke suite is red, so an untested tree cannot reach players even if the process is skipped.

**The branch is named `dev`, not `dev-v<version>`, on purpose.** Its predecessor was `dev-v13.0.0`, created for a release target that never shipped; when the plan changed, the branch belonged to nothing and was never merged again. A plain `dev` has no expiry condition.

### The rule that keeps `dev` alive

**After every deploy, merge `main` back into `dev`.**

```bash
git checkout dev && git merge main && git push origin dev
```

This is not optional and not occasional. `deploy.sh` commits build artifacts (`assets/index-*.js`, a production-mode `index.html`) straight onto `main`, so **every single release leaves `main` with a commit `dev` does not have.** Skip the merge-back a few times and `dev` is behind; skip it for a month and it is another `dev-v12.0.0`. Nothing else in this workflow is fragile — this is. `deploy.sh` prints the command on completion for exactly this reason.

### Daily work

Stay on `dev`. Validate with **both** commands before every commit.

```bash
git checkout dev
npm run build && node test/smoke.mjs
git commit -am "feat: ..." && git push origin dev
```

### Release

Bump the version and write the new README "What's New" section as the **last commits on `dev`**, so the release merge is the only thing `main` sees.

```bash
git checkout dev
npm run bump 1.4.0                                # rewrites all 15 version strings
# hand-write the "## What's New in v1.4.0" section in README.md
npm run build && node test/smoke.mjs
git commit -am "chore: bump to v1.4.0" && git push origin dev

git checkout main && git pull
git merge dev --no-ff -m "release: v1.4.0"
npm run deploy                                    # red line: pushes to production
git tag v1.4.0 && git push origin v1.4.0
git checkout -- index.html                        # see note below
git checkout dev && git merge main && git push origin dev
node scripts/dev-index.mjs                        # back to dev mode
# then revise docs/.resume/v<x.y.z>.tex - the CV (gitignored, see below)
```

**The `index.html` step is not optional and not cosmetic.** `deploy.sh` restores that file to dev mode as an *uncommitted* change, and the deploy commit just rewrote the same file on `main` with the new bundle hash — so `git checkout dev` refuses to switch with "local changes would be overwritten". Discarding it is safe: `scripts/dev-index.mjs` regenerates it exactly, which is what the last line does.

Tag the **deploy commit**, not the merge commit — `npm run deploy` adds a commit after the merge, and a tag placed before it points at a tree whose `index.html` is still in dev mode.

**Every release also updates the CV in `docs/.resume/`, and that folder is gitignored.** Yuhan
applies for master thesis positions and entry-level roles in **applied LLM-agent development**, and
this project is the main piece of technical evidence on that CV — so a release that lands a measured
number or a technique and leaves the CV naming the previous version has thrown the evidence away.
After the tag and the merge-back: copy the newest `docs/.resume/v<x.y.z>.tex` to the version just
released, revise the Idol Dating Sim entry and the **Technical Skills** section against what
actually shipped, and leave the earlier revisions in place as history.

- **`docs/.resume/` is private and is never committed.** It holds a CV and job-application
  material, which is personal data and not project documentation — the rule `D:/workspace/career`
  already follows. `.gitignore` carries the directory, nothing in it has ever been tracked, and **no
  CV content belongs in a tracked file, a commit message, or the README.**
- **One page is a hard constraint.** The CV is already nearly full, so a new claim has to *displace*
  an old one — prefer rewriting a vaguer bullet to appending another.
- **Only measured numbers reach it.** Every figure must be traceable to a measurement recorded in
  this file. A calculated figure is labelled as calculated or left out; never present an estimate as
  a measurement, and never invent a metric this project has not taken.

### Hotfix (player-reported bug on a released build)

**First decide whether you need a hotfix at all.** If `dev` has nothing unreleased (`git log main..dev` is empty), there is no reason to branch the process — fix it on `dev` and cut a normal release. The hotfix path exists only for the case where `dev` holds in-flight work that cannot ship yet.

```bash
git checkout main && git pull                # start from exactly what players run
git checkout -b hotfix/<slug>

# 1. reproduce the bug first — a fix you cannot reproduce is a guess
# 2. fix in src/
# 3. add a regression check to test/smoke.mjs (see below)
npm run build && node test/smoke.mjs
npm run bump 1.3.3                           # hotfixes bump too, see below
git commit -am "fix: description"
git push -u origin hotfix/<slug>             # gives a Vercel preview URL to hand-test on device

git checkout main
git merge hotfix/<slug> --no-ff -m "fix: description (v1.3.3)"
npm run deploy                               # red line: pushes to production
git tag v1.3.3 && git push origin v1.3.3
git checkout -- index.html
git checkout dev && git merge main && git push origin dev
node scripts/dev-index.mjs
```

**A hotfix branch is TEMPORARY, and the last step is the one that gets skipped.** Deleting it is
still your call - branch deletion is a red-line action and is never done automatically - but it is
no longer left to memory: `scripts/hotfix-worktree.sh status` lists every `hotfix/*` branch with
whether its commits are contained in `main`, and prints the exact removal commands. Nothing is
lost by deleting a merged one: the merge commit and the tag both record it.

**Read `ahead` as a fact, not a verdict.** A branch can be finished and still show commits not in
`main`, because the fix reached players another way: the v1.4.1 year-wheel fix shipped through
`dev`, so its abandoned hotfix branch still reads `1 commit not in main` while `main` carries the
same behaviour by a different commit. That is why the report says *contained* or *not contained*
and leaves the judgement to a human - and why the command it prints for that case is `-D`.

#### Work a hotfix in a WORKTREE, not by switching this checkout

```bash
scripts/hotfix-worktree.sh new registers-404
```

A git worktree is a second working directory on the same repository, so `main` is checked out
somewhere else and **`dev` is left exactly as it was** - nothing stashed, no rebuild of whatever
was in flight, and `deploy.sh` is not one `git checkout` away from the wrong branch. The script
starts the branch from **`origin/main`** after a fetch, because a local `main` can be behind and a
hotfix has to sit on exactly what players are running.

**The location is the whole lesson, and we got it wrong the first time.** The v1.4.1 hotfix
worktree was created under `.../AppData/Local/Temp/claude/<session>/scratchpad/main-hotfix`, and a
session-scoped temp directory is the one place it must never go:

1. **Git's registration in `.git/worktrees/` outlives the directory.** Clean temp and the checkout
   is gone while `git worktree list` still advertises the path.
2. **A worktree LOCKS its branch.** `git branch -d hotfix/<slug>` is refused while any worktree
   claims it - so the cleanup that should be one command needs `git worktree remove` first, by a
   checkout nobody can find.
3. **Nobody can read the path.** Three weeks later there is no way to tell live work from debris.

So the path is a boring sibling of the repo - `../rv-simulator-v11-hotfix-<slug>` - and never
inside the repo either, where it is untracked in a tree `deploy.sh` stages from and every tree
scan walks a second copy of the app. **Smoke fails on a worktree inside the repo** and is
deliberately silent about a temp one: nested breaks the suite's own scans, temp is untidy and
harmless at deploy time, and only you can delete it - blocking a release on housekeeping nobody
but Yuhan may action is the wrong trade.

`node_modules` is the one wrinkle: a fresh worktree has none and `deploy.sh` runs a build. The
script junctions this checkout's when `package.json` and `package-lock.json` are identical between
the branches, and tells you to run `npm ci` when they are not - checked rather than assumed,
because a junction writes through and `npm install` inside a linked worktree would rewrite this
checkout's dependencies.

**Deploy from the worktree** - it is the checkout that has `main`. Then merge back **here**, which
is the step that keeps `dev` alive:

```bash
git fetch origin && git checkout dev && git merge origin/main && git push origin dev
node scripts/dev-index.mjs
```

#### Two version rules the goal implies, and neither was written down

**A planned version number is not reserved.** `docs/V140_PLAN.md` has called the next feature
release v1.4.2 for weeks, and a hotfix on v1.4.1 wants the same number - which is what produced a
version collision during the v1.4.1 release. The rule is that **the next number goes to whatever
ships first**, and a plan's version label is a nickname rather than a claim on the digit: if a
hotfix takes v1.4.2, the feature release becomes v1.4.3 and the plan document is edited. The
alternative considered was 4-part hotfix versioning (`1.4.1.1`), and it was rejected: it needs
three machinery edits - the `SEMVER` gate in `scripts/bump-version.mjs`, smoke's `package.json
version is x.y.z`, and smoke's `What's New in v<version>` guard - and it lengthens every version
string in the app for a case that arises once a release at most. **Deleting the reservation is
cheaper than supporting it.**

**A fix that changes no bundled file does NOT bump, tag, or open a README section.** The Pages
`.nojekyll` fix is the case: it touched no file Vite bundles, and the rebuild reproduced
`index-CiihP5yH.js`, the hash already deployed. There is nothing for a version to distinguish -
every player's cached bundle was already correct and only a data fetch was failing - so bumping
would have told players the code changed when it had not, and re-tagging would have moved a tag
that still names the right source. It is recorded in Project Status instead.

**The rule is measurable, which is the point:** build, and compare the hash against what `main`
already serves. Same hash means no bump. This is also why `deploy.sh` only **warns** when
`v<version>` is already a tag rather than aborting - re-deploying at the same version is a
legitimate act, and this is the shape of it.

**Always add a regression check to `test/smoke.mjs` as part of the fix**, and verify it fails against the unfixed code. This is already the convention in this repo — the Layer G key-page guards each encode a bug that reached a hand test. It also does double duty on the merge-back: if `dev` has rewritten the same area, the merge will conflict, and the guard is what proves the fix survived however you resolve it. Resolve in favour of `dev`'s structure, keep the fix's behaviour, and let the check confirm it.

**Hotfixes bump the version too.** The cover screen's version string is how a player tells you what they are running, so a build in the wild should never be ambiguous. A hotfix bumps the patch digit and **opens its own README "What's New" section**, marked `(hotfix)`.

**That sentence used to say the opposite** - *"adds a line to the current section rather than opening a new one"* - **and the suite forbids it.** Smoke asserts `README has a "What's New in v<package.json version>" section`, so a bump with no new section is a red suite and therefore a blocked deploy: the rule as written described a process that cannot complete. Two things make the section the right answer anyway - notes filed under the *previous* version's heading are notes a player cannot find, and `src/config/releaseNotes.js` needs its own entry for the new version regardless, because smoke ties `RELEASE_NOTES[0].version` to `package.json`.

**Keep the new version string out of the section's BODY.** `bumpFile` skips any line containing `What's New in`, so the heading is free - but a body line naming the version is counted, and README's expected count is exactly 6. Found on an abandoned hotfix branch, where the count failed at 7 with a perfectly reasonable sentence in it.

The correction was written on that same abandoned branch and therefore never shipped until now; a **version bump is not itself a hotfix**, so the Pages `.nojekyll` fix bumped nothing and opened no section - it changed no source at all.

### Version strings

Fifteen strings across six files must agree, and `npm run bump <x.y.z>` rewrites all of them:

```bash
npm run bump 1.3.3           # writes; run the validators afterwards
npm run bump 1.3.3 -- --dry  # show what would change, write nothing
```

**The `--` before `--dry` is mandatory.** Without it npm keeps the flag for itself (expanding it to its own `--dry-run`) and never passes it through, so `npm run bump 1.3.3 --dry` performs a **real bump** while looking like a rehearsal. Verified the hard way. `node scripts/bump-version.mjs 1.3.3 --dry` has no such trap.

| File | Count | Where |
| --- | --- | --- |
| `package.json` | 1 | `"version"` |
| `src/i18n/{zh,en,ko}.js` | 3 | `cover.desc` |
| `src/App.jsx` | 3 | the fallback cover strings, zh/en/ko |
| `README.md` | 6 | title, version badge, cost-section heading, three ASCII sketches |
| `CLAUDE.md` | 2 | the Project Overview title, the Add-on Features heading — **matched by anchor**, see below |

**CLAUDE.md is matched by anchor, not by version regex — most of its version numbers are history.** This file is largely changelog and post-mortem prose: "fixed in v1.3.7", "### v1.3.8 — GPT-6 Luna", "v1.3.5 introduced the dependency". Rewriting those would falsify the project's own record, which is worse than the drift the bump is meant to prevent. So `ANCHORS` in `scripts/bump-version.mjs` names the two lines that carry the *current* version as exact strings, and every other mention is untouched. Each anchor must match exactly once: zero means the heading was reworded, more than one means it is no longer unique, and either way the count check aborts the bump and fails smoke.

Both headers were added to the bump in v1.3.8, after the v1.3.7 release shipped with them still reading v1.3.6 — they look static, so they get forgotten.

**`**v1.3.8 is the current release.**` in Project Status is deliberately *not* anchored.** That whole paragraph is rewritten by hand each release anyway (it carries the check count, the live-test results and the branch state), so a stale version there is caught by the act of editing it. Anchoring it would only add a failure mode.

**The README "What's New in v…" heading is deliberately not bumped.** It is a changelog entry, not a version string — a release *adds* a new section and leaves the old ones alone. `bump` skips every line containing `What's New in` for exactly this reason; rewriting it would silently relabel the previous release's notes.

Two things keep this honest: the bump script realigns the ASCII sketch lines so a width change (`1.3.9` -> `1.3.10`) cannot break the art, and **smoke Layer C asserts all 15 agree with `package.json`**, so a partial bump fails the suite — and therefore fails `deploy.sh` preflight.

### Commit identity

Commits must be authored as `52732052+byhAnita@users.noreply.github.com` (set globally, and locally in this repo). **Vercel refuses to deploy a commit whose author it cannot match to a GitHub account** — it rejected the old `1677037640@qq.com` outright, blocking the deployment entirely.

Use the noreply alias rather than one of the account's real addresses: all of them are marked Private on GitHub, which normally also enables *Block command line pushes that expose my email*, and committing as one would start getting pushes rejected with `GH007`. Commits made before 2026-09-16 keep the old address — that is baked into their hashes and not worth rewriting history over.

### CI (`.github/workflows/ci.yml`)

Every push to `main`, `dev`, `hotfix/**` or `feat/**`, and every PR into `main` or `dev`, runs:
`npm ci` -> `node scripts/dev-index.mjs` -> `npm run build` -> `node test/smoke.mjs`.

**No secrets, and none should ever be added.** Offline smoke reads fixtures from `docs/`, mocks
`fetch` for the router layers, and skips every live layer when `API_KEY` is absent. The live
layers spend credits and are deliberately a local, deliberate action — putting a key in Actions
would make every push bill someone.

`dev-index.mjs` runs before the build for the same reason Vercel and Cloudflare need it: a clean
checkout of `main` has `index.html` in production mode, and Vite would re-bundle the committed
output instead of compiling `src/`. Without that step CI would pass while testing nothing.

**CI does not assert `index.html`'s mode.** It is committed in production mode on `main` and dev
mode on `dev`, so there is no single correct state across branches — such a check would fail every
push to `main`. `deploy.sh`'s `EXIT` trap is what restores the working tree.

This does not replace `deploy.sh` preflight, which still runs smoke itself. CI catches a broken
commit at push time; preflight is what makes it impossible to ship one.

### Vercel

Vercel builds **from source**, unlike GitHub Pages which serves the committed root `index.html` + `assets/`. Config lives in `vercel.json`:

```json
{ "framework": "vite", "installCommand": "npm ci",
  "buildCommand": "node scripts/dev-index.mjs && npm run build",
  "outputDirectory": "dist" }
```

**`scripts/dev-index.mjs` is not optional, and removing it fails silently.** `index.html` is committed in *production* mode because that is what Pages serves — but Vite reads `index.html` to find its entry, so on a clean clone it takes the committed `./assets/index-<hash>.js` as the entry and **re-bundles the previous build instead of compiling `src/`**. Measured: 4 modules transformed instead of 55. The build succeeds, the bundle is the right size, the site runs — it is just frozen at whatever `npm run deploy` last committed, so every branch preview shows `main`'s code while looking perfectly healthy. `dev-index.mjs` rewrites the entry to `/src/main.jsx` first (idempotent). Smoke Layer C asserts the build command still calls it.

Because Vercel builds from source, its production deployment can be **ahead of** the GitHub Pages one: a merge to `main` updates Vercel immediately, while Pages only changes when `npm run deploy` commits new artifacts. Deploy promptly after merging, or the two hosts disagree.

Branch previews are the reason this matters — pushing `hotfix/*` gives a URL to hand-test on a real phone before the fix reaches `main`.

### Cloudflare Pages

`idol-dating-sim.pages.dev` is the third mirror. Cloudflare does **not** read `vercel.json`, so the same two settings go in its dashboard by hand:

| Setting | Value |
| --- | --- |
| Build command | `node scripts/dev-index.mjs && npm run build` |
| Output directory | `dist` |

It has the identical entry-point trap as Vercel — without `dev-index.mjs` it re-bundles the committed build and serves a frozen site that looks fine.

### The three mirrors

| Host | URL | Source of truth |
| --- | --- | --- |
| GitHub Pages | `byhanita.github.io/rv-simulator/` | committed root `index.html` + `assets/` + `groups/` |
| Vercel | `idol-dating-sim.vercel.app` | built from `src/` |
| Cloudflare Pages | `idol-dating-sim.pages.dev` | built from `src/` |

Only Pages serves committed artifacts, which is why `npm run deploy` exists at all. The other two rebuild on any push to `main`, so **deploy promptly after a release merge** or the three disagree.

**The root `groups/`, `icons.svg` and `manifest.json` are load-bearing, not duplicates of `public/`.** `groupLoader.js` fetches `${base}groups/index.json` at runtime, and Pages serves the repo root — delete them and every group fails to load there. They are byte-identical to `public/` apart from a trailing newline, and smoke Layer C asserts the two `manifest.json` copies still parse equal.

**Nothing *automates* these mirrors — `deploy.sh` copies only `assets/*.js` and `*.css` — smoke Layer C fails when one drifts.** Two checks per tree: the file trees must match name-for-name, and every file must match in content with trailing whitespace stripped. Before that guard existed, editing a group JSON under `public/` left the Pages site serving the old cast data indefinitely, with no error and nothing a player could report.

**Root `worlds/` is the second such tree, added in v1.4.0.** The Layer C check loops over `["groups", "worlds"]` rather than naming one, because every mirrored tree added is another chance to forget — `rosters/` will be one more string in that array, not a third copy of the check. Copy `public/<tree>/` over root `<tree>/` by hand in the same commit; the suite tells you when you forget, and CI tells you on push.

### Pages serves the root THROUGH Jekyll, and Jekyll hides every `_*` path

**`.nojekyll` at the repo root is load-bearing, and its absence broke v1.4.1 on Pages
alone.** Reported from a phone on 2026-09-30, hours after the release: the cover and the
cast picker worked, and Setup then showed a full-screen `Loading...` for ever. Both
build-from-source mirrors were fine, which is the shape of the finding — **when one mirror
fails and two do not, the fault is in what makes that mirror different**, and what makes
Pages different is that it serves the committed tree rather than a build of it.

GitHub Pages runs Jekyll over that tree by default, and **Jekyll excludes every path whose
name begins with `_` or `.` from what it publishes.** Measured against the live site, 47
mirrored files, 6 not served, all six underscore-prefixed:

| path | served on Pages | read at runtime |
| --- | --- | --- |
| `worlds/_registers/{zh,en,ko}.json` | **404** | **yes — every world, every language** |
| `groups/_template/{zh,en,ko}.json` | 404 | no |

**The register is the file every world resolves its address forms through**, and
`parseWorld` **throws** on a register nobody ships rather than falling back — deliberately,
because a prompt with no address protocol reads as the model declining to use honorifics.
So `loadWorld` rejected, the rejection landed in `.catch(console.error)`, `world` stayed
`null`, and Setup's `if (!world)` gate rendered `Loading...` with no way out. Three correct
decisions composed into a silent hang.

**`groups/_template/` had been unserved on Pages since the repo began** and cost exactly
nothing, because no code reads it. That is why three releases of mirror checks never
surfaced the rule: the constraint was always violated and only became *reachable* in v1.4.1
step 1, which moved the address tables into `public/worlds/_registers/` — the first
underscore-prefixed path anything fetches.

**The fix renames nothing.** An empty `.nojekyll` turns Jekyll off and Pages serves the tree
verbatim, so no world file's `country.register` pointer moves and no tree is re-mirrored.
**It also changes no source**: the build after the fix reproduced `index-CiihP5yH.js`, the
hash already deployed, which is what says every player's cached bundle was correct all along
and only a data fetch was failing.

Two guards, and the split is the usual one — the first is derived, the second catches the
state the first cannot see:

- **`every mirrored data file is reachable on a Jekyll-served root`** walks the mirrored
  trees, collects every path with a `_` or `.` segment, and requires `.nojekyll` when that
  list is non-empty. **Derived, so a later `rosters/_shared/` is covered the day it lands**,
  and silent for a tree that needs no marker. Mutation-verified to name *both* trees and to
  fail on a brand-new underscore directory, because a guard pinned to the two directories
  that exist today is a sample.
- **`.nojekyll is committed, not merely present on disk`**. Pages serves what is committed,
  and `.gitignore` here carries deliberately broad secret patterns (`.env.*`, `*.local`), so
  a root dotfile is precisely the thing that can sit on disk, satisfy the check above, and be
  absent from the tree players get. **This guard failed on its very first run** — the file
  was created and not staged — which is the cheapest possible demonstration that it works.

**The general rule this earns: the checks asserted the two trees MATCH and never that the
host can SERVE them.** Every mirror check in this file compares `public/` against root, which
is a statement about the repo. A static host may transform, filter or rewrite what it is
handed, and that transformation is invisible to every offline check there is. The only thing
that sees it is a request to the live URL — which is why the diagnosis here was 47 `curl`s and
not a code read. **After a release, fetch a file from each mirror, not just the bundle.**

**And `?debug=1` already works on Pages** — `byhanita.github.io/rv-simulator/?debug=1` opens
the on-device console, which would have shown the 404 and the `parseWorld` throw immediately.
It is read before React mounts and is host-independent. Nothing needed adding; it needed
remembering.

**The check that would have caught this is an HTTP request, so it is now a script.**
`node scripts/verify-mirrors.mjs` fetches, from each of the three mirrors, `index.html`, the
bundle and stylesheet that file references, both `manifest.json` copies, and **every file in
the mirrored data trees** - 47 data paths today, derived by walking `groups/` and `worlds/`
rather than listed. `MIRRORED_TREES` and `MIRRORS` are exported from that script and
**imported by smoke**, so the offline Jekyll guard and the live verifier cannot drift into
covering different trees or a stale host list.

It is **not in the smoke suite and must not be.** `deploy.sh` gates on smoke, so a check that
needs three public hosts to answer would block a release on a bad connection - the same reason
the `YearWheel` browser harness stays out. `deploy.sh` prints the command on completion
instead, beside the merge-back it already prints.

**A 200 does not mean the file is there, and on one of these three hosts it routinely does
not.** Measured 2026-09-30, requesting `worlds/__nope__/zz.json` from each:

| host | a missing data path answers |
| --- | --- |
| GitHub Pages | `404`, `text/html` |
| Vercel | `404`, `text/plain` |
| **Cloudflare Pages** | **`200`, `text/html`, 678 bytes - byte-for-byte the app's own `index.html`** |

So a status-code check would have called a missing register **served** on Cloudflare. That is
*a fallback that returns plausible data hides the failure that produced it* arriving at the
host layer, and it inverts which mirror is the dangerous one: Pages failed loudly and was
diagnosable in 47 curls, while the two hosts that happened to be right this time include the
one that could hide the identical defect indefinitely. **The verifier therefore requires every
`.json` path to PARSE as JSON**, and reports `200 not-json` as its own failure kind, naming the
SPA shell when it recognises it.

`dist/` is **not** tracked. It was, contradicting `.gitignore`, until Cloudflare stopped serving it statically; it carried a bundle hash that existed nowhere else in the repo.

### Never derive a path from the hostname

**Every runtime URL must come from `import.meta.env.BASE_URL`**, which Vite fills from `base` in `vite.config.js` — `'./'` in a build, `'/'` under the dev server. The app is served at two different depths (`/rv-simulator/` on Pages, `/` on the other two), so a path that hardcodes either one breaks the others.

This shipped and reached players. `groupLoader.js` chose its prefix with `hostname.includes('localhost') ? '/' : '/rv-simulator/'`, so both mirrors requested `/rv-simulator/groups/index.json`, got a 404, and fell into `loadGroupIndex`'s `catch` — **which returns a hardcoded Red Velvet entry**. The cover page showed one group instead of nine and logged nothing a player would see, because the fallback swallowed the failure. Fixed in v1.3.5; smoke Layer C now fails the build if any `src/` file contains the literal subpath outside a comment.

The manifest has the same constraint and a subtler trap. `index.html` must reference it as **`/manifest.json`**, not `./manifest.json`: the leading slash makes Vite treat it as a public-dir asset and rewrite it to `./manifest.json` for the relative base. The relative form instead makes Vite resolve the *root* copy and emit a **second, hashed manifest** under `assets/` — one directory deeper, where the relative `./icons.svg` inside it no longer resolves. Making the manifest paths relative without this change fixes nothing.

### index.html rule

Always stays in **dev mode** (`<script type="module" src="/src/main.jsx">`). `deploy.sh` patches to production mode, commits + pushes, then restores dev mode. Never manually edit `index.html`.

Restoration is handled by an `EXIT` trap, so the dev-mode tag comes back even if the build, commit or push fails partway. If you ever do find it stuck in production mode (pointing at `./assets/index-*.js`), restore the dev `<script>` tag before deploying.

### What `npm run deploy` does

Preflight — the script **aborts before touching anything** if any of these fail:

1. Current branch is `main`. The script's `git push origin main` pushes the `main` ref regardless of where `HEAD` is, so running it from `dev` would commit the build onto `dev` and push a stale `main`.
2. `src/`, `README.md` and `CLAUDE.md` have no uncommitted changes. The script stages those paths, so anything half-finished in the working tree would otherwise ship to players silently. Commit first — that is the documented flow anyway.
3. `main` is not behind `origin/main`. Fails early with a clear message instead of after the commit is already made.
4. **`node test/smoke.mjs` passes.** This is the mechanism behind "`main` is always stable" — a red suite cannot reach players, whatever the process. There is deliberately no override; a failing check means fix it or remove it, not ship past it.

It also **warns, without aborting**, when `v<package.json version>` is already a tag — the signature of a forgotten `npm run bump`. A warning rather than a hard stop, because re-deploying a botched release at the same version is legitimate.

Then:

5. **`node scripts/dev-index.mjs`** — force `index.html` into dev mode, and install the `EXIT` trap that restores it. Without this the script only worked when `index.html` already happened to be in dev mode; after a `git checkout -- index.html`, a branch switch or a previous failed run it is in *production* mode, and Vite then either re-bundles the old output or dies on `Could not resolve ./assets/<hash>.js`.
6. `rm -rf dist`, then `BASE_URL="./" npm run build` — relative-path Vite build
7. **Only now** `rm -rf assets` and copy `dist/assets/*.js` + `*.css` into root `assets/`. Deleting `assets/` before the build meant a failed build wiped the bundle GitHub Pages was serving, leaving the live site broken until someone thought to run `git checkout -- assets/`.
8. Patch `index.html` to reference the hashed filenames
9. `git add index.html assets/ src/ README.md CLAUDE.md` -> commit -> `git push origin main`
10. Restore `index.html` to dev mode (not committed), via the `EXIT` trap
11. Print the tag and merge-back commands

**The staging list is not everything.** `deploy.sh` does not stage `test/`, `docs/`, `package.json` — or `deploy.sh` itself. In the release flow this never bites, because the merge from `dev` brings them. It does bite if you edit them on `main` and expect deploy to pick them up — commit those yourself first. Preflight check 2 only covers the paths the script *does* stage, so it will not catch these.

---
