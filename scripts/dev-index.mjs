#!/usr/bin/env node
// dev-index.mjs - force index.html into dev mode (module entry = /src/main.jsx).
//
// Why this exists: index.html is committed in PRODUCTION mode, because that is
// what GitHub Pages serves from the repo root. Vite, however, reads index.html
// to find its entry - so building a clean clone makes Vite treat the committed
// `./assets/index-<hash>.js` as the entry and re-bundle the previous build
// instead of compiling src/.
//
// That failure is silent and nasty: the build succeeds, the bundle is the right
// size, and the site runs - it is just frozen at whatever `npm run deploy` last
// committed. Measured: 4 modules transformed instead of 55.
//
// So any build that starts from a clean checkout (Vercel, CI) must run this
// first. Idempotent - safe to run when index.html is already in dev mode.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const INDEX = join(dirname(fileURLToPath(import.meta.url)), "..", "index.html");
const DEV_TAG = '<script type="module" src="/src/main.jsx"></script>';

const before = readFileSync(INDEX, "utf8");

if (before.includes(DEV_TAG)) {
  console.log("index.html already in dev mode");
  process.exit(0);
}

// Drop the built asset references, whatever order they appear in.
let out = before
  .replace(/[ \t]*<script[^>]*src="\.\/assets\/[^"]*"[^>]*><\/script>\r?\n?/g, "")
  .replace(/[ \t]*<link[^>]*href="\.\/assets\/index-[^"]*\.css"[^>]*>\r?\n?/g, "");

if (!out.includes("</body>")) {
  console.error("ABORT: index.html has no </body> - refusing to guess where the entry goes");
  process.exit(1);
}

out = out.replace("</body>", `  ${DEV_TAG}\n</body>`);
writeFileSync(INDEX, out);
console.log("index.html switched to dev mode");
