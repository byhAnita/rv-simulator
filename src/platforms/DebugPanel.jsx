// src/platforms/DebugPanel.jsx
//
// The on-device console. Reads the ring buffer debugConsole.js has been filling
// since boot, so opening it shows what already happened rather than starting a
// recording.
//
// IT IS BUILT AROUND COPY-OUT, NOT AROUND READING. A 300-line log on a 390px
// screen is unreadable, and the actual workflow is: hit a bug, tap Copy, paste it
// into a bug report on a machine with a real screen. Everything else here serves
// that - the level filter narrows what gets copied, and the counts say what is
// there without scrolling.

import React, { useEffect, useState } from "react";
import {
  getDebugLog, clearDebugLog, onDebugLog, loadEruda,
} from "../tools/debugConsole";

const LEVELS = ["error", "warn", "log"];

export default function DebugPanel({ theme = "dark", onClose, extra }) {
  const isLight = theme === "light";
  const [, bump] = useState(0);
  const [only, setOnly] = useState(null);
  const [copied, setCopied] = useState("");
  const [erudaOn, setErudaOn] = useState(() => Boolean(window?.eruda));

  // The buffer is mutated in place by the capture layer, so the panel subscribes
  // rather than polling.
  useEffect(() => onDebugLog(() => bump((n) => n + 1)), []);

  const all = getDebugLog();
  const shown = only ? all.filter((e) => e.level === only) : all;
  const counts = LEVELS.reduce((m, l) => ({ ...m, [l]: all.filter((e) => e.level === l).length }), {});

  const time = (t) => new Date(t).toTimeString().slice(0, 8);

  // The report, not just the log. A log without the build and the device is a log
  // you have to ask three follow-up questions about.
  const asText = () => [
    `# rv-simulator debug log`,
    `when: ${new Date().toISOString()}`,
    `ua: ${navigator.userAgent}`,
    `viewport: ${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio}`,
    `url: ${location.href}`,
    extra ? `state: ${JSON.stringify(extra)}` : "",
    `entries: ${shown.length} of ${all.length}`,
    "",
    ...shown.map((e) => `[${time(e.t)}] ${e.level.toUpperCase()} ${e.text}`),
  ].filter(Boolean).join("\n");

  const copy = async () => {
    const text = asText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied("copied");
    } catch {
      // iOS refuses clipboard writes outside a user gesture in some versions, and
      // a silent failure here wastes the one thing the panel is for. Fall back to
      // a selectable textarea the player can long-press and copy by hand.
      setCopied("manual");
    }
    setTimeout(() => setCopied(""), 2500);
  };

  const bg = isLight ? "#faf7f0" : "#12060f";
  const border = isLight ? "rgba(100,65,20,.25)" : "rgba(232,135,176,.3)";
  const dim = isLight ? "#8a6840" : "#a07090";
  const colorOf = (l) => (l === "error" ? (isLight ? "#a03010" : "#f07070")
    : l === "warn" ? (isLight ? "#96700f" : "#e0c060")
    : (isLight ? "#3a2510" : "#c8b0c0"));

  const btn = (active) => ({
    padding: "4px 9px", borderRadius: 8, cursor: "pointer", fontSize: 10,
    border: `1px solid ${active ? colorOf("warn") : border}`,
    background: active ? (isLight ? "rgba(150,112,15,.12)" : "rgba(224,192,96,.14)") : "transparent",
    color: active ? colorOf("warn") : dim,
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: bg, display: "flex", flexDirection: "column", fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace" }}>
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: colorOf("log") }}>
            console · {all.length}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: dim, fontSize: 17, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <button onClick={() => setOnly(null)} style={btn(only === null)}>all</button>
          {LEVELS.map((l) => (
            <button key={l} onClick={() => setOnly(only === l ? null : l)} style={btn(only === l)}>
              {l} {counts[l]}
            </button>
          ))}
          <button onClick={copy} style={{ ...btn(false), borderColor: colorOf("warn"), color: colorOf("warn") }}>
            {copied === "copied" ? "copied ✓" : copied === "manual" ? "select below" : "copy"}
          </button>
          <button onClick={clearDebugLog} style={btn(false)}>clear</button>
          {!erudaOn && (
            <button onClick={async () => setErudaOn(await loadEruda())} style={btn(false)}>eruda</button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", WebkitOverflowScrolling: "touch" }}>
        {shown.length === 0 ? (
          <div style={{ color: dim, fontSize: 11, padding: 14, textAlign: "center" }}>
            nothing logged{only ? ` at level ${only}` : ""} yet
          </div>
        ) : shown.slice().reverse().map((e, i) => (
          // Newest first: on a phone the thing that just happened must not be a
          // scroll away.
          <div key={all.length - i} style={{ padding: "5px 0", borderBottom: `1px solid ${border}`, fontSize: 10.5, lineHeight: 1.45, color: colorOf(e.level), whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            <span style={{ color: dim, fontSize: 9 }}>{time(e.t)} </span>
            {e.text}
          </div>
        ))}
      </div>

      {copied === "manual" && (
        <textarea readOnly value={asText()} onFocus={(e) => e.target.select()}
          style={{ height: 90, margin: 10, fontSize: 10, background: isLight ? "#fff" : "#1a0a20", color: colorOf("log"), border: `1px solid ${border}`, borderRadius: 8, padding: 8, fontFamily: "inherit" }} />
      )}
    </div>
  );
}
