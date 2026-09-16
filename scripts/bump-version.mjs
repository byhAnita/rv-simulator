#!/usr/bin/env node
// bump-version.mjs - rewrite every version string in the repo in one pass.
//
//   npm run bump 1.3.3
//   npm run bump 1.3.3 -- --dry     (show the diff, write nothing)
//
// The version lives in 13 places across five files because App.jsx duplicates
// the i18n cover strings. Bumping them by hand is how a release ends up with a
// cover that disagrees with package.json, so this is the only supported way.
//
// Deliberately NOT rewritten: the README "What's New in vX" headings. Those are
// changelog entries, not version strings - a release adds a new section and
// leaves the old ones alone. Relabelling the previous release's notes would be
// silent and wrong, so every line containing "What's New in" is skipped.
//
// Smoke Layer A asserts the same 13 strings agree with package.json, so a
// partial bump fails the test suite and therefore fails deploy.sh preflight.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^\d+\.\d+\.\d+$/;

// path -> how many replacements must happen in it. A mismatch means the file
// was restructured and this script no longer knows where the strings are, so
// it aborts rather than writing a half-bumped tree.
export const EXPECTED = {
  "package.json": 1,
  "src/i18n/zh.js": 1,
  "src/i18n/en.js": 1,
  "src/i18n/ko.js": 1,
  "src/App.jsx": 3,
  "README.md": 6,
};
export const TOTAL_STRINGS = Object.values(EXPECTED).reduce((a, b) => a + b, 0);

const SKIP_LINE = "What's New in";

export function readCurrentVersion(root = ROOT) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return pkg.version;
}

// ASCII sketches in the README are column-aligned, so a version string that
// changes width (1.3.9 -> 1.3.10) would shear the art. Absorb the difference
// into the line's longest run of spaces. Returns null when there is no run big
// enough, so the caller can report it instead of writing broken art.
function realign(line, delta) {
  if (delta === 0) return line;
  const runs = [...line.matchAll(/ {2,}/g)];
  if (runs.length === 0) return null;
  let best = runs[0];
  for (const r of runs) if (r[0].length > best[0].length) best = r;
  const width = best[0].length - delta;
  if (width < 1) return null;
  return line.slice(0, best.index) + " ".repeat(width) + line.slice(best.index + best[0].length);
}

// Replace "v<old>" but never "v<old>.4" or "v<old>9" - a trailing digit or dot
// means this is a longer version string that merely starts with ours. Returns
// the rewritten line plus how many strings it actually replaced.
function replaceInLine(line, oldV, newV) {
  const esc = oldV.replace(/\./g, "\\.");
  let n = 0;
  const bump = (re, prefix) => {
    line = line.replace(re, () => {
      n++;
      return `${prefix}${newV}`;
    });
  };
  bump(new RegExp(`v${esc}(?![\\d.])`, "g"), "v");
  bump(new RegExp(`version-${esc}(?![\\d.])`, "g"), "version-");
  return [line, n];
}

export function bumpFile(relPath, text, oldV, newV) {
  const isReadme = relPath.endsWith("README.md");
  const isPkg = relPath.endsWith("package.json");
  const warnings = [];
  let count = 0;

  if (isPkg) {
    const needle = `"version": "${oldV}"`;
    if (!text.includes(needle)) return { text, count: 0, warnings };
    return { text: text.replace(needle, `"version": "${newV}"`), count: 1, warnings };
  }

  const lines = text.split("\n");
  const out = lines.map((line, i) => {
    if (isReadme && line.includes(SKIP_LINE)) return line;
    const [replaced, n] = replaceInLine(line, oldV, newV);
    if (n === 0) return line;
    count += n;

    // Only ASCII-art rows need realigning; prose reflows on its own.
    if (isReadme && line.includes("|") && replaced.length !== line.length) {
      const fixed = realign(replaced, replaced.length - line.length);
      if (fixed === null) {
        warnings.push(`${relPath}:${i + 1} sketch line could not be realigned, fix by hand`);
        return replaced;
      }
      return fixed;
    }
    return replaced;
  });

  return { text: out.join("\n"), count, warnings };
}

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const newV = args.find((a) => !a.startsWith("-"));

  if (!newV) {
    console.error("usage: npm run bump <x.y.z> [-- --dry]");
    process.exit(1);
  }
  if (!SEMVER.test(newV)) {
    console.error(`error: "${newV}" is not a x.y.z version`);
    process.exit(1);
  }

  const oldV = readCurrentVersion();
  if (oldV === newV) {
    console.error(`error: package.json is already at ${newV}`);
    process.exit(1);
  }

  console.log(`${oldV} -> ${newV}${dry ? "  (dry run, nothing written)" : ""}\n`);

  const pending = [];
  const warnings = [];
  let total = 0;
  let bad = false;

  for (const [rel, expected] of Object.entries(EXPECTED)) {
    const abs = join(ROOT, rel);
    const before = readFileSync(abs, "utf8");
    const { text, count, warnings: w } = bumpFile(rel, before, oldV, newV);
    warnings.push(...w);
    total += count;

    const ok = count === expected;
    if (!ok) bad = true;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${rel.padEnd(18)} ${count}/${expected}`);
    if (!ok) {
      console.log(`       expected ${expected} replacement(s), made ${count} -` +
        ` the file moved or the string changed shape`);
    }
    pending.push([abs, text]);
  }

  console.log(`\n  ${total}/${TOTAL_STRINGS} strings`);
  for (const w of warnings) console.log(`  warn ${w}`);

  if (bad) {
    console.error("\nABORT: nothing written. Fix the counts above, or update EXPECTED" +
      " in scripts/bump-version.mjs if the layout genuinely changed.");
    process.exit(1);
  }
  if (dry) return;

  for (const [abs, text] of pending) writeFileSync(abs, text);

  console.log("\nWritten. Next:");
  console.log(`    add a "## What's New in v${newV}" section to README.md by hand`);
  console.log("    npm run build && node test/smoke.mjs");
}

// Importable by the smoke suite without running the CLI.
if (process.argv[1] && process.argv[1].endsWith("bump-version.mjs")) main();
