// src/config/chapters.js
// The story's four chapters (v1.4.4 P2), from Yuhan's design doc: qi-cheng-zhuan-he.
//
// ONE list, read by both places a chapter appears. getChapterByRound (the stats
// box) used to hardcode 6 / 14 / 24 while every world file carried its own
// from/to for the same boundaries, tied together by nothing - and section 3 printed
// all four phase lines every round without ever telling the model which one it
// was in. Now the stats box and the [Chapter] tail line derive from this table, so
// the two cannot disagree about which chapter a round belongs to.
//
// Everything here is the same in every world, which is why it is code and not
// world data. A world supplies only its texture for each chapter, keyed by `id`
// (world.phases), the way it keys its story modes.
//
// `label` is written as escapes so this file stays ASCII: U+8D77 U+627F U+8F6C U+5408.
// `goal` and `end` are English rule text from the design doc; {player} is filled
// with the player's name where they are rendered.

export const CHAPTERS = [
  {
    id: "start", label: "\u8D77", gloss: "setup", from: 1, to: 6,
    goal: "Distance at the start. {player} comes into the cast's orbit through work, position or chance - or, where her identity gives them a shared past, back into it - and they are polite, remember her, care briefly. Between two women the first pull is vaguer still, and often shows first as being a special kind of friend.",
    end: "It ends the first time a member reaches toward {player} of her own accord: says her name unprompted, or gets her out of a small difficulty in the lightest possible way.",
  },
  {
    id: "develop", label: "\u627F", gloss: "development", from: 7, to: 14,
    goal: "Trust built from repeated overlap, misunderstandings repaired and the small details of daily life. Affection rises and never runs away. Both begin to notice this is not ordinary friendship, and neither says so.",
    end: "It ends with a small crisis that makes both of them see the other is no passer-by.",
  },
  {
    id: "climax", label: "\u8F6C", gloss: "turn", from: 15, to: 24,
    goal: "What they have meets real pressure head on: talk, careers, a misunderstanding closing in. Between two women there is the added weight of facing the feeling itself and the outside world's view of it at the same time.",
    end: "It ends with a choice {player} has to make: deny it, step apart for a while, hold on in private, or risk going public.",
  },
  {
    id: "resolve", label: "\u5408", gloss: "resolution", from: 25, to: null,
    goal: "Each of them grows into her own choice.",
    end: "Where it can settle: a secret both can live with, love still waiting and unannounced, a separation forced by exposure, {player} leaving the orbit to build her own life, or a hard-won public relationship - not met gently, but they no longer pretend to be strangers.",
  },
];

export const CHAPTER_IDS = CHAPTERS.map((c) => c.id);

// The chapter a round belongs to. Rounds count from 1; anything below that is the
// first chapter rather than undefined, so a caller can never get no chapter.
export function chapterForRound(round) {
  return CHAPTERS.find((c) => round >= c.from && (c.to === null || round <= c.to)) || CHAPTERS[0];
}

export const chapterRange = (c) => (c.to === null ? `rounds ${c.from}+` : `rounds ${c.from}-${c.to}`);
