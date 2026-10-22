// src/utils/storyScroll.js
//
// Where the story panel scrolls after a render (v1.4.4 P10).
//
// It used to scroll to the end on every change, so a new round landed with its
// LAST line on screen and the player scrolled back up to find where it began.
// A round is read from the top: its stats box, then the story.
//
// `prev` and `next` are `{ loading, count }`: whether a round is generating, and
// how many messages the panel holds. Returns
//   "bottom" - a round is generating: show the choice bubble and the loading dots
//   "round"  - a round has just arrived: put the newest round's top at the top
//   null     - nothing arrived (an edited story was saved): leave the reader alone
//
// "Arrived" is either loading ending (a played, retried or failed round) or the
// count changing while nothing is loading (a save was loaded). An edit changes
// the content of one message and neither of those.
export function storyScrollAction(prev, next) {
  if (next.loading) return "bottom";
  if (prev.loading || prev.count !== next.count) return "round";
  return null;
}
