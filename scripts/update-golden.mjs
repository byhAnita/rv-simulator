// scripts/update-golden.mjs
//
// Regenerate the golden system prompts in test/fixtures/.
//
//   node scripts/update-golden.mjs          # write, and report what changed
//   node scripts/update-golden.mjs --dry    # report only, write nothing
//
// Run this when you change buildSystemPrompt ON PURPOSE, then READ THE DIFF
// before committing. The diff is the review artifact: it is the only place a
// one-word edit to a shared rule shows up as the eleven lines it actually
// touched, across three languages and three casts.
//
// This is deliberately a separate script rather than a --update flag on
// test/smoke.mjs. A flag is something you reach for while a run is red, which
// is exactly when you should be reading the diff instead; a script is something
// you decide to run. Regenerating to make the suite green, without looking,
// converts the only prompt-regression detector in this repo into a rubber stamp.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { renderFixtures, goldenPath, ROOT } from "../test/fixtures/prompts.mjs";

const DRY = process.argv.includes("--dry");
const OUT = join(ROOT, "test", ".out");

mkdirSync(OUT, { recursive: true });

// Rendering twice is not paranoia: the whole reason these files exist is that
// buildSystemPrompt must be a pure function of the save, and writing a golden
// from unstable output would pin one arbitrary roll and fail on the next run
// for reasons nobody could read out of the diff. Fail loudly instead.
const first = await renderFixtures(OUT);
const second = await renderFixtures(OUT);

const unstable = first.filter((f, i) => f.text !== second[i].text).map((f) => f.id);
if (unstable.length) {
  console.error(
    `\x1b[31mNOT WRITTEN\x1b[0m — these fixtures render differently on consecutive calls:\n` +
    unstable.map((id) => `  - ${id}`).join("\n") +
    `\n\nbuildSystemPrompt must be a pure function of the save. Something in it is\n` +
    `reading Math.random(), the clock, or an unordered collection. Fix that first —\n` +
    `see "buildSystemPrompt must be a pure function of the save" in CLAUDE.md.`);
  process.exit(1);
}

let changed = 0, created = 0;
for (const { id, text } of first) {
  const path = goldenPath(id);
  const prev = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (prev === text) { console.log(`  \x1b[2munchanged\x1b[0m ${id}`); continue; }

  const label = prev === null ? "created" : "CHANGED";
  const colour = prev === null ? "\x1b[36m" : "\x1b[33m";
  if (prev === null) created++; else changed++;

  if (prev !== null) {
    const a = prev.split("\n"), b = text.split("\n");
    const delta = b.length - a.length;
    let firstDiff = 0;
    while (firstDiff < a.length && firstDiff < b.length && a[firstDiff] === b[firstDiff]) firstDiff++;
    console.log(`  ${colour}${label}\x1b[0m ${id} — first difference at line ${firstDiff + 1}` +
      `, ${delta === 0 ? "same line count" : `${delta > 0 ? "+" : ""}${delta} lines`}`);
  } else {
    console.log(`  ${colour}${label}\x1b[0m ${id} — ${text.split("\n").length} lines`);
  }

  if (!DRY) writeFileSync(path, text, "utf8");
}

if (DRY) {
  console.log(`\n--dry: nothing written. ${changed} would change, ${created} would be created.`);
} else if (changed || created) {
  console.log(`\n${changed} changed, ${created} created.`);
  console.log(`\x1b[1mNow read the diff\x1b[0m: git diff test/fixtures/`);
  console.log(`A change you cannot explain is a regression, not a refresh.`);
} else {
  console.log(`\nAll golden prompts already match. Nothing to do.`);
}
