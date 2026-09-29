#!/usr/bin/env node
// scripts/worktree-hygiene.mjs
//
//   node scripts/worktree-hygiene.mjs        # report; exit 1 if anything is wrong
//
// One definition of "this worktree is in a place that will cause trouble", with
// two consumers: `scripts/hotfix-worktree.sh status` shells out to it for the
// human-readable report, and `test/smoke.mjs` imports the pure functions so the
// rule is asserted offline on every run. Two implementations of one rule is how
// `extractStoryText` came to have a guard written against the copy that was
// still correct.
//
// THE RULE, and the incident that produced it. The v1.4.1 hotfix worktree was
// created under .../AppData/Local/Temp/claude/<session>/scratchpad/main-hotfix.
// Git's registration in .git/worktrees/ outlives the directory, so when temp is
// cleaned the repo keeps advertising a path that no longer exists - and a
// worktree LOCKS its branch, so `git branch -d hotfix/<slug>` is refused by a
// checkout nobody can find. A worktree belongs at a stable, boring path outside
// both the repo and every temp directory.
//
// It is a REPORT and never a repair: `git worktree remove` deletes files.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Git prints Windows paths as C:/foo while bash computes /c/foo, and comparing
// the two silently classified the primary checkout as a stranger - so every
// comparison here goes through one normaliser rather than through whichever
// string its caller happened to have.
export const normalizePath = (p) =>
  String(p || "").replace(/\\/g, "/").replace(/^([a-zA-Z]):\//, (_, d) => `${d.toLowerCase()}:/`)
    .replace(/^\/([a-zA-Z])\//, (_, d) => `${d.toLowerCase()}:/`)
    .replace(/\/+$/, "");

export function parseWorktreeList(porcelain) {
  const out = [];
  let cur = {};
  for (const line of String(porcelain).split(/\r?\n/)) {
    if (line.startsWith("worktree ")) cur = { path: line.slice(9) };
    else if (line.startsWith("branch refs/heads/")) cur.branch = line.slice(18);
    else if (line === "detached") cur.branch = null;
    else if (line.trim() === "" && cur.path) { out.push(cur); cur = {}; }
  }
  if (cur.path) out.push(cur);
  return out;
}

// Returns { ok, kind, note }. `kind` is what is wrong, so a caller can act on a
// category rather than on prose.
export function classifyWorktree({ path, branch, repoRoot, existsOnDisk = true }) {
  const p = normalizePath(path);
  const root = normalizePath(repoRoot);

  if (p === root) return { ok: true, kind: "primary", note: "the primary checkout" };
  if (!existsOnDisk) {
    return { ok: false, kind: "gone", note: "REGISTERED BUT GONE FROM DISK - it still locks its branch" };
  }
  if (/(^|\/)(temp|tmp)(\/|$)/i.test(p) || /\/scratchpad(\/|$)/i.test(p)) {
    return { ok: false, kind: "temp", note: "IN A TEMP DIRECTORY - the registration will outlive the checkout" };
  }
  if (p.startsWith(root + "/")) {
    return { ok: false, kind: "nested", note: "INSIDE THE REPO - it shows as untracked and every tree scan walks it" };
  }
  return { ok: true, kind: "sibling", note: `ok${branch ? "" : " (detached)"}` };
}

export function auditWorktrees(porcelain, repoRoot, exists = existsSync) {
  return parseWorktreeList(porcelain).map((w) => ({
    ...w,
    ...classifyWorktree({ ...w, repoRoot, existsOnDisk: exists(w.path) }),
  }));
}

// A hotfix branch is TEMPORARY by design: off main, one bug, merged, gone. The
// only thing that makes "gone" happen is someone noticing, so the state is
// reported rather than left to memory. `ahead` is commits not in main, and it
// does NOT say the work is unshipped - the v1.4.1 year-wheel fix reached main
// through dev while its abandoned hotfix branch still read 1 ahead, because a
// reimplementation is a different commit. So the verdict names what is true
// (contained / not contained) and leaves the judgement to a human.
export function classifyHotfixBranch({ branch, ahead, containedInMain }) {
  if (containedInMain) {
    return { state: "merged", note: "finished - its commits are in main, so deleting it loses nothing" };
  }
  if (ahead === 0) {
    return { state: "empty", note: "no commits of its own - nothing was ever done on it" };
  }
  return {
    state: "open",
    note: `${ahead} commit(s) not in main - either still in flight, or abandoned after the fix shipped another way`,
  };
}

// ---- CLI ----------------------------------------------------------------

function main() {
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const porcelain = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
  const audit = auditWorktrees(porcelain, ROOT);

  console.log("Worktrees:\n");
  for (const w of audit) {
    console.log(`${w.ok ? "  " : "!!"} ${w.branch || "(detached)"}`);
    console.log(`     ${w.path}`);
    console.log(`     ${w.note}\n`);
  }

  // hotfix/* branches, whether or not a worktree claims one
  const branches = execFileSync("git", ["for-each-ref", "--format=%(refname:short)", "refs/heads/hotfix"],
    { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  if (branches.length > 0) {
    console.log("Hotfix branches (these are meant to be temporary):\n");
    for (const b of branches) {
      const ahead = Number(execFileSync("git", ["rev-list", "--count", `main..${b}`], { cwd: ROOT, encoding: "utf8" }).trim());
      let containedInMain = false;
      try {
        execFileSync("git", ["merge-base", "--is-ancestor", b, "main"], { cwd: ROOT, stdio: "ignore" });
        containedInMain = true;
      } catch { /* not an ancestor */ }
      const v = classifyHotfixBranch({ branch: b, ahead, containedInMain });
      console.log(`   ${b}  [${v.state}]`);
      console.log(`     ${v.note}\n`);
    }
  }

  const bad = audit.filter((w) => !w.ok);
  if (bad.length === 0 && branches.length === 0) { console.log("All clean."); return 0; }
  if (bad.length === 0) { console.log("No worktree problems."); return 0; }

  console.log("To clear these - YOUR call, every one of these commands deletes something:\n");
  for (const w of bad) {
    const slug = w.branch || "<branch>";
    if (w.kind === "gone") console.log(`    git worktree prune                      # ${slug}: path is already gone`);
    else console.log(`    git worktree remove --force "${w.path}"`);
    console.log(`    git branch -d ${slug}                   # -D if it was abandoned rather than merged`);
    console.log(`    git push origin --delete ${slug}        # only if it was pushed\n`);
  }
  console.log("Check what you would lose first:  git log --oneline main..<branch>");
  console.log("A merged branch also survives in its merge commit and its tag.");
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
