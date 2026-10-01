#!/usr/bin/env node
// scripts/verify-mirrors.mjs
//
// Post-deploy verification against the LIVE hosts. Fetches, from each of the
// three mirrors, index.html, the bundle and stylesheet that file references,
// both manifest copies, and EVERY file in the mirrored data trees.
//
//   node scripts/verify-mirrors.mjs            # all three mirrors
//   node scripts/verify-mirrors.mjs --only pages
//   node scripts/verify-mirrors.mjs --quiet    # failures and the summary only
//
// WHY THIS EXISTS, and why it is not in the smoke suite.
//
// Every offline mirror check compares public/ against the repo root, which is a
// statement about the REPO. A static host may transform, filter or rewrite what
// it was handed, and that is invisible to every offline check there is. v1.4.1
// shipped with worlds/_registers/<lang>.json 404ing on GitHub Pages alone -
// Jekyll hides every _* path - and the only instrument that could see it was an
// HTTP request to the live URL. The bundle had already been verified
// byte-for-byte on all three hosts and was perfect; the broken thing was a ~1KB
// JSON file nobody thought to request. So: after a release, fetch a DATA file
// from every mirror, not just the bundle.
//
// It stays OUT of test/smoke.mjs because deploy.sh gates on smoke, and a check
// that needs three public hosts to answer would block a release on a bad
// connection - the same reason the YearWheel browser harness stays out.
// deploy.sh prints this command on completion instead. What smoke does own is
// the two pure functions below plus the tree and host lists, which it imports
// from here so the offline guard and this verifier cannot come to disagree
// about what they cover.

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The mirrored data trees. Also imported by smoke's Jekyll guard: one list, so
// adding rosters/ later is one edit rather than two that drift.
export const MIRRORED_TREES = ["groups", "worlds"];

// servesCommittedTree is the property that caused the Pages-only bug: that host
// serves the repo root through Jekyll, the other two serve a build of src/. It
// is a field rather than a comment because "one mirror failed and two did not"
// is the diagnosis, and this is what makes that one different.
export const MIRRORS = [
  { id: "pages", name: "GitHub Pages", base: "https://byhanita.github.io/rv-simulator/", servesCommittedTree: true },
  { id: "vercel", name: "Vercel", base: "https://idol-dating-sim.vercel.app/", servesCommittedTree: false },
  { id: "cloudflare", name: "Cloudflare Pages", base: "https://idol-dating-sim.pages.dev/", servesCommittedTree: false },
];

// ---- the two pure functions, unit-tested by smoke ------------------------

// The plan IS the requirement: every data file is probed, not just the bundle.
// Checking only the bundle is exactly what v1.4.1 did after its release.
export function buildProbePlan({ treeFiles = [], assetRefs = [] } = {}) {
  const plan = [{ path: "", kind: "html" }, { path: "manifest.json", kind: "json" }];
  for (const ref of assetRefs) plan.push({ path: ref, kind: "asset" });
  for (const f of treeFiles) plan.push({ path: f, kind: f.endsWith(".json") ? "json" : "asset" });
  return plan;
}

// A 200 is not proof the file is there. Measured 2026-09-30: Cloudflare Pages
// answers a missing data path with 200 text/html and the app's own index.html,
// byte for byte - so a status-only check reports a missing register as served.
// Requiring the JSON to PARSE is what closes that, and it is the same rule as
// "a fallback that returns plausible data hides the failure that produced it",
// one layer down from the app.
export function classifyResponse({ kind = "asset", status = 0, body = "" } = {}) {
  if (status !== 200) return { ok: false, reason: `HTTP ${status}` };
  if (kind !== "json") return { ok: true, reason: "" };
  try {
    JSON.parse(body);
  } catch {
    const shell = /<!DOCTYPE html/i.test(body);
    return { ok: false, reason: shell ? "200 not-json (SPA shell)" : "200 not-json" };
  }
  return { ok: true, reason: "" };
}

// ---- CLI ----------------------------------------------------------------

const walkTree = (dir, prefix = "") => {
  const out = [];
  for (const e of readdirSync(join(ROOT, dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walkTree(dir, rel));
    else out.push(rel);
  }
  return out.sort();
};

const treeFiles = () =>
  MIRRORED_TREES.flatMap((tree) => walkTree(tree).map((f) => `${tree}/${f}`));

async function get(url) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    return { status: res.status, body: await res.text() };
  } catch (e) {
    return { status: 0, body: "", err: e.message };
  }
}

// Each mirror's own index.html decides its own bundle, deliberately: the three
// CAN disagree - Vercel and Cloudflare rebuild on any push to main while Pages
// changes only when npm run deploy commits artifacts - and that disagreement is
// a finding, not a detail.
const assetRefsIn = (html) =>
  [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map((m) => m[1]);

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) out.push(await fn(items[i++]));
  }));
  return out;
}

async function main() {
  const only = process.argv.includes("--only")
    ? process.argv[process.argv.indexOf("--only") + 1] : null;
  const quiet = process.argv.includes("--quiet");
  const mirrors = only ? MIRRORS.filter((m) => m.id === only || m.name === only) : MIRRORS;
  if (mirrors.length === 0) {
    console.error(`no such mirror: ${only}. Known: ${MIRRORS.map((m) => m.id).join(", ")}`);
    process.exit(2);
  }

  const data = treeFiles();
  console.log(`Verifying ${mirrors.length} mirror(s): ${data.length} data files + index.html + manifest + assets\n`);

  let failed = 0;
  const bundles = new Map();

  for (const m of mirrors) {
    const index = await get(m.base);
    const refs = index.status === 200 ? assetRefsIn(index.body) : [];
    const js = refs.find((r) => r.endsWith(".js")) || "(none)";
    bundles.set(m.name, js);

    const plan = buildProbePlan({ treeFiles: data, assetRefs: refs });
    const results = await pool(plan, 8, async (item) => {
      const r = item.path === "" ? index : await get(m.base + item.path);
      const verdict = classifyResponse({ kind: item.kind, status: r.status, body: r.body });
      return { item, ...verdict, err: r.err };
    });

    const bad = results.filter((r) => !r.ok);
    failed += bad.length;
    const tag = m.servesCommittedTree ? "  [serves the committed tree]" : "";
    console.log(`${bad.length === 0 ? "OK  " : "FAIL"} ${m.name}${tag}`);
    console.log(`     ${m.base}`);
    console.log(`     bundle ${js}`);
    console.log(`     ${results.length - bad.length}/${results.length} served`);
    for (const b of bad) {
      console.log(`     ${b.reason.padEnd(24)} ${b.item.path || "index.html"}${b.err ? ` (${b.err})` : ""}`);
    }
    if (!quiet && bad.length === 0) console.log("     every JSON parsed");
    console.log("");
  }

  const distinct = new Set(bundles.values());
  if (mirrors.length > 1) {
    if (distinct.size === 1) {
      console.log(`All ${mirrors.length} mirrors serve ${[...distinct][0]}`);
    } else {
      console.log("MIRRORS DISAGREE on the bundle:");
      for (const [k, v] of bundles) console.log(`     ${k}: ${v}`);
      failed += 1;
    }
  }

  console.log(failed === 0 ? "\nALL SERVED" : `\n${failed} PROBLEM(S)`);
  process.exit(failed === 0 ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
