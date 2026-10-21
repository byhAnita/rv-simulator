// src/agent/eventSchedule.js
// Which of an identity's typical events the tail offers this round (v1.4.4 P3b).
//
// P3 offered every event whose stage had been reached, every round, forever. The
// live check (docs/V144_PLAN.md, "P3 live check") showed what that does: an event
// was staged the very round it unlocked, 4 of 4; a staged event echoed in the
// prose for six rounds running; and a first-meeting beat stayed on offer at the
// Confirmed stage. Nothing recorded that an event had happened, so nothing could
// stop it happening again.
//
// Pure, and kept out of mainAgent.js so it can be tested without a model. The
// state is `memory.events = {seen: {idx: round}, used: {idx: round}}`, where idx
// is the event's position in the identity's list and round is the 0-based round
// index (stats.week). `updateMemory` is its only writer.

// How many stages past its own an event stays on offer. A first-meeting beat
// belongs to the first two stages, not to Confirmed.
export const EVENT_WINDOW = 1;

// Rounds with no [Possible events] line after an event is staged. With the
// round-after-it-comes-due rule below, this caps events at about one in four
// rounds, and it stops the round after a staged event being built on the next one.
export const EVENT_COOLDOWN = 3;

// `events` is the identity's [{from, text}] list; `stageIdx` is the MAIN member's
// stage index; `state` may be absent (a save from before P3b). Returns indices.
//   due     - in the stage window now; recorded as seen by recordEvents
//   offered - what the tail lists this round: due, seen on an EARLIER round, never
//             staged, and not inside the cooldown of the last staged event
export function planEvents(events, stageIdx, state, round) {
  const list = Array.isArray(events) ? events : [];
  const seen = state?.seen || {};
  const used = state?.used || {};
  const due = [];
  list.forEach((ev, idx) => {
    if (stageIdx >= ev.from && stageIdx <= ev.from + EVENT_WINDOW) due.push(idx);
  });
  const usedRounds = Object.values(used).filter((r) => Number.isFinite(r));
  const lastUse = usedRounds.length ? Math.max(...usedRounds) : null;
  if (lastUse !== null && round - lastUse <= EVENT_COOLDOWN) return { due, offered: [] };
  // Offered from the round AFTER it first comes due: the model staged a new event
  // on the round it unlocked every time, which reads as a checklist being ticked.
  const offered = due.filter((idx) => !(idx in used) && Number.isFinite(seen[idx]) && seen[idx] < round);
  return { due, offered };
}

// The model's `event` field is untrusted text. It counts only as the number of an
// event that was actually OFFERED this round; anything else is ignored rather than
// recorded, because a wrong record would retire an event that never happened.
export function stagedEvent(value, offered) {
  if (value === null || value === undefined) return null;
  const m = String(value).match(/^\s*E?\s*(\d+)\s*$/i);
  if (!m) return null;
  const idx = Number(m[1]) - 1;
  return Array.isArray(offered) && offered.includes(idx) ? idx : null;
}

// The next state. `seen` keeps the FIRST round an event came due, so a stage that
// falls and rises again does not restart the delay; `used` records the staging.
export function recordEvents(state, due, used, round) {
  const seen = { ...(state?.seen || {}) };
  for (const idx of due || []) if (!(idx in seen)) seen[idx] = round;
  const next = { ...(state?.used || {}) };
  if (Number.isInteger(used)) next[used] = round;
  return { seen, used: next };
}
