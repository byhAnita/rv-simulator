// src/tools/debugConsole.js
//
// A console for a phone. iOS Safari has no devtools worth reaching, and this
// project's two most phone-specific failure modes - localStorage quota and
// provider errors - are both reported through `console.error` and are therefore
// invisible on the device where they actually happen.
//
// THE RING BUFFER IS ALWAYS ON; THE PANEL IS OPT-IN. That order matters. A tool
// you must enable BEFORE the bug is a tool you use after reproducing the bug
// twice, and some of these bugs need a 20-round game to reach. Capture is cheap
// and bounded, so it runs from the first line of main.jsx and the panel simply
// renders what is already there.
//
// EVERY CAPTURED STRING IS REDACTED. The buffer exists to be copied out of the
// phone and pasted into a bug report, so a key that ever reaches a log line must
// not travel with it. Nothing in src/ logs a key today - this is what keeps that
// true after the next log line is added by someone who has not read the rule.

const MAX_ENTRIES = 300;
const MAX_CHARS = 2000;

const buffer = [];
let installed = false;
let listener = null;

// Provider key shapes: Aliyun `sk-ws-`/`sk-sp-`, DeepSeek/OpenAI `sk-`, Gemini
// `AIza`. Matched on the prefix plus enough body that a prose "sk-" cannot trip
// it, and replaced rather than dropped so a log still shows a key WAS there.
const REDACTIONS = [
  [/\bsk-[A-Za-z0-9_-]{6,}/g, "sk-***REDACTED***"],
  [/\bAIza[A-Za-z0-9_-]{10,}/g, "AIza***REDACTED***"],
  [/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer ***REDACTED***"],
];

export function redact(text) {
  let out = String(text);
  for (const [re, to] of REDACTIONS) out = out.replace(re, to);
  return out;
}

/** One console argument as a string. Never throws: a getter that does is common. */
function stringify(arg) {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ""}`;
  try { return JSON.stringify(arg, jsonSafe(), 1); }
  catch { return String(arg); }
}

// Cyclic structures are ordinary here - React elements, fetch responses - and a
// throw inside the capture layer would take out the log call it was wrapping.
function jsonSafe() {
  const seen = new WeakSet();
  return (_k, v) => {
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return "[circular]";
      seen.add(v);
    }
    if (typeof v === "function") return "[function]";
    return v;
  };
}

function push(level, args) {
  const text = redact(args.map(stringify).join(" ")).slice(0, MAX_CHARS);
  buffer.push({ t: Date.now(), level, text });
  // A ring, so a long session cannot grow without bound. The newest entries are
  // the ones worth keeping: a bug is reported right after it happens.
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  if (listener) listener(buffer.length);
}

/**
 * Wrap console and the two global error channels. Idempotent, and it ALWAYS
 * calls through to the original - a capture layer that swallows output would
 * make the desktop console worse in exchange for making the phone better.
 *
 * Call this first in main.jsx, before React renders, or boot-time errors are
 * exactly the ones it misses.
 */
export function installDebugCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  for (const level of ["log", "info", "warn", "error"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      try { push(level, args); } catch { /* never break the real log */ }
      original(...args);
    };
  }

  window.addEventListener("error", (e) => {
    push("error", [e.message, `${e.filename}:${e.lineno}:${e.colno}`, e.error?.stack || ""]);
  });
  // An unhandled rejection is how a failed round or a failed group fetch surfaces
  // when nothing awaited it, and it prints nowhere on a phone.
  window.addEventListener("unhandledrejection", (e) => {
    push("error", ["unhandled rejection:", e.reason]);
  });
}

export function getDebugLog() { return buffer.slice(); }
export function clearDebugLog() { buffer.length = 0; if (listener) listener(0); }
export function onDebugLog(fn) { listener = fn; return () => { listener = null; }; }

const FLAG = "rv_sim_debug";

/**
 * Is the panel enabled? `?debug=1` turns it on and persists, `?debug=0` off.
 *
 * Persisted because the panel is used across reloads - a PWA opened from the home
 * screen has no address bar to retype a query string into.
 */
export function debugEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("debug");
    if (q === "1" || q === "eruda") { localStorage.setItem(FLAG, q); return true; }
    if (q === "0") { localStorage.removeItem(FLAG); return false; }
    return Boolean(localStorage.getItem(FLAG));
  } catch { return false; }
}

/**
 * Load Eruda, a full mobile devtools panel, from a CDN. OPT-IN SEPARATELY via
 * `?debug=eruda`, and deliberately not the default.
 *
 * The built-in panel is the default because it needs no third party. This page
 * holds the player's API key in localStorage, and a CDN script runs with full
 * access to it - so pulling one in is a real trust decision, not a convenience.
 * It also cannot work offline, which the built-in panel can. Eruda is worth it
 * when the question is about network or storage rather than about log lines.
 */
export async function loadEruda() {
  if (typeof window === "undefined" || window.eruda) return Boolean(window?.eruda);
  const q = new URLSearchParams(window.location.search).get("debug")
    || (() => { try { return localStorage.getItem(FLAG); } catch { return null; } })();
  if (q !== "eruda") return false;
  try {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      // Pinned: an unpinned CDN URL is a third party choosing what runs next to a
      // stored API key.
      s.src = "https://cdn.jsdelivr.net/npm/eruda@3.0.1/eruda.min.js";
      s.onload = resolve;
      s.onerror = () => reject(new Error("eruda failed to load"));
      document.head.appendChild(s);
    });
    window.eruda.init();
    // Everything captured before the CDN answered would otherwise be lost, and
    // boot errors are the whole reason to look.
    for (const e of buffer) {
      const fn = window.eruda.get("console");
      if (fn) fn[e.level === "log" ? "log" : e.level](`[replay] ${e.text}`);
    }
    return true;
  } catch (e) {
    console.error("[debug] eruda unavailable, built-in panel still works:", e.message);
    return false;
  }
}
