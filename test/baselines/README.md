# Baseline playthrough reports

**Committed on purpose. `test/.out/` is gitignored, so every measurement this project has ever
made lived in one untracked directory on one laptop** — 59 reports, 2.3 MB, one `git clean -xfd`
from gone. These six are the runs later work is compared against, so they are tracked.

Raw reports stay in `test/.out/` and stay ignored; a run is promoted here only when something
will be measured against it.

## What is here

The five configurations of the **105-round step 7 review** (2026-09-27), plus the validation run
that followed it:

| File | Config | Rounds | Graded |
| --- | --- | --- | --- |
| `zh-chaebol-high-pressure-r25.json` | zh, `财阀`, `高压舆论向`, 1+2 | 25 | 19 clean, 6 flagged |
| `zh-trainee-slow-burn-r20.json` | zh, `练习生`, `慢热现实向`, 1+2 | 20 | 17 clean, 3 flagged |
| `en-staff-harem-r20.json` | en, `Staff`, `修罗海王向`, TWICE 1+2 | 20 | 20/20 clean |
| `ko-ex-girlfriend-romantic-r20.json` | ko, `主线成员前女友`, `浪漫情感向`, 1+1 | 20 | 20/20 clean |
| `zh-kpop-artist-crossgroup-r20.json` | zh, `韩娱艺人`, cross-group + custom | 20 | 20/20 clean |
| `zh-chaebol-high-pressure-r25-CONFOUNDED.json` | same flags as row 1 | 25 | 24/25 — **do not use as a baseline** |

## Two limitations, both load-bearing

**1. The CONFOUNDED run is kept as evidence, not as a comparison arm.** It uses the same flags as
`zh-chaebol-high-pressure-r25.json` and was intended as the post-fix arm of an A/B — but the free
route's head had moved to a weaker model between the two runs, so median completion fell
1,710 → 969 for reasons unrelated to the prompt. It is retained because the three defects it *did*
surface are real and unfixed (see `docs/PROPOSALS.md` §7), and because it is the concrete example
behind `test/README.md`, *"`--route` does not control the model"*.

**2. None of these six records which model served it.** `served` is `null` in all of them: the
served-model recording landed in `493cfdb`, *after* these runs. **That cannot be recovered
retroactively** — the information was never written down. So a comparison against any of these
files can establish that numbers moved, but not that the model was held constant. Only runs made
from `493cfdb` onward carry the `served by:` line that makes an A/B mean anything.

Treat row 1 as the pre-fix arm for *directional* evidence, and pin a model explicitly for the
re-run rather than assuming the route will serve the same one.

## Adding one

```bash
cp test/.out/playthrough-<ts>.json test/baselines/<lang>-<identity>-<pace>-r<rounds>.json
```

ASCII slugs only — the identity and pace ids are Chinese and must not reach a filename. Say in
the table above what the run is *for*, and note anything that limits what it can prove.
